import { ForbiddenException } from '@nestjs/common';
import { AdminTeamMatchRecruitmentsService } from './admin-team-match-recruitments.service';

const adminUser = {
  id: 'admin-user',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const sportId = '00000000-0000-4000-8000-000000000301';
const regionId = '00000000-0000-4000-8000-000000000201';
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const DEADLINE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const createDto = {
  clientCommandId: '00000000-0000-4000-8000-000000000001',
  sportId,
  regionId,
  title: '관리자 모집 친선전',
  startsAt: FUTURE.toISOString(),
  deadlineAt: DEADLINE.toISOString(),
  manualPlaceName: '잠실 풋살장',
  imageUrl: '/uploads/admin-team-match.webp',
  costNote: '총 90,000원 · 상대팀 30,000원',
  minLevelCode: 'intermediate',
  maxLevelCode: 'intermediate',
  genderRule: '성별 무관',
  matchFormat: '5:5',
  matchStyle: ['친선', '매너 중시'],
  uniformColor: '파랑',
};
const approveDto = {
  clientCommandId: '00000000-0000-4000-8000-000000000002',
};
const homeApplicationId = '00000000-0000-4000-8000-000000000401';
const awayApplicationId = '00000000-0000-4000-8000-000000000402';

function application(id: string, teamId: string, name: string, status = 'requested') {
  return {
    id,
    applicantTeamId: teamId,
    status,
    reviewedAt: status === 'approved' ? new Date('2026-08-01T00:00:00.000Z') : null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    applicantTeam: {
      id: teamId,
      name,
      sportId,
      status: 'active',
      deletedAt: null,
      memberships: [{
        id: `membership-${teamId}`,
        userId: `user-${teamId}`,
        role: 'owner',
        user: { profile: { nickname: `${name} 팀장`, displayName: null } },
      }],
    },
  };
}

describe('AdminTeamMatchRecruitmentsService', () => {
  let prisma: any;
  let adminContext: any;
  let games: any;
  let notifications: any;
  let service: AdminTeamMatchRecruitmentsService;

  beforeEach(() => {
    prisma = {
      v1Sport: { findFirst: jest.fn().mockResolvedValue({ id: sportId, code: 'futsal' }) },
      v1Region: { findFirst: jest.fn().mockResolvedValue({ id: regionId }) },
      v1CompetitionConfigVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'config-1' }) },
      v1SportLevel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'level-intermediate', code: 'intermediate', sortOrder: 3 },
        ]),
      },
      v1IdempotencyRecord: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      v1TeamMatch: {
        create: jest.fn().mockResolvedValue({ id: 'team-match-1', status: 'recruiting' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-08-02T00:00:00.000Z') }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-match-1',
          title: createDto.title,
          sportId,
          status: 'recruiting',
          hostTeamId: null,
          platformManaged: true,
          approvedApplicantTeamId: null,
          startAt: FUTURE,
          endAt: null,
          deadlineAt: DEADLINE,
          leagueId: null,
          tournamentId: null,
          competitionConfigVersionId: 'config-1',
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          game: null,
          applications: [
            application(homeApplicationId, 'team-home', '홈 FC'),
            application(awayApplicationId, 'team-away', '원정 FC'),
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      v1TeamMatchApplication: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      v1TeamSchedule: { create: jest.fn().mockResolvedValue({}) },
      v1StatusChangeLog: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'team-match-1' }]),
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    };
    adminContext = {
      getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-record-1', userId: adminUser.id, adminRole: 'ops', status: 'active' }),
      logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: 'status-log-1' }),
    };
    games = { createFromSourceInTransaction: jest.fn().mockResolvedValue({ gameId: 'game-1' }) };
    notifications = { emitToManyDeferred: jest.fn() };
    service = new AdminTeamMatchRecruitmentsService(prisma, adminContext, games, notifications);
  });

  it('opens a platform recruitment without assigning either team or creating a game', async () => {
    await expect(service.create(adminUser, createDto)).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'recruiting',
      detailRoute: '/admin/team-matches/team-match-1',
      replayed: false,
    });
    expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hostTeamId: null,
        platformManaged: true,
        approvedApplicantTeamId: null,
        status: 'recruiting',
        imageUrl: '/uploads/admin-team-match.webp',
        costNote: '총 90,000원 · 상대팀 30,000원',
        minSportLevelId: 'level-intermediate',
        maxSportLevelId: 'level-intermediate',
        genderRule: '성별 무관',
        matchFormat: '5:5',
        matchStyle: ['친선', '매너 중시'],
        uniformColor: '파랑',
      }),
    });
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
    expect(prisma.v1TeamSchedule.create).not.toHaveBeenCalled();
  });

  it('keeps the deadline optional like regular team match recruitment', async () => {
    await service.create(adminUser, { ...createDto, deadlineAt: undefined });

    expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deadlineAt: null }),
    });
  });
  it('approves the first application without creating a game or schedules', async () => {
    await expect(service.approveApplication(adminUser, 'team-match-1', homeApplicationId, approveDto)).resolves.toEqual(expect.objectContaining({
      teamMatchId: 'team-match-1',
      applicationId: homeApplicationId,
      applicantTeamId: 'team-home',
      gameId: null,
      teamMatchStatus: 'recruiting',
      approvedCount: 1,
      replayed: false,
    }));
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamSchedule.create).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'team_match.application.approve', targetId: homeApplicationId }),
      prisma,
    );
  });

  it('approves the second application and then creates the game and both schedules', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValueOnce({
      ...await prisma.v1TeamMatch.findFirst(),
      applications: [
        application(homeApplicationId, 'team-home', '홈 FC', 'approved'),
        application(awayApplicationId, 'team-away', '원정 FC'),
      ],
    });

    await expect(service.approveApplication(adminUser, 'team-match-1', awayApplicationId, approveDto)).resolves.toEqual(expect.objectContaining({
      teamMatchId: 'team-match-1',
      applicationId: awayApplicationId,
      gameId: 'game-1',
      teamMatchStatus: 'matched',
      approvedCount: 2,
      homeTeamId: 'team-home',
      awayTeamId: 'team-away',
      replayed: false,
    }));
    expect(games.createFromSourceInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ sides: [expect.objectContaining({ teamId: 'team-home' }), expect.objectContaining({ teamId: 'team-away' })] }),
      expect.objectContaining({ actor: expect.objectContaining({ role: 'platform_ops' }) }),
    );
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith({
      where: { id: 'team-match-1' },
      data: { hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', status: 'matched' },
    });
    expect(prisma.v1TeamSchedule.create).toHaveBeenCalledTimes(2);
  });

  it('rejects approving an application for a match outside the platform flow', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValueOnce({
      ...await prisma.v1TeamMatch.findFirst(),
      platformManaged: false,
    });

    await expect(service.approveApplication(adminUser, 'team-match-1', homeApplicationId, approveDto)).rejects.toMatchObject({
      response: { code: 'TEAM_MATCH_NOT_PLATFORM_RECRUITING' },
    });
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
  });

  it('rolls back approval when the selected application changes concurrently', async () => {
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.approveApplication(adminUser, 'team-match-1', homeApplicationId, approveDto)).rejects.toMatchObject({
      response: { code: 'TEAM_MATCH_APPLICATIONS_CHANGED' },
    });
    expect(prisma.v1TeamSchedule.create).not.toHaveBeenCalled();
  });

  it('rejects a requested application with an audit trail and team notification', async () => {
    await expect(service.rejectApplication(adminUser, 'team-match-1', homeApplicationId, {
      clientCommandId: '00000000-0000-4000-8000-000000000003',
      reason: '참가 조건이 맞지 않아요.',
    })).resolves.toEqual(expect.objectContaining({
      applicationId: homeApplicationId,
      applicantTeamId: 'team-home',
      applicationStatus: 'rejected',
      teamMatchStatus: 'recruiting',
      replayed: false,
    }));
    expect(prisma.v1TeamMatchApplication.updateMany).toHaveBeenCalledWith({
      where: { id: homeApplicationId, teamMatchId: 'team-match-1', status: 'requested' },
      data: expect.objectContaining({ status: 'rejected', reviewedByUserId: adminUser.id }),
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'team_match.application.reject', reason: '참가 조건이 맞지 않아요.' }),
      prisma,
    );
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function),
      'team_match_application_rejected',
      'team-match-1',
      expect.stringContaining('참가 조건이 맞지 않아요.'),
    );
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
  });

  it('does not reject an already approved application', async () => {
    prisma.v1TeamMatch.findFirst.mockResolvedValueOnce({
      ...await prisma.v1TeamMatch.findFirst(),
      applications: [application(homeApplicationId, 'team-home', '홈 FC', 'approved')],
    });
    await expect(service.rejectApplication(adminUser, 'team-match-1', homeApplicationId, {
      clientCommandId: '00000000-0000-4000-8000-000000000003',
      reason: '거절 사유',
    })).rejects.toMatchObject({ response: { code: 'TEAM_MATCH_APPLICATIONS_CHANGED' } });
  });

  it('updates a recruiting platform match with optimistic concurrency', async () => {
    await expect(service.update(adminUser, 'team-match-1', {
      ...createDto,
      clientCommandId: '00000000-0000-4000-8000-000000000004',
      version: '2026-08-01T00:00:00.000Z',
      title: '수정한 관리자 모집 친선전',
    })).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'recruiting',
      version: '2026-08-02T00:00:00.000Z',
      detailRoute: '/admin/team-matches/team-match-1',
    });
    expect(prisma.v1TeamMatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'team-match-1', updatedAt: new Date('2026-08-01T00:00:00.000Z') }),
      data: expect.objectContaining({ title: '수정한 관리자 모집 친선전', regionId }),
    }));
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'team_match.recruitment.update' }),
      prisma,
    );
  });

  it('rejects an update made from a stale detail version', async () => {
    await expect(service.update(adminUser, 'team-match-1', {
      ...createDto,
      clientCommandId: '00000000-0000-4000-8000-000000000004',
      version: '2026-07-31T00:00:00.000Z',
    })).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
    expect(prisma.v1TeamMatch.updateMany).not.toHaveBeenCalled();
  });

  it('propagates the support-admin permission denial before domain writes', async () => {
    adminContext.getMutationAdmin.mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' }),
    );
    await expect(service.create(adminUser, createDto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
  });
});
