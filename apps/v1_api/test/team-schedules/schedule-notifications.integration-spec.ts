import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ScheduleReminderService } from '../../src/jobs/schedule-reminders/schedule-reminder.service';
import type { GameOperationClaim } from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  SCHEDULE_CANCELLED_NOTIFICATION_TYPE,
  SCHEDULE_CREATED_NOTIFICATION_TYPE,
  TeamSchedulesService,
} from '../../src/team-schedules/team-schedules.service';

/**
 * Task 180 H1-schedule-created·cancelled — 일정 생성·취소가 같은 트랜잭션에 outbox 행을 남기고,
 * 워커 핸들러가 그 행으로 발송 시점의 팀원(만든·취소한 본인, '불참' 응답자 제외)에게 알림을 쓰는지.
 */
const prisma = new PrismaService();
const service = new TeamSchedulesService(prisma);
const handlers = new ScheduleReminderService({} as never);

const ids = {
  team: randomUUID(),
  region: randomUUID(),
  owner: randomUUID(),
  manager: randomUUID(),
  going: randomUUID(),
  notGoing: randomUUID(),
};

const authUser = (id: string) => ({ id, email: `${id}@example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });

async function runOutbox(businessKey: string, run: (claim: GameOperationClaim, tx: Prisma.TransactionClient) => Promise<void>) {
  const row = await prisma.v1OutboxEvent.findUniqueOrThrow({ where: { businessKey } });
  const claim: GameOperationClaim = { ...row, leaseOwner: 'spec', leaseUntil: new Date(), afterCommit: [] };
  await prisma.$transaction((tx) => run(claim, tx));
  return row;
}

async function noticesFor(scheduleId: string, title: string) {
  const rows = await prisma.v1Notification.findMany({ where: { targetId: `${ids.team}:${scheduleId}`, title }, select: { recipientUserId: true, body: true, deepLink: true } });
  return rows;
}

describe('Task 180 H1 — 일정 생성·취소 알림(outbox → 워커 핸들러)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for schedule notification integration verification');
    await prisma.$connect();
    const users = [ids.owner, ids.manager, ids.going, ids.notGoing];
    await prisma.v1User.createMany({
      data: users.map((id) => ({ id, email: `${id}@example.test`, phone: `010${id.replace(/-/g, '').slice(0, 8)}`, accountStatus: 'active', onboardingStatus: 'completed' })),
    });
    await prisma.v1UserProfile.createMany({ data: users.map((userId, index) => ({ userId, nickname: `알림${index}` })) });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'football' }, update: {}, create: { code: 'football', name: 'H1 Football' }, select: { id: true } });
    await prisma.v1Region.create({ data: { id: ids.region, code: `H1_SCHEDULE_NOTICE_${ids.region.slice(0, 8)}`, name: 'H1 Region', level: 2 } });
    await prisma.v1Team.create({ data: { id: ids.team, ownerUserId: ids.owner, sportId: sport.id, regionId: ids.region, name: '마포 FC' } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.team, userId: ids.owner, role: 'owner', status: 'active' },
        { teamId: ids.team, userId: ids.manager, role: 'manager', status: 'active' },
        { teamId: ids.team, userId: ids.going, role: 'member', status: 'active' },
        { teamId: ids.team, userId: ids.notGoing, role: 'member', status: 'active' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('만든 사람을 뺀 팀원에게 새 일정 알림, 취소한 사람·불참 응답자를 뺀 팀원에게 취소 알림을 쓴다', async () => {
    const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
    const created = (await service.create(
      authUser(ids.owner),
      ids.team,
      { title: '화요일 정기 훈련', type: 'TRAINING', startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + 2 * 60 * 60 * 1_000).toISOString(), timezone: 'Asia/Seoul' },
      `h1-created-${randomUUID()}`,
    )) as { id: string };

    const createdRow = await runOutbox(`schedule:${created.id}:created-notification`, (claim, tx) => handlers.scheduleCreatedNotificationHandler(claim, tx));
    expect(createdRow).toMatchObject({ type: SCHEDULE_CREATED_NOTIFICATION_TYPE, payload: { scheduleId: created.id, actorUserId: ids.owner } });
    const createdNotices = await noticesFor(created.id, '새 일정이 올라왔어요');
    expect(createdNotices.map((row) => row.recipientUserId).sort()).toEqual([ids.manager, ids.going, ids.notGoing].sort());
    expect(createdNotices[0].deepLink).toBe(`/teams/${ids.team}/schedules/${created.id}`);

    await prisma.v1ScheduleAttendance.create({ data: { scheduleId: created.id, userId: ids.notGoing, status: 'NOT_GOING' } });
    await service.cancel(authUser(ids.manager), ids.team, created.id, { expectedVersion: 0, cancelReason: '우천으로 취소해요.' }, `h1-cancel-${randomUUID()}`);

    const cancelKey = `schedule:${created.id}:cancelled-notification`;
    const cancelledRow = await runOutbox(cancelKey, (claim, tx) => handlers.scheduleCancelledNotificationHandler(claim, tx));
    expect(cancelledRow).toMatchObject({ type: SCHEDULE_CANCELLED_NOTIFICATION_TYPE, payload: { scheduleId: created.id, actorUserId: ids.manager } });
    const cancelled = await noticesFor(created.id, '일정이 취소됐어요');
    expect(cancelled.map((row) => row.recipientUserId).sort()).toEqual([ids.owner, ids.going].sort());
    expect(cancelled[0].body).toContain('· 우천으로 취소해요.');

    // 같은 outbox 행을 다시 처리해도(재시도) 알림이 늘지 않는다.
    await runOutbox(cancelKey, (claim, tx) => handlers.scheduleCancelledNotificationHandler(claim, tx));
    expect(await noticesFor(created.id, '일정이 취소됐어요')).toHaveLength(2);
  });
});
