import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { AdminAssignedTeamMatchesService } from './admin-assigned-team-matches.service';

const adminUser = {
  id: 'admin-user',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const dto = {
  clientCommandId: '00000000-0000-4000-8000-000000000001',
  homeTeamId: '00000000-0000-4000-8000-000000000101',
  awayTeamId: '00000000-0000-4000-8000-000000000102',
  regionId: '00000000-0000-4000-8000-000000000201',
  title: '관리자 배정 친선전',
  startsAt: FUTURE.toISOString(),
  manualPlaceName: '잠실 풋살장',
};

function team(id: string, name: string, sportId = 'sport-futsal') {
  return {
    id,
    name,
    sportId,
    memberships: [
      {
        id: `membership-${id}`,
        userId: `user-${id}`,
        role: 'owner',
        user: { profile: { nickname: `${name} 팀장`, displayName: null } },
      },
    ],
  };
}

describe('AdminAssignedTeamMatchesService', () => {
  let prisma: any;
  let adminContext: any;
  let games: any;
  let notifications: any;
  let service: AdminAssignedTeamMatchesService;

  beforeEach(() => {
    prisma = {
      v1Region: { findFirst: jest.fn().mockResolvedValue({ id: dto.regionId }) },
      v1Team: {
        findMany: jest.fn().mockResolvedValue([
          team(dto.homeTeamId, '홈 FC'),
          team(dto.awayTeamId, '원정 FC'),
        ]),
      },
      v1Sport: { findFirst: jest.fn().mockResolvedValue({ code: 'futsal' }) },
      v1CompetitionConfigVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'config-1' }) },
      v1IdempotencyRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      v1TeamMatch: {
        create: jest.fn().mockResolvedValue({
          id: 'team-match-1',
          title: dto.title,
          status: 'matched',
        }),
        findUniqueOrThrow: jest.fn(),
      },
      v1Game: { findUniqueOrThrow: jest.fn() },
      v1TeamMatchApplication: { create: jest.fn().mockResolvedValue({}) },
      v1TeamSchedule: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    };
    adminContext = {
      getMutationAdmin: jest.fn().mockResolvedValue({
        id: 'admin-record-1',
        userId: adminUser.id,
        adminRole: 'ops',
        status: 'active',
      }),
      logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: 'status-log-1' }),
    };
    games = {
      createFromSourceInTransaction: jest.fn().mockResolvedValue({ gameId: 'game-1' }),
    };
    notifications = { emitToManyDeferred: jest.fn() };
    service = new AdminAssignedTeamMatchesService(prisma, adminContext, games, notifications);
  });

  it('creates one matched aggregate, approved opponent, and schedules for both teams', async () => {
    await expect(service.create(adminUser, dto)).resolves.toEqual({
      teamMatchId: 'team-match-1',
      gameId: 'game-1',
      status: 'matched',
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      detailRoute: '/team-matches/team-match-1',
      replayed: false,
    });

    expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hostTeamId: dto.homeTeamId,
        approvedApplicantTeamId: dto.awayTeamId,
        status: 'matched',
      }),
    });
    expect(games.createFromSourceInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        sides: [
          expect.objectContaining({ teamId: dto.homeTeamId }),
          expect.objectContaining({ teamId: dto.awayTeamId }),
        ],
      }),
      expect.objectContaining({ actor: expect.objectContaining({ role: 'platform_ops' }) }),
    );
    expect(prisma.v1TeamMatchApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ applicantTeamId: dto.awayTeamId, status: 'approved' }),
    });
    expect(prisma.v1TeamSchedule.create).toHaveBeenCalledTimes(2);
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: 'team_match.assigned.create', toStatus: 'matched' }),
      prisma,
    );
  });

  it('rejects selecting the same team before opening a transaction', async () => {
    await expect(
      service.create(adminUser, { ...dto, awayTeamId: dto.homeTeamId }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects teams from different sports without partial writes', async () => {
    prisma.v1Team.findMany.mockResolvedValue([
      team(dto.homeTeamId, '홈 FC', 'sport-futsal'),
      team(dto.awayTeamId, '원정 FC', 'sport-football'),
    ]);

    await expect(service.create(adminUser, dto)).rejects.toMatchObject({
      response: { code: 'TEAM_MATCH_SPORT_MISMATCH' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates the support-admin permission denial before domain writes', async () => {
    adminContext.getMutationAdmin.mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' }),
    );

    await expect(service.create(adminUser, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.v1Team.findMany).not.toHaveBeenCalled();
  });
});
