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
import { GamesService } from '../games/games.service';
import { FOOTBALL_V1_CONFIG } from './competition-config/competition-config';

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
  user: { accountStatus: 'active' as const },
};
const supportAdmin = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
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
    competitionConfigVersionId: '11111111-1111-4111-8111-111111111111',
    competitionConfig: FOOTBALL_V1_CONFIG,
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
    videos: [],
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    competitionConfigVersionId: '11111111-1111-4111-8111-111111111111',
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    ...overrides,
  };
}

// R3 §4-3단계: 레거시 V1TournamentFixtureResult 대신 신규 경로
// (V1Game.currentOfficialRevision)에서 결과를 읽는다 -- fixture.game 모양을 흉내낸다.
function gameOfficialResultRow(overrides: Record<string, unknown> = {}) {
  return {
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    participants: [],
    events: [],
    currentOfficialRevision: {
      id: 'revision-1',
      state: 'OFFICIAL',
      score: { home: 2, away: 1 },
      officialAt: new Date('2026-06-14T00:00:00Z'),
      createdAt: new Date('2026-06-14T00:00:00Z'),
      updatedAt: new Date('2026-06-14T00:00:00Z'),
    },
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
    v1TournamentRegistration: { findFirst: jest.Mock; findMany: jest.Mock };
    v1TournamentFixture: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    v1TournamentFixtureResult: { upsert: jest.Mock };
    v1TournamentFixtureVideo: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    v1TournamentFixtureGoal: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    v1TournamentPlayer: { findMany: jest.Mock };
    v1TournamentStanding: { upsert: jest.Mock; findMany: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let games: { createFromSourceInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentGroup: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      v1TournamentGroupTeam: { findUnique: jest.fn(), create: jest.fn() },
      v1TournamentRegistration: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentFixture: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      v1TournamentFixtureResult: { upsert: jest.fn() },
      v1TournamentFixtureVideo: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1TournamentFixtureGoal: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { upsert: jest.fn(), findMany: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    games = { createFromSourceInTransaction: jest.fn().mockResolvedValue({ gameId: 'game-1' }) };

    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentBracketService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: GamesService, useValue: games },
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
    prisma.v1TournamentFixture.create.mockResolvedValue(
      fixtureRow({ homeRegistrationId: null, awayRegistrationId: null }),
    );

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

  it('createFixture: missing source pin rejects before fixture persistence', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(tournamentRow())
      .mockResolvedValueOnce(tournamentRow({ competitionConfigVersionId: '' }));

    await expect(
      service.createFixture(ownerUser, 'tournament-1', {
        round: 'group_a',
        fixtureNumber: 2,
      }),
    ).rejects.toMatchObject({ response: { code: 'COMPETITION_CONFIG_REQUIRED' } });

    expect(prisma.v1TournamentFixture.create).not.toHaveBeenCalled();
  });

  it('recordResult: rejects the generic tournament result writer without persistence', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);

    await expect(
      service.recordResult(ownerUser, 'fixture-1', { homeScore: 2, awayScore: 1 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_RESULT_DERIVED_ONLY' } });

    expect(prisma.v1TournamentFixtureResult.upsert).not.toHaveBeenCalled();
    expect(prisma.v1TournamentFixture.update).not.toHaveBeenCalled();
  });

  it('deleteFixtureResult: rejects legacy result deletion without persistence', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);

    await expect(service.deleteFixtureResult(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_RESULT_DERIVED_ONLY' },
    });

    expect(prisma.v1TournamentFixtureResult.upsert).not.toHaveBeenCalled();
    expect(prisma.v1TournamentFixture.update).not.toHaveBeenCalled();
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
  // R3 §4-3단계: 순위 계산 입력을 V1Game.currentOfficialRevision(신규 경로)에서
  // 읽는다 -- 레거시 V1TournamentFixtureResult 행이 전혀 없어도 동작해야 한다.

  it('recalculateStandings: 2 fixtures(백필된 nested score) → wins/draws/losses/points/position 올바르게 집계', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // group A 2팀, 1 경기 결과: reg-1 이김 (2:1) → reg-1 3점, reg-2 0점.
    // GAME_BACKFILL이 쓰는 nested { regulation, penalty } 형태로 스코어를 준다.
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
            game: gameOfficialResultRow({
              currentOfficialRevision: {
                id: 'revision-1',
                state: 'OFFICIAL',
                score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false },
                officialAt: new Date('2026-06-14T00:00:00Z'),
                createdAt: new Date('2026-06-14T00:00:00Z'),
                updatedAt: new Date('2026-06-14T00:00:00Z'),
              },
            }),
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

  it('recalculateStandings: draw fixture(라이브 종료된 평평한 score) → both teams get 1 point', async () => {
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
            // deriveTournamentRevision이 쓰는 평평한 { home, away } 형태 — 1:1 무승부.
            game: gameOfficialResultRow({
              currentOfficialRevision: {
                id: 'revision-2',
                state: 'OFFICIAL',
                score: { home: 1, away: 1 },
                officialAt: new Date('2026-06-14T00:00:00Z'),
                createdAt: new Date('2026-06-14T00:00:00Z'),
                updatedAt: new Date('2026-06-14T00:00:00Z'),
              },
            }),
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

  it('recalculateStandings: VOID로 무효화된 결과는 순위 계산에서 제외된다', async () => {
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
            // currentOfficialRevisionId는 VOID 이후 VOID 리비전을 가리키도록 옮겨간다
            // (tournament-result-review.service.ts voidResult) — state가 OFFICIAL이
            // 아니므로 "결과 없음"과 동일하게 취급되어야 한다.
            game: gameOfficialResultRow({
              currentOfficialRevision: {
                id: 'revision-void',
                state: 'VOID',
                score: { home: 2, away: 1 },
                officialAt: null,
                createdAt: new Date('2026-06-14T00:00:00Z'),
                updatedAt: new Date('2026-06-14T00:00:00Z'),
              },
            }),
          },
        ],
      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    // 경기 없음과 동일 — 둘 다 0승0무0패, seeded draw로만 순서가 갈린다.
    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    for (const call of upsertCalls) {
      expect(call[0].create).toMatchObject({ points: 0, wins: 0, draws: 0, losses: 0 });
    }
  });

  it('recalculateStandings: game 백필 전(레거시 result만 있는) 픽스처 → 레거시 스코어로 순위가 계산된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // R3 §4-3~§4-4단계 사이 한시적 폴백: game 자체가 없는(아직 game 백필이 안 된) 픽스처는
    // 레거시 V1TournamentFixtureResult 스코어로 순위를 계산해야 한다 — 폴백이 없으면 이
    // 픽스처는 "결과 없음"으로 취급돼 순위가 조용히 0으로 빠진다(오너 신고 버그의 원인).
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],
        fixtures: [
          {
            ...fixtureRow(),
            homeRegistrationId: 'reg-1',
            awayRegistrationId: 'reg-2',
            game: null,
            result: {
              homeScore: 3,
              awayScore: 0,
              hasPenalty: false,
              homePenaltyScore: null,
              awayPenaltyScore: null,
            },
          },
        ],
      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    const winner = upsertCalls.find((c) => c[0].create.registrationId === 'reg-1')?.[0].create;
    const loser = upsertCalls.find((c) => c[0].create.registrationId === 'reg-2')?.[0].create;
    expect(winner).toMatchObject({ points: 3, wins: 1, goalsFor: 3, goalsAgainst: 0 });
    expect(loser).toMatchObject({ points: 0, losses: 1, goalsFor: 0, goalsAgainst: 3 });
  });

  it('recalculateStandings: 새 경로 OFFICIAL 리비전과 레거시 result가 둘 다 있으면 새 경로 스코어가 이긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // 새 경로는 1:1 무승부를, 레거시 result는 3:0 reg-1 승리를 주장한다 — 새 경로가
    // 무조건 이겨야 한다("새 경로 우선, 없을 때만 레거시" 설계).
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],
        fixtures: [
          {
            ...fixtureRow(),
            homeRegistrationId: 'reg-1',
            awayRegistrationId: 'reg-2',
            game: gameOfficialResultRow({
              currentOfficialRevision: {
                id: 'revision-priority',
                state: 'OFFICIAL',
                score: { home: 1, away: 1 },
                officialAt: new Date('2026-06-14T00:00:00Z'),
                createdAt: new Date('2026-06-14T00:00:00Z'),
                updatedAt: new Date('2026-06-14T00:00:00Z'),
              },
            }),
            result: {
              homeScore: 3,
              awayScore: 0,
              hasPenalty: false,
              homePenaltyScore: null,
              awayPenaltyScore: null,
            },
          },
        ],
      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    for (const call of upsertCalls) {
      expect(call[0].create).toMatchObject({ points: 1, draws: 1, goalsFor: 1 });
    }
  });

  it('recalculateStandings: complete tie → seeded draw decides the full position order (TB-4)', async () => {
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
    expect(upsertCalls.map((call) => call[0].create)).toEqual([
      expect.objectContaining({ position: 1, registrationId: 'reg-b' }),
      expect.objectContaining({ position: 2, registrationId: 'reg-c' }),
      expect.objectContaining({ position: 3, registrationId: 'reg-a' }),
    ]);
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
        game: gameOfficialResultRow(),
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
    // 신규 경로(V1Game.currentOfficialRevision)에서 조립된 result — 레거시 필드 형태
    // (homeScore/awayScore/hasPenalty/homePenaltyScore/awayPenaltyScore/goals) 그대로.
    expect(result.fixtures[0].result).toMatchObject({
      homeScore: 2,
      awayScore: 1,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      note: null,
      goals: [],
    });
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
        game: null,
      },
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    const result = await service.getBracket(ownerUser, 'tournament-1');

    expect(result.fixtures[0]).toMatchObject({
      homeTeamName: 'TBD',
      awayTeamName: 'TBD',
    });
  });

  it('getBracket: 정정(CORRECTION)으로 취소된 골은 goals[]에서 빠진다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([{ ...groupRow(), groupTeams: [] }]);
    prisma.v1TournamentFixture.findMany.mockResolvedValue([
      {
        ...fixtureRow(),
        homeRegistration: { team: { name: '서울 FC' } },
        awayRegistration: { team: { name: '부산 SC' } },
        game: gameOfficialResultRow({
          participants: [{ id: 'participant-1', displayNameSnapshot: '김선수' }],
          // event-goal-1 은 나중에 event-correction-1(reversesEventId로 되돌림)에 의해
          // 취소됐다 -- type: 'GOAL' 필터만으로는 CORRECTION 자체가 GOAL이 아니라서 걸러지지
          // 않는다(이 저장소에서 이미 한 번 샌 버그와 동일한 함정). event-goal-2는 유효.
          events: [
            {
              id: 'event-goal-1',
              type: 'GOAL',
              sideId: 'side-home',
              participantId: 'participant-1',
              clockMs: 60_000,
              reversesEventId: null,
            },
            {
              id: 'event-correction-1',
              type: 'CORRECTION',
              sideId: 'side-home',
              participantId: null,
              clockMs: 65_000,
              reversesEventId: 'event-goal-1',
            },
            {
              id: 'event-goal-2',
              type: 'GOAL',
              sideId: 'side-away',
              participantId: null,
              clockMs: 120_000,
              reversesEventId: null,
            },
          ],
        }),
      },
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    const result = await service.getBracket(ownerUser, 'tournament-1');

    expect(result.fixtures[0].result?.goals).toEqual([
      expect.objectContaining({ id: 'event-goal-2', team: 'away', playerId: null }),
    ]);
    expect(result.fixtures[0].result?.goals).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'event-goal-1' })]),
    );
  });

  // ─── updateFixture / deleteFixture: 신규 경로 기준 결과 존재 가드 ──────────────

  it('updateFixture: 신규 경로에 OFFICIAL 결과가 있으면 팀 변경이 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      // 실제 쿼리는 game.sides 도 함께 include 한다(팀 배정 시 사이드를 옮기기 위해) — mock 도 같은 모양을 준다.
      game: { id: 'game-1', currentOfficialRevision: { state: 'OFFICIAL' }, sides: [] },
    });

    await expect(
      service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_HAS_RESULT' } });
  });

  it('updateFixture: 결과가 VOID면 팀 변경이 막히지 않는다(결과 없음과 동일 취급)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      game: { id: 'game-1', currentOfficialRevision: { state: 'VOID' }, sides: [] },
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ id: 'reg-3' }));
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ homeRegistrationId: 'reg-3' }));

    const result = await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });
    expect(result).toMatchObject({ id: 'fixture-1' });
  });

  it('deleteFixture: 신규 경로에 OFFICIAL 결과가 있으면 삭제가 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      // 실제 쿼리는 game.sides 도 함께 include 한다(팀 배정 시 사이드를 옮기기 위해) — mock 도 같은 모양을 준다.
      game: { id: 'game-1', currentOfficialRevision: { state: 'OFFICIAL' }, sides: [] },
    });

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_HAS_RESULT' },
    });
  });

  it('updateFixture: game이 없고(백필 전) 레거시 result만 있으면 팀 변경이 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      game: null,
      result: { id: 'legacy-result-1' },
    });

    await expect(
      service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_HAS_RESULT' } });
  });

  it('deleteFixture: game이 없고(백필 전) 레거시 result만 있으면 삭제가 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      game: null,
      result: { id: 'legacy-result-1' },
    });

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_HAS_RESULT' },
    });
  });

  it('deleteFixture: 결과가 없으면(game null) 삭제된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({ ...fixtureRow(), game: null });

    const result = await service.deleteFixture(ownerUser, 'fixture-1');
    expect(result).toEqual({ deleted: true });
  });
});
