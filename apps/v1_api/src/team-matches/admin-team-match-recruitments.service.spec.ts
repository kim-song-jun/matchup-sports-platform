import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
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
};
const assignDto = {
  clientCommandId: '00000000-0000-4000-8000-000000000002',
  homeApplicationId: '00000000-0000-4000-8000-000000000401',
  awayApplicationId: '00000000-0000-4000-8000-000000000402',
};

function application(id: string, teamId: string, name: string) {
  return {
    id,
    status: 'requested',
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
      v1IdempotencyRecord: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      v1TeamMatch: {
        create: jest.fn().mockResolvedValue({ id: 'team-match-1', status: 'recruiting' }),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-match-1',
          title: createDto.title,
          sportId,
          status: 'recruiting',
          hostTeamId: null,
          approvedApplicantTeamId: null,
          startAt: FUTURE,
          endAt: null,
          deadlineAt: DEADLINE,
          leagueId: null,
          tournamentId: null,
          competitionConfigVersionId: 'config-1',
          game: null,
          applications: [
            application(assignDto.homeApplicationId, 'team-home', '홈 FC'),
            application(assignDto.awayApplicationId, 'team-away', '원정 FC'),
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      v1TeamMatchApplication: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
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
      data: expect.objectContaining({ hostTeamId: null, approvedApplicantTeamId: null, status: 'recruiting' }),
    });
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
    expect(prisma.v1TeamSchedule.create).not.toHaveBeenCalled();
  });

  it('assigns two requested teams and only then creates the game and both schedules', async () => {
    await expect(service.assign(adminUser, 'team-match-1', assignDto)).resolves.toEqual(expect.objectContaining({
      teamMatchId: 'team-match-1',
      gameId: 'game-1',
      status: 'matched',
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

  it('rejects selecting the same application before opening a transaction', async () => {
    await expect(service.assign(adminUser, 'team-match-1', { ...assignDto, awayApplicationId: assignDto.homeApplicationId }))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back finalization when a selected application changes concurrently', async () => {
    prisma.v1TeamMatchApplication.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(service.assign(adminUser, 'team-match-1', assignDto)).rejects.toMatchObject({
      response: { code: 'TEAM_MATCH_APPLICATIONS_CHANGED' },
    });
    expect(prisma.v1TeamSchedule.create).not.toHaveBeenCalled();
  });

  it('propagates the support-admin permission denial before domain writes', async () => {
    adminContext.getMutationAdmin.mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' }),
    );
    await expect(service.create(adminUser, createDto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
  });
});
