/**
 * 어드민 "팀 상태 변경"의 보관(archived)은 팀장의 해체와 같은 경로를 지난다(Task 180 H3) —
 * 예전에는 상태값만 바꿔 예정 경기·신청·일정·채팅이 그대로 남았다.
 */
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const ADMIN_USER = { id: 'admin-user', email: 'a@t.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function setup(team: { status: string; deletedAt: Date | null }, options: { matched?: boolean } = {}) {
  const row = { id: 'team-1', name: '마포 FC', ...team };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    v1AdminUser: {
      findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', userId: ADMIN_USER.id, adminRole: 'ops', status: 'active', user: { accountStatus: 'active' } }),
    },
    v1Team: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn(({ data }) => Promise.resolve({ ...row, ...data })) },
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
    v1TeamSchedule: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1ScheduleGuestRecruitment: { updateMany: jest.fn() },
    v1ChatRoom: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ userId: 'owner-user' }, { userId: 'member-1' }]) },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }), createMany: jest.fn() },
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
  it('막는 조건이 있으면 409 TEAM_DISSOLVE_BLOCKED 이고 상태도 로그도 바꾸지 않는다', async () => {
    const { service, prisma } = setup({ status: 'active', deletedAt: null }, { matched: true });
    await expect(service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'archived', reason: '정책 위반' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'TEAM_DISSOLVE_BLOCKED' },
    });
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
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
    // 팀 전이는 어드민 감사 로그 한 벌만 남는다.
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

  it('활동 중 ↔ 운영 중지는 지금처럼 상태만 바꾼다', async () => {
    const { service, prisma } = setup({ status: 'active', deletedAt: null });
    await service.changeTeamStatus(ADMIN_USER, 'team-1', { status: 'suspended', reason: '신고 검토' });
    expect(prisma.v1Team.update).toHaveBeenCalledTimes(1);
    expect(prisma.v1Team.update).toHaveBeenCalledWith({ where: { id: 'team-1' }, data: { status: 'suspended' } });
    expect(prisma.v1ChatRoom.updateMany).not.toHaveBeenCalled();
  });
});
