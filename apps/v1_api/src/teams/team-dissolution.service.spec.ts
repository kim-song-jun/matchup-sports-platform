/**
 * 팀 해체·복구 서비스 계약. where 절이 맞는지는 통합 스펙
 * (test/teams/team-dissolution.integration-spec.ts)이 실제 DB 로 보고, 여기서는
 * 권한·확인 문구·정리 대상 분기·알림 수신자·복구 기간을 본다.
 */
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamDissolutionService } from './team-dissolution.service';

const OWNER = 'owner-user';
const TEAM = 'team-1';
const FUTURE = new Date('2026-10-10T11:00:00.000Z');
const PAST = new Date('2026-09-01T11:00:00.000Z');
const user = (id: string) => ({ id, email: `${id}@t.v1`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, title: `${id} 경기`, status: 'recruiting', startAt: FUTURE, placeName: null, hostTeamId: TEAM,
    approvedApplicantTeamId: null, leagueId: null, tournamentId: null, platformManaged: false,
    hostTeam: { name: '마포 FC' }, approvedApplicantTeam: null, ...overrides,
  };
}

function setup(state: {
  team?: Record<string, unknown> | null;
  roles?: Record<string, string>;
  candidates?: unknown[];
  members?: string[];
} = {}) {
  const team = state.team === undefined ? { id: TEAM, name: '마포 FC', status: 'active', deletedAt: null } : state.team;
  const roles = state.roles ?? { [OWNER]: 'owner', 'manager-1': 'manager', 'member-1': 'member' };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    v1Team: { findUnique: jest.fn().mockResolvedValue(team), update: jest.fn().mockResolvedValue(team) },
    v1TeamMembership: {
      findFirst: jest.fn(({ where }) => Promise.resolve(roles[where.userId] === where.role ? { id: `m-${where.userId}` } : null)),
      findMany: jest.fn().mockResolvedValue((state.members ?? Object.keys(roles)).map((userId) => ({ userId }))),
      count: jest.fn().mockResolvedValue(2),
    },
    v1Game: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMatch: { findMany: jest.fn().mockResolvedValue(state.candidates ?? []), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    v1TeamMatchApplication: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          where.teamMatchId === 'tm-open'
            ? [{ applicantTeamId: 'team-a' }, { applicantTeamId: 'team-a' }]
            : where.applicantTeamId === TEAM
              ? [{ id: 'app-out', teamMatchId: 'tm-other', teamMatch: { title: '남의 경기', hostTeamId: 'team-host' } }]
              : [],
        ),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamJoinApplication: {
      findMany: jest.fn().mockResolvedValue([{ id: 'ja-1', applicantUserId: 'applicant-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    v1TeamInvitation: {
      findMany: jest.fn().mockResolvedValue([{ id: 'inv-1', invitedUserId: 'invitee-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    v1TeamSchedule: {
      findMany: jest.fn(({ where }) => Promise.resolve(where.teamId ? [{ id: 'sch-1', title: '연습', startAt: FUTURE, teamMatchId: null }] : [])),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    v1ScheduleGuestRecruitment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1ChatRoom: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    v1StatusChangeLog: { create: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));
  const notifications = {
    emitNotificationToMany: jest.fn().mockResolvedValue(undefined),
    emitToManyDeferred: jest.fn(),
    markTeamInvitationCancelled: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TeamDissolutionService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService);
  return { prisma, notifications, service };
}

describe('TeamDissolutionService 권한', () => {
  it.each(['manager-1', 'member-1', 'stranger'])('%s 는 미리보기·해체·복구 모두 403', async (userId) => {
    const { service, prisma } = setup();
    for (const call of [
      () => service.preview(user(userId), TEAM),
      () => service.dissolve(user(userId), TEAM, { confirmTeamName: '마포 FC' }),
      () => service.restore(user(userId), TEAM),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    }
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
  });

  it('없는 팀은 404 — 권한을 보기 전에 가른다', async () => {
    const { service } = setup({ team: null });
    await expect(service.preview(user(OWNER), TEAM)).rejects.toMatchObject({ status: 404 });
  });
});

describe('TeamDissolutionService.dissolve', () => {
  it('팀 이름이 다르면 400 TEAM_NAME_MISMATCH 이고 아무것도 바꾸지 않는다(앞뒤 공백은 무시)', async () => {
    const { service, prisma } = setup();
    await expect(service.dissolve(user(OWNER), TEAM, { confirmTeamName: '마포FC' })).rejects.toMatchObject({
      status: 400,
      response: { code: 'TEAM_NAME_MISMATCH' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(service.dissolve(user(OWNER), TEAM, { confirmTeamName: '  마포 FC ' })).resolves.toMatchObject({ status: 'archived' });
  });

  it('상대가 정해진 팀매치가 있으면 409 TEAM_DISSOLVE_BLOCKED + 항목, 모집 중 경기도 취소하지 않는다', async () => {
    const { service, prisma } = setup({
      candidates: [candidate('tm-open'), candidate('tm-matched', { status: 'matched', approvedApplicantTeamId: 'other', approvedApplicantTeam: { name: '합정' } })],
    });
    await expect(service.dissolve(user(OWNER), TEAM, { confirmTeamName: '마포 FC' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'TEAM_DISSOLVE_BLOCKED', details: { blockers: [{ kind: 'matched_team_match', items: [{ id: 'tm-matched', opponentName: '합정' }] }] } },
    });
    expect(prisma.v1TeamMatch.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
  });

  it('이미 해체된 팀은 409 TEAM_ALREADY_DISSOLVED', async () => {
    const { service } = setup({ team: { id: TEAM, name: '마포 FC', status: 'archived', deletedAt: PAST } });
    await expect(service.dissolve(user(OWNER), TEAM, { confirmTeamName: '마포 FC' })).rejects.toMatchObject({
      response: { code: 'TEAM_ALREADY_DISSOLVED' },
    });
  });
});

describe('TeamDissolutionService.dissolve — 자동 정리와 알림', () => {
  const candidates = [
    candidate('tm-open'),
    candidate('tm-closed', { status: 'closed' }),
    candidate('tm-old', { startAt: PAST }),
    candidate('tm-league', { leagueId: 'league-1' }),
  ];

  it('앞으로 있을 모집 중·마감 팀매치만 취소하고 지난 경기·리그 대진은 두며, 신청·초대·일정·채팅을 함께 닫는다', async () => {
    const { service, prisma } = setup({ candidates });
    await service.dissolve(user(OWNER), TEAM, { confirmTeamName: '마포 FC' });

    const cancelledIds = prisma.v1TeamMatch.updateMany.mock.calls.map(([args]) => args.where.id);
    expect(cancelledIds).toEqual(['tm-open', 'tm-closed']);
    expect(prisma.v1TeamMatch.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'cancelled' });
    expect(prisma.v1TeamMatchApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['app-out'] }, status: 'requested' }, data: expect.objectContaining({ status: 'withdrawn' }) }),
    );
    expect(prisma.v1TeamJoinApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'expired' }) }),
    );
    expect(prisma.v1TeamInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'cancelled' } }));
    expect(prisma.v1TeamSchedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['sch-1'] }, state: 'SCHEDULED' }, data: expect.objectContaining({ state: 'CANCELLED' }) }),
    );
    expect(prisma.v1ChatRoom.updateMany).toHaveBeenCalledWith({ where: { teamId: TEAM }, data: { status: 'archived' } });
    const teamUpdate = prisma.v1Team.update.mock.calls[0][0];
    expect(teamUpdate.data.status).toBe('archived');
    expect(teamUpdate.data.deletedAt).toBeInstanceOf(Date);
  });

  it('팀원(본인 제외)·신청자·상대 팀 운영진·초대받은 사람에게 알린다', async () => {
    const { service, notifications } = setup({ candidates });
    const result = await service.dissolve(user(OWNER), TEAM, { confirmTeamName: '마포 FC' });

    const dissolvedCalls = notifications.emitNotificationToMany.mock.calls.filter(([, type]) => type === 'team_dissolved');
    expect(dissolvedCalls.map(([ids]) => ids)).toEqual([['manager-1', 'member-1'], ['applicant-1']]);
    expect(dissolvedCalls[0][2]).toBe(TEAM);
    expect(result.notifiedMemberCount).toBe(2);
    // 신청 팀이 없던 모집 마감 경기에는 보낼 곳이 없다.
    expect(notifications.emitToManyDeferred.mock.calls.map(([, type, targetId]) => [type, targetId])).toEqual([
      ['team_match_cancelled', 'tm-open'],
      ['team_match_application_withdrawn', 'tm-other'],
    ]);
    expect(notifications.markTeamInvitationCancelled).toHaveBeenCalledWith('invitee-1', TEAM, '마포 FC');
  });

  it('혼자 남은 팀은 해체 알림을 보낼 팀원이 없다', async () => {
    const { service, notifications } = setup({ roles: { [OWNER]: 'owner' }, members: [OWNER] });
    await service.dissolve(user(OWNER), TEAM, { confirmTeamName: '마포 FC' });
    expect(notifications.emitNotificationToMany.mock.calls[0][0]).toEqual([]);
  });
});

describe('TeamDissolutionService.restore — 30일 경계', () => {
  const dissolvedAt = new Date('2026-09-01T09:00:00.000Z');
  const archived = { id: TEAM, name: '마포 FC', status: 'archived', deletedAt: dissolvedAt };
  afterEach(() => jest.useRealTimers());

  it('정확히 30일째에는 복구되고, 취소된 경기·일정은 되살리지 않으며 채팅방만 다시 연다', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T09:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, prisma } = setup({ team: archived });
    await expect(service.restore(user(OWNER), TEAM)).resolves.toMatchObject({ status: 'active' });
    expect(prisma.v1Team.update).toHaveBeenCalledWith({ where: { id: TEAM }, data: { status: 'active', deletedAt: null } });
    expect(prisma.v1ChatRoom.updateMany).toHaveBeenCalledWith({ where: { teamId: TEAM }, data: { status: 'active' } });
    expect(prisma.v1TeamMatch.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1TeamSchedule.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1TeamJoinApplication.updateMany).not.toHaveBeenCalled();
  });

  it('30일에서 1ms 라도 지나면 409 TEAM_RESTORE_WINDOW_EXPIRED', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T09:00:00.001Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, prisma } = setup({ team: archived });
    await expect(service.restore(user(OWNER), TEAM)).rejects.toMatchObject({ status: 409, response: { code: 'TEAM_RESTORE_WINDOW_EXPIRED' } });
    expect(prisma.v1Team.update).not.toHaveBeenCalled();
  });

  it('해체되지 않은 팀은 409 TEAM_NOT_DISSOLVED', async () => {
    const { service } = setup();
    await expect(service.restore(user(OWNER), TEAM)).rejects.toMatchObject({ response: { code: 'TEAM_NOT_DISSOLVED' } });
  });
});

describe('TeamDissolutionService.myDissolvedTeams', () => {
  it('내가 팀장인 보관 팀을 최근 해체 순으로, 기간이 지난 팀은 복구 불가로 준다', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-01T00:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, prisma } = setup();
    const row = (id: string, deletedAt: string | null) => ({
      team: { id, name: id, memberCount: 3, deletedAt: deletedAt ? new Date(deletedAt) : null, sport: { name: '풋살' }, profile: null },
    });
    prisma.v1TeamMembership.findMany.mockResolvedValueOnce([
      row('old', '2026-08-01T00:00:00.000Z'),
      row('recent', '2026-09-25T00:00:00.000Z'),
      row('legacy', null),
    ]);
    const result = await service.myDissolvedTeams(user(OWNER));
    jest.useRealTimers();
    expect(result.items.map((item) => [item.teamId, item.canRestore])).toEqual([
      ['recent', true],
      ['old', false],
      ['legacy', false],
    ]);
    expect(prisma.v1TeamMembership.findMany.mock.calls[0][0].where).toEqual({
      userId: OWNER, status: 'active', role: 'owner', team: { status: 'archived' },
    });
  });
});
