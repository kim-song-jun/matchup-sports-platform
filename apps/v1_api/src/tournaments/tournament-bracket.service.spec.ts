/**
 * tournament-bracket.service.spec.ts
 *
 * Contract tests for Cluster B — admin bracket operations:
 *   - Admin role gates (non-admin 403, support 403)
 *   - createGroup: tournament-not-found, happy path + audit log
 *   - createGroupTeam: group not found, registration not found, not confirmed, duplicate, happy path
 *   - createFixture: tournament not found, group mismatch, same-team guard (AGF-3), happy path
 *   - recordResult: fixture not found, unassigned teams (AGF-1), hasPenalty guards (AGF-2),
 *       knockout draw guard (AGF-4), happy path upsert + status→completed
 *   - recalculateStandings: 승점/골득실 집계 + position 정렬 검증 + deterministic tie-break (TB-4)
 *   - getBracket: 전체 구조 반환 검증
 *
 * 관찰 가능한 동작(반환 형태 또는 throw 종류)만 검증한다. Mock 자체를 검증하지 않는다.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { TournamentBracketService } from './tournament-bracket.service';

// ─── fixtures ────────────────────────────────────────────────────────────────

const ownerUser = {
  id: 'owner-user-id',
  email: 'owner@test.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const supportUser = {
  id: 'support-user-id',
  email: 'support@test.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const nonAdminUser = {
  id: 'plain-user-id',
  email: 'user@test.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdmin = {
  id: 'owner-admin-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
};
const supportAdmin = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
};

function tournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-1',
    title: '테스트 대회',
    status: 'in_progress',
    registrationDeadlineAt: null,
    scheduledAt: null,
    venue: null,
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 0,
    deletedAt: null,
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    ...overrides,
  };
}

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    tournamentId: 'tournament-1',
    name: 'A조',
    phase: 'group',
    sortOrder: 0,
    advanceCount: null,
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    ...overrides,
  };
}

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    appliedByUserId: 'manager-user',
    status: 'confirmed',
    ...overrides,
  };
}

function fixtureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture-1',
    tournamentId: 'tournament-1',
    groupId: 'group-1',
    round: 'group_a',
    fixtureNumber: 1,
    legNumber: 1,
    parentFixtureId: null,
    homeRegistrationId: 'reg-1',
    awayRegistrationId: 'reg-2',
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    ...overrides,
  };
}

function resultRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'result-1',
    fixtureId: 'fixture-1',
    homeScore: 2,
    awayScore: 1,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: null,
    recordedByAdminUserId: 'owner-admin-id',
    recordedAt: new Date('2026-06-14T00:00:00Z'),
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    ...overrides,
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('TournamentBracketService', () => {
  let service: TournamentBracketService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentGroup: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    v1TournamentGroupTeam: { findUnique: jest.Mock; create: jest.Mock };
    v1TournamentRegistration: { findFirst: jest.Mock };
    v1TournamentFixture: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    v1TournamentFixtureResult: { upsert: jest.Mock };
    v1TournamentStanding: { upsert: jest.Mock; findMany: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentGroup: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      v1TournamentGroupTeam: { findUnique: jest.fn(), create: jest.fn() },
      v1TournamentRegistration: { findFirst: jest.fn() },
      v1TournamentFixture: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      v1TournamentFixtureResult: { upsert: jest.fn() },
      v1TournamentStanding: { upsert: jest.fn(), findMany: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
    };

    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentBracketService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentBracketService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── admin role gates ──────────────────────────────────────────────────────

  it('createGroup: non-admin → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(
      service.createGroup(nonAdminUser, 'tournament-1', { name: 'A조' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentGroup.create).not.toHaveBeenCalled();
  });

  it('createGroup: support admin cannot mutate → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdmin);
    await expect(
      service.createGroup(supportUser, 'tournament-1', { name: 'A조' }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('recordResult: non-admin → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(
      service.recordResult(nonAdminUser, 'fixture-1', { homeScore: 1, awayScore: 0 }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── createGroup ──────────────────────────────────────────────────────────

  it('createGroup: tournament not found → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(
      service.createGroup(ownerUser, 'ghost-tournament', { name: 'A조' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
  });

  it('createGroup: valid input → returns group + writes audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.create.mockResolvedValue(groupRow());

    const result = await service.createGroup(ownerUser, 'tournament-1', {
      name: 'A조',
      phase: 'group',
      sortOrder: 0,
    });

    expect(result).toMatchObject({
      id: 'group-1',
      name: 'A조',
      phase: 'group',
      tournamentId: 'tournament-1',
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament.bracket.group.create',
          targetType: 'tournament_group',
        }),
      }),
    );
  });

  it('createGroup: advanceCount provided → persisted and returned in output', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.create.mockResolvedValue(groupRow({ advanceCount: 2 }));

    const result = await service.createGroup(ownerUser, 'tournament-1', {
      name: 'A조',
      phase: 'group',
      sortOrder: 0,
      advanceCount: 2,
    });

    // advanceCount persisted to Prisma
    expect(prisma.v1TournamentGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ advanceCount: 2 }),
      }),
    );
    // advanceCount round-trips through serializer
    expect(result).toMatchObject({ id: 'group-1', advanceCount: 2 });
  });

  it('createGroup: advanceCount omitted → persisted as null, output is null', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.create.mockResolvedValue(groupRow({ advanceCount: null }));

    const result = await service.createGroup(ownerUser, 'tournament-1', { name: 'B조' });

    expect(prisma.v1TournamentGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ advanceCount: null }),
      }),
    );
    expect(result).toMatchObject({ advanceCount: null });
  });

  // ─── createGroupTeam ──────────────────────────────────────────────────────

  it('createGroupTeam: group not in tournament → 404 GROUP_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.createGroupTeam(ownerUser, 'tournament-1', {
        groupId: 'ghost-group',
        registrationId: 'reg-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'GROUP_NOT_FOUND' } });
  });

  it('createGroupTeam: registration not in tournament → 404 REGISTRATION_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);

    await expect(
      service.createGroupTeam(ownerUser, 'tournament-1', {
        groupId: 'group-1',
        registrationId: 'ghost-reg',
      }),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_NOT_FOUND' } });
  });

  it('createGroupTeam: registration not confirmed → 409 REGISTRATION_NOT_CONFIRMED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ status: 'paid' }),
    );

    await expect(
      service.createGroupTeam(ownerUser, 'tournament-1', {
        groupId: 'group-1',
        registrationId: 'reg-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_NOT_CONFIRMED' } });
  });

  it('createGroupTeam: duplicate in same group → 409 TEAM_ALREADY_IN_GROUP', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentGroupTeam.findUnique.mockResolvedValue({
      id: 'gt-1',
      groupId: 'group-1',
      registrationId: 'reg-1',
    });

    await expect(
      service.createGroupTeam(ownerUser, 'tournament-1', {
        groupId: 'group-1',
        registrationId: 'reg-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'TEAM_ALREADY_IN_GROUP' } });
    expect(prisma.v1TournamentGroupTeam.create).not.toHaveBeenCalled();
  });

  it('createGroupTeam: confirmed + not-duplicate → created', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentGroupTeam.findUnique.mockResolvedValue(null);
    prisma.v1TournamentGroupTeam.create.mockResolvedValue({
      id: 'gt-1',
      groupId: 'group-1',
      registrationId: 'reg-1',
      sortOrder: 0,
      createdAt: new Date('2026-06-14T00:00:00Z'),
    });

    const result = await service.createGroupTeam(ownerUser, 'tournament-1', {
      groupId: 'group-1',
      registrationId: 'reg-1',
    });

    expect(result).toMatchObject({ groupId: 'group-1', registrationId: 'reg-1' });
  });

  // ─── createFixture ────────────────────────────────────────────────────────

  it('createFixture: tournament not found → 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(
      service.createFixture(ownerUser, 'ghost', { round: 'group_a', fixtureNumber: 1 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createFixture: groupId not in tournament → 404 GROUP_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.createFixture(ownerUser, 'tournament-1', {
        groupId: 'ghost-group',
        round: 'group_a',
        fixtureNumber: 1,
      }),
    ).rejects.toMatchObject({ response: { code: 'GROUP_NOT_FOUND' } });
  });

  it('createFixture: valid input → returns fixture with scheduled status', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentFixture.create.mockResolvedValue(fixtureRow());

    const result = await service.createFixture(ownerUser, 'tournament-1', {
      groupId: 'group-1',
      round: 'group_a',
      fixtureNumber: 1,
    });

    expect(result).toMatchObject({
      id: 'fixture-1',
      round: 'group_a',
      fixtureNumber: 1,
      status: 'scheduled',
    });
  });

  // ─── recordResult ─────────────────────────────────────────────────────────

  it('recordResult: fixture not found → 404 FIXTURE_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(null);

    await expect(
      service.recordResult(ownerUser, 'ghost-fixture', { homeScore: 1, awayScore: 0 }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_NOT_FOUND' } });
  });

  it('recordResult: hasPenalty without penalty scores → 400 PENALTY_SCORES_REQUIRED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow());

    await expect(
      service.recordResult(ownerUser, 'fixture-1', {
        homeScore: 1,
        awayScore: 1,
        hasPenalty: true,
        // homePenaltyScore, awayPenaltyScore 미제공
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('recordResult: valid result → upserts result + fixture status becomes completed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow());
    prisma.v1TournamentFixtureResult.upsert.mockResolvedValue(resultRow());
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ status: 'completed' }));

    const result = await service.recordResult(ownerUser, 'fixture-1', {
      homeScore: 2,
      awayScore: 1,
    });

    expect(result).toMatchObject({ fixtureId: 'fixture-1', homeScore: 2, awayScore: 1 });
    expect(prisma.v1TournamentFixture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'completed' } }),
    );
    expect(prisma.v1TournamentFixtureResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fixtureId: 'fixture-1' },
        create: expect.objectContaining({ homeScore: 2, awayScore: 1 }),
      }),
    );
  });

  it('recordResult: hasPenalty with both penalty scores → succeeds', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow());
    prisma.v1TournamentFixtureResult.upsert.mockResolvedValue(
      resultRow({ hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 4 }),
    );
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ status: 'completed' }));

    const result = await service.recordResult(ownerUser, 'fixture-1', {
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 4,
    });

    expect(result).toMatchObject({ hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 4 });
  });

  // AGF-1: 미배정 픽스처 결과 입력 차단
  it('recordResult: fixture without homeRegistrationId → 400 FIXTURE_TEAMS_UNASSIGNED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(
      fixtureRow({ homeRegistrationId: null, awayRegistrationId: null }),
    );

    await expect(
      service.recordResult(ownerUser, 'fixture-1', { homeScore: 1, awayScore: 0 }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_TEAMS_UNASSIGNED' } });
  });

  // AGF-2: 승부차기는 정규 동점일 때만
  it('recordResult: hasPenalty with non-draw regular score → 400 PENALTY_REQUIRES_DRAW', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow());

    await expect(
      service.recordResult(ownerUser, 'fixture-1', {
        homeScore: 2,
        awayScore: 1,
        hasPenalty: true,
        homePenaltyScore: 5,
        awayPenaltyScore: 4,
      }),
    ).rejects.toMatchObject({ response: { code: 'PENALTY_REQUIRES_DRAW' } });
  });

  // AGF-2: 승부차기 점수 동점 불가
  it('recordResult: hasPenalty with equal penalty scores → 400 PENALTY_SCORES_MUST_DIFFER', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow());

    await expect(
      service.recordResult(ownerUser, 'fixture-1', {
        homeScore: 1,
        awayScore: 1,
        hasPenalty: true,
        homePenaltyScore: 4,
        awayPenaltyScore: 4,
      }),
    ).rejects.toMatchObject({ response: { code: 'PENALTY_SCORES_MUST_DIFFER' } });
  });

  // AGF-4: 녹아웃 라운드 동점 + 승부차기 없음 → 차단
  it('recordResult: knockout draw without hasPenalty → 400 KNOCKOUT_REQUIRES_WINNER', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(
      fixtureRow({ round: 'semi' }),
    );

    await expect(
      service.recordResult(ownerUser, 'fixture-1', {
        homeScore: 1,
        awayScore: 1,
        // hasPenalty 미제공 → 무승부이므로 knockout에서 차단
      }),
    ).rejects.toMatchObject({ response: { code: 'KNOCKOUT_REQUIRES_WINNER' } });
  });

  // AGF-4: 녹아웃 동점이어도 hasPenalty 제공 시 통과
  it('recordResult: knockout draw with hasPenalty → succeeds', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow({ round: 'final' }));
    prisma.v1TournamentFixtureResult.upsert.mockResolvedValue(
      resultRow({ homeScore: 1, awayScore: 1, hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 3 }),
    );
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ status: 'completed' }));

    const result = await service.recordResult(ownerUser, 'fixture-1', {
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 3,
    });

    expect(result).toMatchObject({ hasPenalty: true });
  });

  // AGF-4: 조별리그 동점 → 허용 (무승부 가능)
  it('recordResult: group-phase draw without hasPenalty → succeeds', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(fixtureRow({ round: 'group_a' }));
    prisma.v1TournamentFixtureResult.upsert.mockResolvedValue(
      resultRow({ homeScore: 1, awayScore: 1, hasPenalty: false }),
    );
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ status: 'completed' }));

    const result = await service.recordResult(ownerUser, 'fixture-1', {
      homeScore: 1,
      awayScore: 1,
    });

    expect(result).toMatchObject({ homeScore: 1, awayScore: 1 });
  });

  // AGF-3: createFixture — 같은 팀 홈/어웨이 배정 차단
  it('createFixture: same team for home and away → 400 FIXTURE_SAME_TEAM', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    // 동일 registrationId에 대한 confirmed 등록 mock
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ id: 'reg-1' }),
    );

    await expect(
      service.createFixture(ownerUser, 'tournament-1', {
        groupId: 'group-1',
        round: 'group_a',
        fixtureNumber: 1,
        homeRegistrationId: 'reg-1',
        awayRegistrationId: 'reg-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_SAME_TEAM' } });
  });

  // ─── recalculateStandings ─────────────────────────────────────────────────

  it('recalculateStandings: 2 fixtures → wins/draws/losses/points/position 올바르게 집계', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // group A 2팀, 1 경기 결과: reg-1 이김 (2:1) → reg-1 3점, reg-2 0점
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [
          { registrationId: 'reg-1' },
          { registrationId: 'reg-2' },
        ],
        fixtures: [
          {
            ...fixtureRow(),
            homeRegistrationId: 'reg-1',
            awayRegistrationId: 'reg-2',
            result: { homeScore: 2, awayScore: 1, hasPenalty: false },
          },
        ],
      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    const summary = await service.recalculateStandings(ownerUser, 'tournament-1');

    expect(summary).toMatchObject({ tournamentId: 'tournament-1', groupCount: 1 });

    // position=1 팀은 reg-1 (승점 3, position=1)
    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    const pos1 = upsertCalls.find((c) => c[0].create.position === 1);
    const pos2 = upsertCalls.find((c) => c[0].create.position === 2);
    expect(pos1?.[0].create).toMatchObject({ registrationId: 'reg-1', points: 3, wins: 1 });
    expect(pos2?.[0].create).toMatchObject({ registrationId: 'reg-2', points: 0, losses: 1 });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalled();
  });

  it('recalculateStandings: draw fixture → both teams get 1 point', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],
        fixtures: [
          {
            ...fixtureRow(),
            homeRegistrationId: 'reg-1',
            awayRegistrationId: 'reg-2',
            // 승부차기지만 정규 스코어 1:1 → 무승부 처리 (각 1점)
            result: { homeScore: 1, awayScore: 1, hasPenalty: true },
          },
        ],
      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    for (const call of upsertCalls) {
      // 무승부이므로 양 팀 모두 points=1, draws=1
      expect(call[0].create.points).toBe(1);
      expect(call[0].create.draws).toBe(1);
    }
  });

  // TB-4: 완전 동점 시 registrationId asc로 안정적 순위 결정
  it('recalculateStandings: complete tie → registrationId asc decides position (TB-4)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // 3팀 모두 0점 0골 — 완전 동점
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [
          { registrationId: 'reg-c' },
          { registrationId: 'reg-a' },
          { registrationId: 'reg-b' },
        ],
        fixtures: [], // 경기 없음
      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    const pos1 = upsertCalls.find((c) => c[0].create.position === 1);
    const pos2 = upsertCalls.find((c) => c[0].create.position === 2);
    const pos3 = upsertCalls.find((c) => c[0].create.position === 3);
    // registrationId asc: reg-a(1위) < reg-b(2위) < reg-c(3위)
    expect(pos1?.[0].create.registrationId).toBe('reg-a');
    expect(pos2?.[0].create.registrationId).toBe('reg-b');
    expect(pos3?.[0].create.registrationId).toBe('reg-c');
  });

  // ─── getBracket ───────────────────────────────────────────────────────────

  it('getBracket: tournament not found → 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(service.getBracket(ownerUser, 'ghost')).rejects.toThrow(NotFoundException);
  });

  it('getBracket: returns groups/fixtures/standings structure', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [
          {
            id: 'gt-1',
            groupId: 'group-1',
            registrationId: 'reg-1',
            sortOrder: 0,
            createdAt: new Date('2026-06-14T00:00:00Z'),
            registration: { team: { name: '서울 FC' } },
          },
        ],
      },
    ]);
    prisma.v1TournamentFixture.findMany.mockResolvedValue([
      {
        ...fixtureRow(),
        result: resultRow(),
        homeRegistration: { team: { name: '서울 FC' } },
        awayRegistration: { team: { name: '부산 SC' } },
      },
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([
      {
        id: 'standing-1',
        groupId: 'group-1',
        registrationId: 'reg-1',
        points: 3,
        wins: 1,
        draws: 0,
        losses: 0,
        goalsFor: 2,
        goalsAgainst: 1,
        position: 1,
        recalculatedAt: new Date('2026-06-14T00:00:00Z'),
        registration: { team: { name: '서울 FC' } },
      },
    ]);

    const result = await service.getBracket(ownerUser, 'tournament-1');

    expect(result).toHaveProperty('groups');
    expect(result).toHaveProperty('fixtures');
    expect(result).toHaveProperty('standings');
    expect(result.groups).toHaveLength(1);
    expect(result.fixtures).toHaveLength(1);
    expect(result.fixtures[0]).toHaveProperty('result');
    expect(result.standings[0]).toMatchObject({
      registrationId: 'reg-1',
      points: 3,
      position: 1,
      goalDifference: 1,
    });

    // advanceCount is surfaced on group
    expect(result.groups[0]).toMatchObject({ advanceCount: null });

    // teamName fields are populated (not raw UUIDs)
    expect(result.groups[0].groupTeams[0]).toMatchObject({
      registrationId: 'reg-1',
      teamName: '서울 FC',
    });
    expect(result.fixtures[0]).toMatchObject({
      homeRegistrationId: 'reg-1',
      homeTeamName: '서울 FC',
      awayRegistrationId: 'reg-2',
      awayTeamName: '부산 SC',
    });
    expect(result.standings[0]).toMatchObject({
      registrationId: 'reg-1',
      teamName: '서울 FC',
    });
  });

  it('getBracket: TBD when registration is null', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      { ...groupRow(), groupTeams: [] },
    ]);
    prisma.v1TournamentFixture.findMany.mockResolvedValue([
      {
        ...fixtureRow(),
        homeRegistrationId: null,
        awayRegistrationId: null,
        homeRegistration: null,
        awayRegistration: null,
        result: null,
      },
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    const result = await service.getBracket(ownerUser, 'tournament-1');

    expect(result.fixtures[0]).toMatchObject({
      homeTeamName: 'TBD',
      awayTeamName: 'TBD',
    });
  });
});
