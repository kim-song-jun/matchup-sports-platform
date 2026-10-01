/**
 * 어드민 "팀 상태 변경"의 보관(archived)은 팀장의 해체와 같은 경로를 지난다(Task 180 H3) —
 * 예전에는 상태값만 바꿔 예정 경기·신청·일정·채팅이 그대로 남았다.
 */
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const ADMIN_USER = { id: 'admin-user', email: 'a@t.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

type TeamRow = { id: string; name: string; sportId: string; regionId: string; status: string; deletedAt: Date | null };

/** sameNameTeams: 이 팀 말고 이미 있는 팀 — 이름 확인 조회가 where 의 종목·지역·자기 제외 조건대로 거른다. */
function setup(team: { status: string; deletedAt: Date | null }, options: { matched?: boolean; otherTeams?: TeamRow[] } = {}) {
  const row: TeamRow = { id: 'team-1', name: '마포 FC', sportId: 'sport-1', regionId: 'region-1', ...team };
  type NameWhere = { sportId: string; regionId: string; id?: { not: string } };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    v1AdminUser: {
      findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', userId: ADMIN_USER.id, adminRole: 'ops', status: 'active', user: { accountStatus: 'active' } }),
    },
    v1Team: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn(({ data }) => Promise.resolve({ ...row, ...data })),
      findMany: jest.fn(({ where }: { where: NameWhere }) =>
        Promise.resolve(
          [...(options.otherTeams ?? []), row].filter(
            (team) => team.sportId === where.sportId && team.regionId === where.regionId && (!where.id || team.id !== where.id.not),
          ),
        ),
      ),
    },
    v1Game: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMatch: {
      findMany: jest.fn().mockResolvedValue(
        options.matched
          ? [{ id: 'tm-1', title: '친선', status: 'matched', startAt: null, placeName: null, hostTeamId: 'team-1', approvedApplicantTeamId: 'other',
              leagueId: null, tournamentId: null, platformManaged: false, hostTeam: { name: '마포 FC' }, approvedApplicantTeam: { name: '합정' } }]
          : [],
      ),
      updateMany: jest.fn(),
    },
    v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMatchApplication: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1TeamJoinApplication: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1TeamInvitation: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1TeamInviteLink: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1TeamSchedule: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1ScheduleGuestRecruitment: { updateMany: jest.fn() },
    v1ChatRoom: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ userId: 'owner-user' }, { userId: 'member-1' }]) },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));
  const notifications = { emitNotificationToMany: jest.fn().mockResolvedValue(undefined), emitToManyDeferred: jest.fn(), markTeamInvitationCancelled: jest.fn() };
  const service = new AdminService(
    prisma as unknown as PrismaService,
    undefined,
    undefined,
    undefined,
    notifications as unknown as NotificationsService,
  );
  return { prisma, notifications, service };
}

describe('AdminService.changeTeamStatus — 보관은 해체 경로', () => {
  it('막는 조건이 있으면 409 TEAM_DISSOLVE_BLOCKED + details.blockers 이고 상태·정리·로그를 하나도 바꾸지 않는다', async () => {
    const { service, prisma, notifications } = setup({ status: 'active', deletedAt: null }, { matched: true });
    await expect(service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'archived', reason: '정책 위반' })).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'TEAM_DISSOLVE_BLOCKED',
        details: { blockers: [{ kind: 'matched_team_match', items: [{ id: 'tm-1', title: '친선', opponentName: '합정' }] }] },
      },
    });
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
    expect(prisma.v1ChatRoom.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
    expect(notifications.emitNotificationToMany).not.toHaveBeenCalled();
  });

  it('보관하면 해체 시각을 남기고 채팅방을 닫으며 팀원 전원(팀장 포함)에게 알린다', async () => {
    const { service, prisma, notifications } = setup({ status: 'active', deletedAt: null });
    await expect(service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'archived', reason: '정책 위반' })).resolves.toMatchObject({
      previousStatus: 'active',
      status: 'archived',
    });
    expect(prisma.v1Team.update.mock.calls[0][0].data).toMatchObject({ status: 'archived', deletedAt: expect.any(Date) });
    expect(prisma.v1ChatRoom.updateMany).toHaveBeenCalledWith({ where: { teamId: 'team-1' }, data: { status: 'archived' } });
    expect(notifications.emitNotificationToMany).toHaveBeenCalledWith(['owner-user', 'member-1'], 'team_dissolved', 'team-1', expect.any(String));
    // 팀 전이는 어드민 감사 로그 한 벌만 남는다 — actorType admin 이라 팀장 셀프 복구가 막힌다.
    expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.v1StatusChangeLog.create.mock.calls[0][0].data).toMatchObject({ actorType: 'admin', toStatus: 'archived' });
  });

  it('보관을 풀면 해체 시각을 지우고 채팅방을 다시 연다 — 기간 제한 없이', async () => {
    const { service, prisma, notifications } = setup({ status: 'archived', deletedAt: new Date('2025-01-01') });
    await service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'active', reason: '복구 요청' });
    expect(prisma.v1Team.update).toHaveBeenCalledWith({ where: { id: 'team-1' }, data: { status: 'active', deletedAt: null } });
    expect(prisma.v1ChatRoom.updateMany).toHaveBeenCalledWith({ where: { teamId: 'team-1' }, data: { status: 'active' } });
    expect(notifications.emitNotificationToMany).not.toHaveBeenCalled();
  });

  it('보관을 풀 때 같은 종목·지역에 같은 이름의 팀이 생겼으면 409 TEAM_RESTORE_NAME_TAKEN 이고 보관 그대로다', async () => {
    const { service, prisma } = setup(
      { status: 'archived', deletedAt: new Date('2026-09-20') },
      { otherTeams: [{ id: 'team-2', name: ' 마포 fc', sportId: 'sport-1', regionId: 'region-1', status: 'active', deletedAt: null }] },
    );
    await expect(service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'active', reason: '복구 요청' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'TEAM_RESTORE_NAME_TAKEN', message: '같은 종목·지역에 같은 이름의 팀이 있어 복구할 수 없어요.' },
    });
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
    expect(prisma.v1ChatRoom.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('같은 이름이 다른 지역에만, 같은 지역엔 다른 이름만 있으면 보관을 푼다', async () => {
    const { service, prisma } = setup(
      { status: 'archived', deletedAt: new Date('2026-09-20') },
      {
        otherTeams: [
          { id: 'team-2', name: '마포 FC', sportId: 'sport-1', regionId: 'region-2', status: 'active', deletedAt: null },
          { id: 'team-3', name: '합정 FC', sportId: 'sport-1', regionId: 'region-1', status: 'active', deletedAt: null },
        ],
      },
    );
    await service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'active', reason: '복구 요청' });
    expect(prisma.v1Team.update).toHaveBeenCalledWith({ where: { id: 'team-1' }, data: { status: 'active', deletedAt: null } });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
  });

  it('활동 중 ↔ 운영 중지는 지금처럼 상태만 바꾼다', async () => {
    const { service, prisma } = setup({ status: 'active', deletedAt: null });
    await service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'suspended', reason: '신고 검토' });
    expect(prisma.v1Team.update).toHaveBeenCalledTimes(1);
    expect(prisma.v1Team.update).toHaveBeenCalledWith({ where: { id: 'team-1' }, data: { status: 'suspended' } });
    expect(prisma.v1ChatRoom.updateMany).not.toHaveBeenCalled();
  });
});
