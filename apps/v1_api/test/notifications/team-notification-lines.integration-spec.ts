import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { NotificationsService } from '../../src/notifications/notifications.service';
import type { RealtimeNotifierPort } from '../../src/notifications/realtime-notifier.port';
import type { WebPushService } from '../../src/notifications/web-push.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 180 H1-join-burst · W2-V7 — 실제 DB 에서 businessKey unique·startsWith·createdAt 비교가 계약대로 도는지.
 * 가입 신청은 팀·팀장마다 한 줄로 모이고, 초대 취소는 그 초대가 보내진 뒤의 도착 알림만 바꾼다.
 */
const prisma = new PrismaService();
const pushedTo: string[] = [];
const service = new NotificationsService(
  prisma,
  { emitToUser: () => undefined } as unknown as RealtimeNotifierPort,
  { sendToUser: async (userId: string) => void pushedTo.push(userId) } as unknown as WebPushService,
  { warn: () => undefined } as unknown as PinoLogger,
);

const ids = {
  region: randomUUID(),
  team: randomUUID(),
  owner: randomUUID(),
  applicants: [randomUUID(), randomUUID(), randomUUID()],
  invitee: randomUUID(),
  acceptors: [randomUUID(), randomUUID()],
};

describe('Task 180 H1 — 팀 알림 한 줄·초대 알림 범위(실제 DB)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for team notification line integration verification');
    await prisma.$connect();
    const people = [ids.owner, ...ids.applicants, ids.invitee, ...ids.acceptors];
    await prisma.v1User.createMany({ data: people.map((id) => ({ id, email: `${id}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' })) });
    await prisma.v1UserProfile.createMany({ data: people.map((userId, index) => ({ userId, nickname: `알림${index}` })) });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'football' }, update: {}, create: { code: 'football', name: 'H1 football' }, select: { id: true } });
    await prisma.v1Region.create({ data: { id: ids.region, code: `H1_LINES_${ids.region.slice(0, 8)}`, name: 'H1 lines', level: 2 } });
    await prisma.v1Team.create({ data: { id: ids.team, ownerUserId: ids.owner, sportId: sport.id, regionId: ids.region, name: '마포 FC' } });
    await prisma.v1TeamMembership.create({ data: { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 발송 시각이 한낮이 아니면 푸시 판정이 갈린다 — 이 스펙은 푸시 횟수 대신 알림함 줄만 본다.
  it('가입 신청이 몰려도 팀장에게는 한 줄이고, 처리해 대기가 0 이 되면 그 줄은 읽음이 된다', async () => {
    for (const applicantUserId of ids.applicants) {
      await prisma.v1TeamJoinApplication.create({ data: { teamId: ids.team, applicantUserId, status: 'requested' } });
      await service.refreshTeamJoinApplicationsLine(ids.team, 'arrival');
    }
    const lines = await prisma.v1Notification.findMany({ where: { recipientUserId: ids.owner, targetId: ids.team } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ businessKey: `team-join-pending:${ids.team}:${ids.owner}`, title: '가입 신청 3건이 기다려요', readAt: null });

    await prisma.v1TeamJoinApplication.updateMany({ where: { teamId: ids.team }, data: { status: 'rejected' } });
    await service.refreshTeamJoinApplicationsLine(ids.team, 'recount');
    const after = await prisma.v1Notification.findUniqueOrThrow({ where: { id: lines[0].id } });
    expect(after.readAt).not.toBeNull();
  });

  it('초대 취소는 그 초대가 보내진 뒤의 도착 알림만 바꾸고, 같은 팀의 옛 초대 알림은 그대로 둔다', async () => {
    const inbox = { recipientUserId: ids.invitee, targetType: 'team' as const, targetId: ids.team, deepLink: '/my/invitations', title: '팀 초대가 도착했어요' };
    const older = await prisma.v1Notification.create({ data: { ...inbox, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000) } });
    const invitation = await prisma.v1TeamInvitation.create({ data: { teamId: ids.team, invitedUserId: ids.invitee, invitedByUserId: ids.owner, status: 'pending' } });
    const current = await prisma.v1Notification.create({ data: inbox });

    await service.markTeamInvitationCancelled(ids.invitee, ids.team, '마포 FC', invitation.updatedAt);

    expect(await prisma.v1Notification.findUniqueOrThrow({ where: { id: current.id } })).toMatchObject({ title: '팀 초대가 취소됐어요', deepLink: `/teams/${ids.team}` });
    expect(await prisma.v1Notification.findUniqueOrThrow({ where: { id: older.id } })).toMatchObject({ title: '팀 초대가 도착했어요', readAt: null });
  });

  it('서로 다른 초대 두 건이 동시에 수락돼도 초대한 사람에게는 "초대 수락" 한 줄·푸시 1회다', async () => {
    // 밤이면 푸시를 보류한다 — 실행 시각과 무관하게 횟수를 보려고 야간 판정만 낮으로 고정한다.
    const nightCheck = jest.spyOn(service as unknown as { pushAllowedNow: () => Promise<boolean> }, 'pushAllowedNow').mockResolvedValue(true);
    const respondedAt = new Date();
    const accepted = await Promise.all(
      ids.acceptors.map((invitedUserId) =>
        prisma.v1TeamInvitation.create({ data: { teamId: ids.team, invitedUserId, invitedByUserId: ids.owner, status: 'accepted', respondedAt } }),
      ),
    );
    pushedTo.length = 0;

    await Promise.all(
      accepted.map((invitation) =>
        service.recordTeamInvitationAccepted({ inviterUserId: ids.owner, teamId: ids.team, invitationId: invitation.id, acceptedAt: respondedAt }),
      ),
    );
    nightCheck.mockRestore();

    const lines = await prisma.v1Notification.findMany({
      where: { recipientUserId: ids.owner, businessKey: { startsWith: `team-invite-accepted:${ids.team}:${ids.owner}:` } },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].title).toMatch(/님 외 1명이 초대를 수락했어요$/);
    expect(pushedTo).toEqual([ids.owner]);
  });
});
