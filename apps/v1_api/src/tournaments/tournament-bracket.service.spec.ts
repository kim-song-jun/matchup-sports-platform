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
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';
import { assertSidesNotSlotLinked, assignTournamentFixtureSideInTx, createGroupInTx, softDeleteTournamentFixtureInTx } from './tournament-bracket-tx';

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
    format: 'group_knockout',
    kind: 'regular_tournament' as const,
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
    tournament: tournamentRow({ status: 'closed' }),
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

/** updateTournamentMatchInTx 의 raw 조회 순서: 자기 경기 잠금 → 대진 상세 잠금 → 팀 매치 잠금. */
function queueFixtureUpdateRaw(queryRaw: jest.Mock, gameRow: Record<string, unknown>, teamMatchRow: Record<string, unknown>) {
  queryRaw
    .mockResolvedValueOnce([gameRow])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([teamMatchRow]);
}

function canonicalDetailsRow(overrides: Record<string, unknown> = {}) {
  return {
    tournament: tournamentRow({ status: "closed" }),
    teamMatchId: 'fixture-1',
    tournamentId: 'tournament-1',
    groupId: 'group-1',
    round: 'group_a',
    fixtureNumber: 1,
    legNumber: 1,
    parentTeamMatchId: null,
    homeRegistrationId: 'reg-1',
    awayRegistrationId: 'reg-2',
    teamMatch: {
      id: 'fixture-1',
      tournamentId: 'tournament-1',
      deletedAt: null,
      title: '테스트 경기',
      hostTeamId: 'team-old',
      approvedApplicantTeamId: 'team-away',
      startAt: null,
      endAt: null,
      placeName: null,
      status: 'matched',
      homeSlotId: null,
      awaySlotId: null,
      createdAt: new Date('2026-06-14T00:00:00Z'),
      updatedAt: new Date('2026-06-14T00:00:00Z'),
      _count: { operationAudits: 0 },
      game: {
        id: 'game-1',
        state: 'SCHEDULED',
        sourceType: 'TEAM_MATCH',
        teamMatchId: 'fixture-1',
        currentOfficialRevisionId: null,
        currentOfficialRevision: null,
        sides: [
          { id: 'side-home', sideKey: 'HOME', teamId: 'team-old' },
          { id: 'side-away', sideKey: 'AWAY', teamId: 'team-away' },
        ],
      },
    },
    ...overrides,
  };
}

function canonicalBracketRow(overrides: Record<string, unknown> = {}) {
  const base = canonicalDetailsRow();
  return {
    ...base,
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    homeRegistration: { team: { name: '서울 FC' } },
    awayRegistration: { team: { name: '부산 SC' } },
    teamMatch: {
      ...base.teamMatch,
      videos: [],
      game: {
        ...base.teamMatch.game,
        participants: [],
        events: [],
        currentOfficialRevision: null,
      },
    },
    ...overrides,
  };
}

/**
 * `deleteFixture()` 가 실제로 select 하는 모양. 기본값은 "아무것도 매달려 있지 않은 대진"이라
 * 지울 수 있고, 테스트마다 막는 요소만 덮어쓴다. `_count` 를 빼면 삭제 가드가 스펙에서만
 * 통하는 거짓이 된다.
 */
function deletableFixtureRow(overrides: Record<string, unknown> = {}) {
  return {
    round: 'group_a',
    fixtureNumber: 1,
    legNumber: 1,
    game: null,
    result: null,
    _count: { operationAudits: 0, staffScopes: 0 },
    ...overrides,
  };
}

// R3 §4-3단계: canonical Game official revision 경로
// (V1Game.currentOfficialRevision)에서 결과를 읽는다 -- fixture.game 모양을 흉내낸다.
function gameOfficialResultRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    sourceType: 'TEAM_MATCH',
    teamMatchId: 'fixture-1',
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

function canonicalStandingsDetail(
  game: ReturnType<typeof gameOfficialResultRow>,
  homeRegistrationId = 'reg-1',
  awayRegistrationId = 'reg-2',
) {
  return {
    groupId: 'group-1',
    homeRegistrationId,
    awayRegistrationId,
    teamMatch: {
      id: 'fixture-1',
      tournamentId: 'tournament-1',
      deletedAt: null,
      leagueId: null,
      status: 'completed',
      game,
    },
  };
}

// ─── test suite ───────────────────────────────────────────────────────────────

describe('TournamentBracketService', () => {
  let service: TournamentBracketService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentGroup: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    v1TournamentByeSlot: { findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    v1TournamentGroupTeam: { delete: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1TournamentMatchDetails: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1TeamMatch: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    v1TournamentMatchAdvancementEdge: { findMany: jest.Mock; deleteMany: jest.Mock };
    v1TeamSchedule: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    v1TournamentRegistration: { findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    v1GameResultRevision: { findUnique: jest.Mock };
    v1IdempotencyRecord: { findFirst: jest.Mock; findMany: jest.Mock };
    v1Game: { update: jest.Mock; findMany: jest.Mock };
    v1GameVisibilityPolicy: { update: jest.Mock };
    v1GameLineup: { findFirst: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
    v1GameSide: { update: jest.Mock };
    v1GameRosterAdjustment: { updateMany: jest.Mock };
    v1TeamTacticsBoard: { deleteMany: jest.Mock };
    v1TournamentPlayer: { findMany: jest.Mock };
    v1TournamentStanding: { deleteMany: jest.Mock; upsert: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    v1TournamentOverallStanding: { upsert: jest.Mock; deleteMany: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let games: { createFromSourceInTransaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn().mockResolvedValue(tournamentRow({ status: 'closed' })) },
      v1TournamentGroup: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      v1TournamentByeSlot: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      v1TournamentGroupTeam: { delete: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'group-team-auto' }), update: jest.fn() },
      v1TournamentMatchDetails: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => canonicalDetailsRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ teamMatchId: 'fixture-1' }),
        update: jest.fn(),
      },
      v1TeamMatch: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'fixture-1',
          tournamentId: 'tournament-1',
          hostTeamId: null,
          approvedApplicantTeamId: null,
          startAt: null,
          placeName: null,
          status: 'matched',
          createdAt: new Date('2026-06-14T00:00:00Z'),
          updatedAt: new Date('2026-06-14T00:00:00Z'),
        }),
        create: jest.fn().mockResolvedValue({ id: 'fixture-1' }),
        update: jest.fn(),
      },
      v1TournamentMatchAdvancementEdge: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TeamSchedule: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TournamentRegistration: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      v1GameResultRevision: { findUnique: jest.fn().mockResolvedValue({ state: 'VOID' }) },
      v1IdempotencyRecord: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      v1GameVisibilityPolicy: { update: jest.fn().mockResolvedValue({}) },
      v1Game: { update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
      v1GameLineup: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      v1GameSide: { update: jest.fn().mockResolvedValue({}) },
      v1GameRosterAdjustment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TeamTacticsBoard: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentStanding: { deleteMany: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      v1TournamentOverallStanding: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      // 명단 등번호는 raw 로 읽는다(생성된 클라이언트에 컬럼이 아직 없다).
      // 기본은 빈 배열 — "아무도 번호를 안 달았다".
      $queryRaw: jest.fn().mockResolvedValue([]),
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

  it('updateBracketSources: support admin cannot mutate → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdmin);
    await expect(service.updateBracketSources(supportUser, 'fixture-1', { homeSourceFixtureId: null }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
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

  // ─── 리그 대회 차단 규칙 ────────────────────────────────────────────────────

  describe('리그 대회 차단 규칙', () => {
    it('format=league인 대회에 knockout 조를 만들면 LEAGUE_KNOCKOUT_GROUP_FORBIDDEN으로 거부한다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ format: 'league' }));

      await expect(
        service.createGroup(ownerUser, 'tournament-1', { name: '4강', phase: 'semi', sortOrder: 1 }),
      ).rejects.toMatchObject({
        response: { code: 'LEAGUE_KNOCKOUT_GROUP_FORBIDDEN' },
      });
      expect(prisma.v1TournamentGroup.create).not.toHaveBeenCalled();
    });

    it('format=league인 대회에 advanceCount를 설정하면 LEAGUE_ADVANCE_COUNT_FORBIDDEN으로 거부한다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ format: 'league' }));

      await expect(
        service.createGroup(ownerUser, 'tournament-1', {
          name: 'A조',
          phase: 'group',
          sortOrder: 1,
          advanceCount: 2,
        }),
      ).rejects.toMatchObject({
        response: { code: 'LEAGUE_ADVANCE_COUNT_FORBIDDEN' },
      });
      expect(prisma.v1TournamentGroup.create).not.toHaveBeenCalled();
    });

    // 위 두 케이스는 **가드**(format/kind)를 본다. 아래는 그보다 앞의 **대회 표면 봉쇄** —
    // 리그 id 는 가드에 닿기도 전에 대회 조회에서 막혀야 한다(조회가 헬퍼를 거치는지).
    it('리그 id 는 조 생성 자체가 막힌다 — 조 행이 만들어지지 않는다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst(tournamentRow({ kind: 'regular_league' })),
      );
      // 봉쇄가 없으면 실제로 성공하도록 채운다.
      prisma.v1TournamentGroup.create.mockResolvedValue(groupRow({ phase: 'group' }));

      await expect(
        service.createGroup(ownerUser, 'league-1', { name: 'A조', phase: 'group', sortOrder: 1 }),
      ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
      expect(prisma.v1TournamentGroup.create).not.toHaveBeenCalled();
    });

    it('kind=regular_league 는 format 이 group_knockout 이어도 knockout 조를 거부한다', async () => {
      // **이 조합이 통합 백필이 실제로 만드는 행이다.** 백필은 `format` 을 쓰지 않아
      // 스키마 기본값 `group_knockout` 이 들어간다 — 가드가 `format` 만 보던 동안
      // 정규 리그 시즌에서는 **예외 없이 즉시 return** 했다(no-op).
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(
        tournamentRow({ format: 'group_knockout', kind: 'regular_league' }),
      );

      await expect(
        service.createGroup(ownerUser, 'tournament-1', { name: '4강', phase: 'semi', sortOrder: 1 }),
      ).rejects.toMatchObject({
        response: { code: 'LEAGUE_KNOCKOUT_GROUP_FORBIDDEN' },
      });
      expect(prisma.v1TournamentGroup.create).not.toHaveBeenCalled();
    });

    it('format=league + kind=null 은 여전히 리그다 — kind 축을 더해도 원래 판정이 바뀌지 않는다', async () => {
      // 두 조건은 OR 이다. `kind` 를 보게 만들면서 `format` 판정이 약해지면, 리그 방식으로
      // 진행하는 옛 대회(kind 미지정)에 토너먼트 조가 다시 만들어진다.
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(
        tournamentRow({ format: 'league', kind: null }),
      );

      await expect(
        service.createGroup(ownerUser, 'tournament-1', { name: '4강', phase: 'semi', sortOrder: 1 }),
      ).rejects.toMatchObject({
        response: { code: 'LEAGUE_KNOCKOUT_GROUP_FORBIDDEN' },
      });
      expect(prisma.v1TournamentGroup.create).not.toHaveBeenCalled();
    });

    it('format=group_knockout + kind=null(R1 이전 행)은 리그가 아니다 — knockout 조를 그대로 만든다', async () => {
      // 위 수정이 만들 수 있는 **반대 방향 회귀**를 막는다: `kind` 를 보게 하면서
      // null 까지 리그로 묶으면 마이그레이션 전에 만들어진 대회가 리그 규칙에 걸린다.
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(
        tournamentRow({ format: 'group_knockout', kind: null }),
      );
      prisma.v1TournamentGroup.create.mockResolvedValue(groupRow({ phase: 'semi' }));

      await expect(
        service.createGroup(ownerUser, 'tournament-1', { name: '4강', phase: 'semi', sortOrder: 1 }),
      ).resolves.toBeDefined();
    });

    it('format=group_knockout인 대회는 knockout 조를 그대로 만들 수 있다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ format: 'group_knockout' }));
      prisma.v1TournamentGroup.create.mockResolvedValue(groupRow({ phase: 'semi' }));

      await expect(
        service.createGroup(ownerUser, 'tournament-1', { name: '4강', phase: 'semi', sortOrder: 1 }),
      ).resolves.toBeDefined();
    });
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

  it('부전승을 조별리그 팀 배정에 허용하지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    await expect(service.createGroupTeam(ownerUser, 'tournament-1', { groupId: 'group-1', registrationId: 'reg-1', isBye: true }))
      .rejects.toMatchObject({ response: { code: 'BYE_PHASE_INVALID' } });
  });

  it('12강의 다섯 번째 부전승은 저장하지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'round12' }));
    prisma.v1TournamentGroupTeam.findMany.mockResolvedValue(Array.from({ length: 4 }, () => ({ isBye: true })));
    await expect(service.createGroupTeam(ownerUser, 'tournament-1', { groupId: 'group-1', registrationId: 'reg-1', isBye: true }))
      .rejects.toMatchObject({ response: { code: 'ROUND12_CAPACITY' } });
  });


  describe('라운드별 부전승 저장', () => {
    const dto = { groupId: 'group-1', registrationId: 'reg-1', sortOrder: 3 };
    beforeEach(() => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'round12' }));
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      const saved = { id: 'gt-1', ...dto, isBye: true, createdAt: new Date('2026-10-05T00:00:00Z') };
      prisma.v1TournamentGroupTeam.create.mockResolvedValue(saved);
      prisma.v1TournamentGroupTeam.update.mockResolvedValue(saved);
    });
    it('팀 없이 부전승 네 자리를 독립적으로 저장하고 다섯 번째는 거절한다', async () => {
      const rows: Array<Record<string, unknown>> = [];
      prisma.v1TournamentByeSlot.findMany.mockImplementation(async () => [...rows]);
      prisma.v1TournamentByeSlot.create.mockImplementation(async ({ data }) => { const row = { id: 'slot-' + rows.length, ...data, createdAt: new Date() }; rows.push(row); return row; });
      for (const sortOrder of [0, 3, 4, 7]) {
        expect(await service.createBye(ownerUser, 'tournament-1', { groupId: 'group-1', sortOrder })).toMatchObject({ registrationId: null, isBye: true, sortOrder });
      }
      expect(new Set(rows.map((row) => row.id)).size).toBe(4);
      await expect(service.createBye(ownerUser, 'tournament-1', { groupId: 'group-1', sortOrder: 1 })).rejects.toMatchObject({ response: { code: 'BYE_CAPACITY' } });
      expect(prisma.v1TournamentRegistration.findFirst).not.toHaveBeenCalled();
      expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
      expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
    });
    it('미정 자리에 팀을 배정해도 동일 id와 위치를 유지한다', async () => {
      const existing = { id: 'slot-1', groupId: 'group-1', sortOrder: 3, createdAt: new Date() };
      prisma.v1TournamentByeSlot.findMany.mockResolvedValue([existing]);
      prisma.v1TournamentGroupTeam.create.mockImplementation(async ({ data }) => ({ ...existing, ...data }));
      expect(await service.createBye(ownerUser, 'tournament-1', { ...dto, byeId: 'slot-1' })).toMatchObject({ id: 'slot-1', registrationId: 'reg-1', sortOrder: 3 });
      expect(prisma.v1TournamentByeSlot.delete).toHaveBeenCalledWith({ where: { id: 'slot-1' } });
      prisma.v1TournamentByeSlot.findMany.mockResolvedValue([]);
      prisma.v1TournamentGroupTeam.findMany.mockResolvedValue([{ ...existing, registrationId: 'reg-1', isBye: true }]);
      prisma.v1TournamentByeSlot.create.mockImplementation(async ({ data }) => ({ ...existing, ...data }));
      expect(await service.createBye(ownerUser, 'tournament-1', { ...dto, byeId: 'slot-1', registrationId: null })).toMatchObject({ id: 'slot-1', registrationId: null, sortOrder: 3 });
      expect(prisma.v1TournamentGroupTeam.delete).toHaveBeenCalledWith({ where: { id: 'slot-1' } });
    });
    it('다른 조의 부전승 id를 수정하지 않는다', async () => {
      await expect(service.createBye(ownerUser, 'tournament-1', { ...dto, byeId: 'foreign-slot' })).rejects.toMatchObject({ response: { code: 'BYE_NOT_FOUND' } });
      expect(prisma.v1TournamentGroupTeam.update).not.toHaveBeenCalled();
    });
    it('같은 대진 위치에 미정 부전승을 중복 생성하지 않는다', async () => {
      prisma.v1TournamentByeSlot.findMany.mockResolvedValue([{ id: 'slot-1', groupId: 'group-1', sortOrder: 3 }]);
      await expect(service.createBye(ownerUser, 'tournament-1', { groupId: 'group-1', sortOrder: 3 })).rejects.toMatchObject({ response: { code: 'BYE_POSITION_OCCUPIED' } });
    });
    it.each(['round12', 'quarter', 'semi'])('%s에 한 팀만으로 부전승을 저장한다', async (phase) => {
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase }));
      expect(await service.createBye(ownerUser, 'tournament-1', dto)).toMatchObject({ registrationId: 'reg-1', isBye: true, sortOrder: 3 });
      expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
    });
    it('이미 조에 배정된 팀도 부전승으로 전환하고 위치를 저장한다', async () => {
      prisma.v1TournamentGroupTeam.findMany.mockResolvedValue([{ id: 'gt-1', registrationId: 'reg-1', isBye: false, sortOrder: 0 }]);
      expect(await service.createBye(ownerUser, 'tournament-1', dto)).toMatchObject({ isBye: true, sortOrder: 3 });
      expect(prisma.v1TournamentGroupTeam.create).not.toHaveBeenCalled();
    });
    it('현재 라운드의 경기 참가팀을 부전승으로 전환하지 않는다', async () => {
      prisma.v1TournamentMatchDetails.findFirst.mockResolvedValue({ teamMatchId: 'fixture-1' });
      await expect(service.createBye(ownerUser, 'tournament-1', dto)).rejects.toMatchObject({ response: { code: 'BYE_TEAM_HAS_MATCH' } });
    });
    it('4강에서 다섯 번째 대진표 위치를 거절한다', async () => {
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'semi' }));
      await expect(service.createBye(ownerUser, 'tournament-1', { ...dto, sortOrder: 4 })).rejects.toMatchObject({ response: { code: 'BYE_POSITION_INVALID' } });
    });
    it('결승 부전승을 거절한다', async () => {
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'final' }));
      await expect(service.createBye(ownerUser, 'tournament-1', dto)).rejects.toMatchObject({ response: { code: 'BYE_PHASE_INVALID' } });
    });
    it('12강에 이미 부전승 네 팀이 있으면 다섯 번째를 거절한다', async () => {
      prisma.v1TournamentGroupTeam.findMany.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ id: 'gt-' + i, registrationId: 'other-' + i, isBye: true })));
      await expect(service.createBye(ownerUser, 'tournament-1', dto)).rejects.toMatchObject({ response: { code: 'BYE_CAPACITY' } });
    });
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
    prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({
      ...canonicalDetailsRow().teamMatch,
      hostTeamId: null,
      approvedApplicantTeamId: null,
    });

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

  it('createFixture: 번호를 이동한 옛 좌표에 새 게임 ID를 생성한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    const baseKey = 'tournament-fixture:tournament-1:group_a:1:1';
    prisma.v1IdempotencyRecord.findMany.mockResolvedValue([{ idempotencyKey: baseKey, resourceId: 'old-match' }]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ teamMatchId: 'old-match', tournamentId: 'tournament-1' }]);
    prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({ ...canonicalDetailsRow().teamMatch, hostTeamId: null, approvedApplicantTeamId: null });
    await service.createFixture(ownerUser, 'tournament-1', { groupId: 'group-1', round: 'group_a', fixtureNumber: 1 });
    expect(prisma.v1IdempotencyRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ idempotencyKey: baseKey + ':revision:1' }) }));
    expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: expect.not.stringMatching(/^old-match$/) }) }));
  });

  // W9-V2 — 저장되는 팀매치 제목도 화면과 같은 경기 이름을 쓴다(조별은 조 이름 + 라운드, 결선은 라운드만).
  it.each([
    ['조별 경기', { groupId: 'group-1', round: '조별 2라운드', fixtureNumber: 1 }, '테스트 대회 · A조 · 조별 2라운드 1'],
    ['조 없는 결선 2차전', { round: '4강', fixtureNumber: 3, legNumber: 2 }, '테스트 대회 · 4강 2차 3'],
  ])('createFixture: %s 의 팀매치 제목', async (_case, dto, title) => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({
      ...canonicalDetailsRow().teamMatch,
      hostTeamId: null,
      approvedApplicantTeamId: null,
    });

    await service.createFixture(ownerUser, 'tournament-1', dto);

    expect(prisma.v1TeamMatch.create.mock.calls.map((call: [{ data: { title: string } }]) => call[0].data.title)).toEqual([title]);
  });

  it('createFixture: missing canonical parent is rejected', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentMatchDetails.findFirst.mockResolvedValue(null);
    await expect(
      service.createFixture(ownerUser, 'tournament-1', {
        parentFixtureId: 'legacy-parent',
        round: 'semi_final',
        fixtureNumber: 1,
      }),
    ).rejects.toMatchObject({ response: { code: 'PARENT_MATCH_NOT_FOUND' } });
  });

  // ─── 명단 등번호·이름이 경기 참가자로 이어지는가 (Task 167 A1) ─────────────────
  //
  // 여기가 대회 경기의 참가자가 만들어지는 **유일한 자리**다. 받는 쪽
  // (`createFromSourceInTransaction`)은 진작에 `jerseyNumber` 를 썼는데 **보내는 쪽만
  // 비어 있어서**, 팀장이 명단에 넣은 번호가 경기로 이어지지 않았다.

  /** 홈·어웨이 각 1명씩 명단이 있는 대진을 만드는 준비. */
  function arrangeFixtureWithRoster(options: {
    jerseysByPlayerId?: Array<{ id: string; jersey_number: number | null }>;
    homeNickname?: string | null;
  } = {}) {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue({ id: 'reg-home' });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      {
        id: 'reg-home',
        teamId: 'team-home',
        team: { id: 'team-home', name: '홈 팀' },
        players: [
          {
            id: 'player-home',
            userId: 'user-home',
            realName: '홍길동',
            registrationId: 'reg-home',
            user: {
              profile:
                options.homeNickname === undefined
                  ? { nickname: '길동이', displayName: null }
                  : { nickname: options.homeNickname, displayName: null },
            },
          },
        ],
      },
      {
        id: 'reg-away',
        teamId: 'team-away',
        team: { id: 'team-away', name: '어웨이 팀' },
        players: [
          {
            id: 'player-away',
            userId: 'user-away',
            realName: '김철수',
            registrationId: 'reg-away',
            user: { profile: { nickname: '철수', displayName: null } },
          },
        ],
      },
    ]);
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { id: 'player-home', registrationId: 'reg-home', userId: 'user-home', removedAt: null },
      { id: 'player-away', registrationId: 'reg-away', userId: 'user-away', removedAt: null },
    ]);
    prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({
      ...canonicalDetailsRow().teamMatch,
      hostTeamId: 'team-home',
      approvedApplicantTeamId: 'team-away',
      game: {
        ...canonicalDetailsRow().teamMatch.game,
        sides: [
          { id: 'side-home', sideKey: 'HOME', teamId: 'team-home' },
          { id: 'side-away', sideKey: 'AWAY', teamId: 'team-away' },
        ],
      },
    });
    prisma.$queryRaw.mockResolvedValue(options.jerseysByPlayerId ?? []);
  }

  /** `createFromSourceInTransaction` 에 넘어간 참가자 배열. */
  function participantsSent() {
    const call = games.createFromSourceInTransaction.mock.calls.at(-1);
    return (call?.[1] as { participants: Array<Record<string, unknown>> }).participants;
  }

  it('명단에 적은 등번호가 경기 참가자로 넘어간다', async () => {
    arrangeFixtureWithRoster({
      jerseysByPlayerId: [
        { id: 'player-home', jersey_number: 7 },
        { id: 'player-away', jersey_number: 10 },
      ],
    });

    await service.createFixture(ownerUser, 'tournament-1', {
      groupId: 'group-1',
      round: 'group_a',
      fixtureNumber: 1,
      homeRegistrationId: 'reg-home',
      awayRegistrationId: 'reg-away',
    } as never);

    expect(participantsSent()).toEqual([
      expect.objectContaining({ sourceParticipantId: 'player-home', jerseyNumber: 7 }),
      expect.objectContaining({ sourceParticipantId: 'player-away', jerseyNumber: 10 }),
    ]);
  });

  it('번호를 안 단 선수는 번호 없이 간다 — 0 으로 채우지 않는다', async () => {
    // 맵에 아예 없는 것이 "번호 없음" 이다. `?? 0` 같은 폴백을 넣으면 **아무도 안 단 번호가
    // 전원 0 번**이 되어 명단과 어긋난다.
    arrangeFixtureWithRoster({ jerseysByPlayerId: [{ id: 'player-home', jersey_number: 7 }] });

    await service.createFixture(ownerUser, 'tournament-1', {
      groupId: 'group-1',
      round: 'group_a',
      fixtureNumber: 1,
      homeRegistrationId: 'reg-home',
      awayRegistrationId: 'reg-away',
    } as never);

    const sent = participantsSent();
    expect(sent[0]).toMatchObject({ sourceParticipantId: 'player-home', jerseyNumber: 7 });
    expect(sent[1].jerseyNumber).toBeUndefined();
  });

  it('참가자 이름은 닉네임이다 — 실명을 경기 기록에 싣지 않는다', async () => {
    // 정본 §3: "명단은 등번호 + 이름(닉네임)", 명단 공개도 등번호·이름. 실명은 자격
    // 가드에만 쓰라고 받은 값이라 관전 화면까지 흐르면 안 된다.
    arrangeFixtureWithRoster();

    await service.createFixture(ownerUser, 'tournament-1', {
      groupId: 'group-1',
      round: 'group_a',
      fixtureNumber: 1,
      homeRegistrationId: 'reg-home',
      awayRegistrationId: 'reg-away',
    } as never);

    const sent = participantsSent();
    expect(sent[0].displayNameSnapshot).toBe('길동이');
    expect(sent[0].displayNameSnapshot).not.toBe('홍길동');
  });

  /**
   * **폴백은 실명이 아니라 `'팀원'` 이다.** 예전엔 실명으로 떨어뜨리며 "이름 없는 참가자보다
   * 낫다"고 정당화했는데, 스키마상 이 폴백의 실제 발동 조건은 **프로필 행 부재** 하나뿐이고
   * (`V1TournamentPlayer.userId` non-null · `V1UserProfile.nickname` non-null),
   * **읽는 쪽 게이팅도 정확히 그 조건에서 스냅샷을 그대로 반환한다** — 두 폴백이 같은
   * 구멍으로 함께 뚫려 방어가 되지 않았다. 팀 매치 쪽이 이미 `'팀원'` 이고 그쪽이 맞다.
   */
  it('닉네임이 없으면 팀원으로 폴백한다 — 실명을 스냅샷에 남기지 않는다', async () => {
    arrangeFixtureWithRoster({ homeNickname: null });

    await service.createFixture(ownerUser, 'tournament-1', {
      groupId: 'group-1',
      round: 'group_a',
      fixtureNumber: 1,
      homeRegistrationId: 'reg-home',
      awayRegistrationId: 'reg-away',
    } as never);

    expect(participantsSent()[0].displayNameSnapshot).toBe('팀원');
    expect(participantsSent()[0].displayNameSnapshot).not.toBe('홍길동');
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

    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
  });

  it('recordResult: rejects the generic tournament result writer without persistence', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);

    await expect(
      service.recordResult(ownerUser, 'fixture-1', { homeScore: 2, awayScore: 1 }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_RESULT_DERIVED_ONLY' } });

    expect(prisma.v1Game.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('deleteFixtureResult: rejects legacy result deletion without persistence', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);

    await expect(service.deleteFixtureResult(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_RESULT_DERIVED_ONLY' },
    });

    expect(prisma.v1Game.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
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
  // 읽는다 -- 별도 legacy result row 없이도 동작해야 한다.

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

      },
    ]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalStandingsDetail(
        gameOfficialResultRow({
          currentOfficialRevision: {
            id: 'revision-1',
            state: 'OFFICIAL',
            score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false },
            officialAt: new Date('2026-06-14T00:00:00Z'),
            createdAt: new Date('2026-06-14T00:00:00Z'),
            updatedAt: new Date('2026-06-14T00:00:00Z'),
          },
        }),
      ),
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

    // 불변식(§7.1): recalculateAndUpsertGroupStandings가 호출되는 경로는 같은 tx에서
    // recalculateAndUpsertOverallStandings도 호출해야 한다 — 조별 화면과 통합 화면이
    // 어긋나지 않도록. 같은 승자(reg-1, 승점 3)가 통합 순위에도 반영되었는지 확인.
    const overallUpsertCalls = (prisma.v1TournamentOverallStanding.upsert as jest.Mock).mock.calls;
    expect(overallUpsertCalls.length).toBe(2);
    const overallPos1 = overallUpsertCalls.find((c) => c[0].create.position === 1)?.[0].create;
    expect(overallPos1).toMatchObject({
      tournamentId: 'tournament-1',
      registrationId: 'reg-1',
      points: 3,
      wins: 1,
    });
  });

  it('recalculateStandings: draw fixture(라이브 종료된 평평한 score) → both teams get 1 point', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],

      },
    ]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalStandingsDetail(
        gameOfficialResultRow({
          currentOfficialRevision: {
            id: 'revision-2',
            state: 'OFFICIAL',
            score: { home: 1, away: 1 },
            officialAt: new Date('2026-06-14T00:00:00Z'),
            createdAt: new Date('2026-06-14T00:00:00Z'),
            updatedAt: new Date('2026-06-14T00:00:00Z'),
          },
        }),
      ),
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

      },
    ]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalStandingsDetail(
        gameOfficialResultRow({
          currentOfficialRevision: {
            id: 'revision-void',
            state: 'VOID',
            score: { home: 2, away: 1 },
            officialAt: null,
            createdAt: new Date('2026-06-14T00:00:00Z'),
            updatedAt: new Date('2026-06-14T00:00:00Z'),
          },
        }),
      ),
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    // 경기 없음과 동일 — 둘 다 0승0무0패, seeded draw로만 순서가 갈린다.
    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    for (const call of upsertCalls) {
      expect(call[0].create).toMatchObject({ points: 0, wins: 0, draws: 0, losses: 0 });
    }
  });

  it('recalculateStandings: canonical TeamMatch가 없는 legacy fixture 결과는 순위에 포함하지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // canonical Details 조회에 포함되지 않은 legacy fixture의 result는 읽지 않는다.
    // 이 모양이 남아 있어도 canonical migration이 완료되기 전에는 순위를 조용히
    // 재구성하지 않고, 양 팀의 초기 0점만 유지해야 한다.
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],

      },
    ]);
    prisma.v1TournamentStanding.upsert.mockResolvedValue({});

    await service.recalculateStandings(ownerUser, 'tournament-1');

    const upsertCalls = (prisma.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    const home = upsertCalls.find((c) => c[0].create.registrationId === 'reg-1')?.[0].create;
    const away = upsertCalls.find((c) => c[0].create.registrationId === 'reg-2')?.[0].create;
    expect(home).toMatchObject({ points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
    expect(away).toMatchObject({ points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
  });

  it('recalculateStandings: 새 경로 OFFICIAL 리비전과 레거시 result가 둘 다 있으면 새 경로 스코어가 이긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    // canonical Details 경로는 1:1 무승부를 제공한다. 남아 있는 legacy fixture
    // 모양의 result가 달라도 canonical 결과만 집계해야 한다.
    prisma.v1TournamentGroup.findMany.mockResolvedValue([
      {
        ...groupRow(),
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],

      },
    ]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalStandingsDetail(
        gameOfficialResultRow({
          currentOfficialRevision: {
            id: 'revision-priority',
            state: 'OFFICIAL',
            score: { home: 1, away: 1 },
            officialAt: new Date('2026-06-14T00:00:00Z'),
            createdAt: new Date('2026-06-14T00:00:00Z'),
            updatedAt: new Date('2026-06-14T00:00:00Z'),
          },
        }),
      ),
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
 // 경기 없음
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

  it('getBracket: an empty canonical competition returns no fixtures', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    expect((await service.getBracket(ownerUser, 'tournament-1')).fixtures).toEqual([]);
  });

  it('getBracket: canonical Details without a TeamMatch game fails typed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalBracketRow({
        teamMatch: { ...canonicalDetailsRow().teamMatch, videos: [], game: null },
      }),
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    await expect(service.getBracket(ownerUser, 'tournament-1')).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        details: { teamMatchIds: ['fixture-1'] },
      },
    });
  });

  it('getBracket: canonical tournament TeamMatch without Details fails closed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([]);
    prisma.v1TeamMatch.findMany.mockResolvedValue([{ id: 'orphan-match' }]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    await expect(service.getBracket(ownerUser, 'tournament-1')).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        details: { teamMatchIds: ['orphan-match'] },
      },
    });
  });

  it('getBracket: null-kind tournament also rejects canonical TeamMatch without Details', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ kind: null }));
    prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([]);
    prisma.v1TeamMatch.findMany.mockResolvedValue([{ id: 'orphan-match' }]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    await expect(service.getBracket(ownerUser, 'tournament-1')).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        details: { teamMatchIds: ['orphan-match'] },
      },
    });
  });

  it('getBracket: canonical TeamMatch with an unsupported Game source fails closed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalBracketRow({
        teamMatch: {
          ...canonicalDetailsRow().teamMatch,
          videos: [],
          game: {
            ...canonicalDetailsRow().teamMatch.game,
            sourceType: 'COMPETITION_FIXTURE',
            teamMatchId: 'fixture-1',
          },
        },
      }),
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    await expect(service.getBracket(ownerUser, 'tournament-1')).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        details: { teamMatchIds: ['fixture-1'] },
      },
    });
  });

  it.each([
    ['deleted canonical TeamMatch', { deletedAt: new Date('2026-06-15T00:00:00Z') }],
    ['canonical TeamMatch owned by another tournament', { tournamentId: 'other-tournament' }],
  ])('getBracket: %s fails closed', async (_label, teamMatchOverride) => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalBracketRow({
        teamMatch: {
          ...canonicalDetailsRow().teamMatch,
          ...teamMatchOverride,
          videos: [],
        },
      }),
    ]);
    prisma.v1TournamentStanding.findMany.mockResolvedValue([]);

    await expect(service.getBracket(ownerUser, 'tournament-1')).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_MATCH_GAME_MISSING',
        details: { teamMatchIds: ['fixture-1'] },
      },
    });
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
    const canonicalResultRow = canonicalBracketRow({
      teamMatch: {
        ...canonicalDetailsRow().teamMatch,
        videos: [],
        game: {
          ...gameOfficialResultRow(),
          state: 'ENDED',
          sourceType: 'TEAM_MATCH',
        },
      },
    });
    // The response is keyed by the stable TeamMatch UUID even if an expand/read
    // query ever returns the same canonical row twice.
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([canonicalResultRow, canonicalResultRow]);
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
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalBracketRow({
        homeRegistrationId: null,
        awayRegistrationId: null,
        homeRegistration: null,
        awayRegistration: null,
        teamMatch: {
          ...canonicalDetailsRow().teamMatch,
          videos: [],
          // TBD registrations are valid canonical rows; the TeamMatch game
          // still exists and remains the authoritative source.
          game: {
            ...canonicalDetailsRow().teamMatch.game,
            sourceType: 'TEAM_MATCH',
            state: 'SCHEDULED',
            participants: [],
            events: [],
            currentOfficialRevision: null,
          },
        },
      }),
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
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      canonicalBracketRow({
        teamMatch: {
          ...canonicalDetailsRow().teamMatch,
          videos: [],
          game: {
            ...gameOfficialResultRow({
          participants: [{ id: 'participant-1', sideId: 'side-home', displayNameSnapshot: '김선수' }],
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
            state: 'ENDED',
            sourceType: 'TEAM_MATCH',
          },
        },
      }),
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

  it('updateFixture: missing canonical match returns not found without writing', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);

    await expect(service.updateFixture(ownerUser, 'fixture-1', { scheduledAt: '2026-08-01T09:00:00.000Z' })).rejects.toMatchObject({
      response: { code: 'FIXTURE_NOT_FOUND' },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('deleteFixture: missing canonical match returns not found without writing', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_NOT_FOUND' },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('updateFixture: soft-deleted canonical TeamMatch is a 404 with no transaction or audit mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, deletedAt: new Date('2026-08-01T00:00:00.000Z') },
    }));

    await expect(service.updateFixture(ownerUser, 'fixture-1', { venue: '새 경기장' })).rejects.toMatchObject({
      response: { code: 'FIXTURE_NOT_FOUND' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('deleteFixture: soft-deleted canonical TeamMatch is a 404 before Game/result checks', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, deletedAt: new Date('2026-08-01T00:00:00.000Z') },
    }));

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_NOT_FOUND' },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('updateFixture: TeamMatch deleted after the pre-read is rejected by the transaction lock', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
    queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: new Date('2026-08-01T00:00:00.000Z') });

    await expect(service.updateFixture(ownerUser, 'fixture-1', { venue: '경기장' })).rejects.toMatchObject({
      response: { code: 'FIXTURE_NOT_FOUND' },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('updateFixture: 신규 경로에 OFFICIAL 결과가 있으면 팀 변경이 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, game: { ...canonicalDetailsRow().teamMatch.game, currentOfficialRevisionId: 'revision-1', currentOfficialRevision: { state: 'OFFICIAL' } } },
    }));

    await expect(
      service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_HAS_RESULT' } });
  });

  it('updateFixture: OFFICIAL 경기의 번호만 수정하고 변경 전·후 번호를 감사에 남긴다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    const base = canonicalDetailsRow({ group: { name: 'A조' } });
    const detail = {
      ...base,
      teamMatch: {
        ...base.teamMatch,
        status: 'completed',
        game: {
          ...base.teamMatch.game,
          state: 'ENDED',
          currentOfficialRevisionId: 'revision-1',
          currentOfficialRevision: { state: 'OFFICIAL' },
        },
      },
    };
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(detail);
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValue(detail);
    prisma.v1TournamentMatchDetails.findFirst.mockResolvedValue(null);
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ id: 'reg-1', teamId: 'team-old', team: { name: '홈' } }, { id: 'reg-2', teamId: 'team-away', team: { name: '어웨이' } }]);
    queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'ENDED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: 'revision-1' }, { id: 'fixture-1', deletedAt: null });
    prisma.v1GameResultRevision.findUnique.mockResolvedValue({ state: 'OFFICIAL' });
    prisma.v1TeamMatch.update.mockResolvedValue(detail.teamMatch);
    expect(await service.updateFixture(ownerUser, 'fixture-1', { fixtureNumber: 7 })).toMatchObject({ id: 'fixture-1', fixtureNumber: 7 });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ beforeJson: { fixtureNumber: 1 }, afterJson: expect.objectContaining({ fixtureNumber: 7 }) }) }));
    expect(prisma.v1Game.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentMatchAdvancementEdge.deleteMany).not.toHaveBeenCalled();
  });

  it('updateFixture: 결과가 VOID면 팀 변경이 막히지 않는다(결과 없음과 동일 취급)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, game: { ...canonicalDetailsRow().teamMatch.game, currentOfficialRevision: { state: 'VOID' } } },
    }));
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValue(canonicalDetailsRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ id: 'reg-3' }));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { id: 'reg-3', teamId: 'team-new', team: { name: '새 팀' } },
      { id: 'reg-2', teamId: 'team-away', team: { name: '어웨이 팀' } },
    ]);
    queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: 'revision-void' }, { id: 'fixture-1', deletedAt: null });
    prisma.v1TeamMatch.update.mockResolvedValue({ id: 'fixture-1', tournamentId: 'tournament-1', title: '테스트 경기', startAt: null, placeName: null, status: 'matched', createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z') });

    const result = await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });
    expect(result).toMatchObject({ id: 'fixture-1' });
  });

  it('updateFixture: 사이드의 팀이 바뀌면 그 사이드의 전술보드를 같은 트랜잭션에서 지운다', async () => {
    // 팀 교체는 결과가 나오기 전이면 정상 운영 동작이다(FIXTURE_HAS_RESULT 는 결과가
    // 있을 때만 막는다). 그런데 전술보드는 sideId 로 붙어 있고 자기 teamId 를 따로 들고
    // 있어서, 지우지 않으면 옛 팀의 배치가 새 팀 자리에 남는다 — 읽기 쪽 불변식 검사가
    // 409 로 막아 주지만 아무도 그 보드를 고칠 수 없어 영구히 잠긴다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValue(canonicalDetailsRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ id: 'reg-3' }));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { id: 'reg-3', teamId: 'team-new', team: { name: '새 팀' } },
      { id: 'reg-2', teamId: 'team-away', team: { name: '어웨이 팀' } },
    ]);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      team: { id: 'team-new', name: '새로 들어온 팀' },
    });
    queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: null });
    prisma.v1TeamMatch.update.mockResolvedValue({ id: 'fixture-1', tournamentId: 'tournament-1', title: '테스트 경기', startAt: null, placeName: null, status: 'matched', createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z') });

    await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });

    expect(prisma.v1GameSide.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'side-home' },
        data: expect.objectContaining({ teamId: 'team-new' }),
      }),
    );
    expect(prisma.v1TeamTacticsBoard.deleteMany).toHaveBeenCalledWith({
      where: { gameId: 'game-1', sideId: 'side-home' },
    });
  });

  it('updateFixture: 사이드의 팀이 그대로면 전술보드를 지우지 않는다', async () => {
    // 일정·장소만 고치는 흔한 호출에서 팀의 전술보드가 날아가면 안 된다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, hostTeamId: 'team-same', game: { ...canonicalDetailsRow().teamMatch.game, sides: [{ id: 'side-home', sideKey: 'HOME', teamId: 'team-same' }, { id: 'side-away', sideKey: 'AWAY', teamId: 'team-away' }] } },
    }));
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, hostTeamId: 'team-same', game: { ...canonicalDetailsRow().teamMatch.game, sides: [{ id: 'side-home', sideKey: 'HOME', teamId: 'team-same' }, { id: 'side-away', sideKey: 'AWAY', teamId: 'team-away' }] } },
    }));
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ id: 'reg-3' }));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { id: 'reg-3', teamId: 'team-same', team: { name: '그대로인 팀' } },
      { id: 'reg-2', teamId: 'team-away', team: { name: '어웨이 팀' } },
    ]);
    // 배정된 팀이 이미 그 사이드의 팀과 같다 → sideTeamUpdates 가 비어야 한다.
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      team: { id: 'team-same', name: '그대로인 팀' },
    });
    queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: null });
    prisma.v1TeamMatch.update.mockResolvedValue({ id: 'fixture-1', tournamentId: 'tournament-1', title: '테스트 경기', startAt: null, placeName: null, status: 'matched', createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z') });

    await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });

    expect(prisma.v1GameSide.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamTacticsBoard.deleteMany).not.toHaveBeenCalled();
  });

  it('deleteFixture: 신규 경로에 OFFICIAL 결과가 있으면 삭제가 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, game: { ...canonicalDetailsRow().teamMatch.game, currentOfficialRevisionId: 'revision-1', currentOfficialRevision: { state: 'OFFICIAL' } } },
    }));

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_HAS_RESULT' },
    });
  });

  it('deleteFixture: pre-start scheduled match is removed without deleting Game or audit history', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
    await expect(service.deleteFixture(ownerUser, 'fixture-1')).resolves.toEqual({ deleted: true });
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith({ where: { id: 'fixture-1' }, data: { status: 'archived', deletedAt: expect.any(Date), homeSlotId: null, awaySlotId: null } });
    expect(prisma.v1Game.update).toHaveBeenCalledWith({ where: { id: 'game-1' }, data: { state: 'CANCELLED', version: { increment: 1 } } });
    expect(prisma.v1TournamentMatchDetails.update).toHaveBeenCalledWith({ where: { teamMatchId: 'fixture-1' }, data: { groupId: null, parentTeamMatchId: null, round: 'group_a:deleted:fixture-1' } });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalled();
  });
  it('deleteFixture: started tournament cannot delete even an unstarted match', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({ tournament: tournamentRow() }));
    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({ response: { code: 'FIXTURE_ALREADY_STARTED' } });
    expect(prisma.v1Game.update).not.toHaveBeenCalled();
  });
  it('deleteFixture: started game cannot be deleted in a pre-start tournament', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    const row = canonicalDetailsRow();
    row.teamMatch.game.state = 'LIVE';
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(row);
    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({ response: { code: 'FIXTURE_ALREADY_STARTED' } });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('deleteFixture: non-admin cannot remove a fixture', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.deleteFixture(nonAdminUser, 'fixture-1')).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.v1TournamentMatchDetails.findUnique).not.toHaveBeenCalled();
  });
  it('deleteFixture: league canonical rows remain outside the tournament surface', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
    prisma.v1Tournament.findFirst.mockImplementation(kindAwareFindFirst(tournamentRow({ kind: 'regular_league' })));
    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });
  it('deleteFixture: assigned downstream teams block deletion and preserve connections', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
    prisma.v1TournamentMatchAdvancementEdge.findMany.mockResolvedValue([{ target: canonicalDetailsRow() }]);
    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({ response: { code: 'FIXTURE_DOWNSTREAM_ASSIGNED' } });
    expect(prisma.v1TournamentMatchAdvancementEdge.deleteMany).not.toHaveBeenCalled();
    expect(prisma.v1Game.update).not.toHaveBeenCalled();
  });
  it('deleteFixture: unassigned next fixture survives while its removed source is disconnected', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
    prisma.v1TournamentMatchAdvancementEdge.findMany.mockResolvedValue([{ target: canonicalDetailsRow({ teamMatchId: 'quarter-1', homeRegistrationId: null, awayRegistrationId: null }) }]);
    await expect(service.deleteFixture(ownerUser, 'fixture-1')).resolves.toEqual({ deleted: true });
    expect(prisma.v1TournamentMatchAdvancementEdge.deleteMany).toHaveBeenCalledWith({ where: { OR: [{ sourceTeamMatchId: 'fixture-1' }, { targetTeamMatchId: 'fixture-1' }] } });
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledTimes(1);
  });

  it('deleteFixture: canonical Details without a TEAM_MATCH game fails typed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow({
      teamMatch: { ...canonicalDetailsRow().teamMatch, game: null },
    }));

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_MATCH_GAME_MISSING' },
    });
    expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });


  // ─── 조별리그 조 편성 정합: 경기에 들어가는 팀은 그 조에 편성돼 있어야 순위표에 나온다 ───

  describe('조 편성 정합', () => {
    type GroupTeamRow = { id: string; groupId: string; registrationId: string; sortOrder: number };
    let groupTeams: GroupTeamRow[];

    /** 조 편성 테이블을 메모리 상태로 흉내낸다 — 호출 횟수가 아니라 결과 행을 검증하기 위해서다. */
    function useStatefulGroupTeams(initial: GroupTeamRow[]) {
      groupTeams = [...initial];
      prisma.v1TournamentGroupTeam.findMany.mockImplementation(async ({ where }: { where: { groupId: string } }) =>
        groupTeams.filter((team) => team.groupId === where.groupId));
      prisma.v1TournamentGroupTeam.create.mockImplementation(async ({ data }: { data: Omit<GroupTeamRow, 'id'> }) => {
        const row = { id: `gt-${groupTeams.length + 1}`, ...data };
        groupTeams.push(row);
        return row;
      });
    }

    function arrangeCreateFixture(phase: 'group' | 'final') {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ format: 'league' }));
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase }));
      prisma.v1TournamentRegistration.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => registrationRow({ id: where.id }));
      prisma.v1TournamentRegistration.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ ...registrationRow({ id, teamId: `team-${id}` }), team: { id: `team-${id}`, name: id }, players: [] })));
      prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({ ...canonicalDetailsRow().teamMatch, hostTeamId: null, approvedApplicantTeamId: null });
    }

    it('편성 안 된 팀으로 조별리그 경기를 만들면 그 조에 편성한다 — 이미 편성된 팀은 중복 행 없이 그대로', async () => {
      arrangeCreateFixture('group');
      useStatefulGroupTeams([{ id: 'gt-existing', groupId: 'group-1', registrationId: 'reg-1', sortOrder: 3 }]);

      await service.createFixture(ownerUser, 'tournament-1', {
        groupId: 'group-1', round: '조별 1라운드', fixtureNumber: 1, homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2',
      } as never);

      expect(groupTeams.map(({ registrationId, sortOrder }) => ({ registrationId, sortOrder }))).toEqual([
        { registrationId: 'reg-1', sortOrder: 3 },
        { registrationId: 'reg-2', sortOrder: 4 },
      ]);
    });

    it('빈 조에 첫 경기를 만들면 두 팀이 0, 1 순서로 편성된다', async () => {
      arrangeCreateFixture('group');
      useStatefulGroupTeams([]);

      await service.createFixture(ownerUser, 'tournament-1', {
        groupId: 'group-1', round: '조별 1라운드', fixtureNumber: 1, homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2',
      } as never);

      expect(groupTeams.map(({ registrationId, sortOrder }) => ({ registrationId, sortOrder }))).toEqual([
        { registrationId: 'reg-1', sortOrder: 0 },
        { registrationId: 'reg-2', sortOrder: 1 },
      ]);
    });

    it('결선 단계 조의 경기는 조 편성을 건드리지 않는다', async () => {
      arrangeCreateFixture('final');
      useStatefulGroupTeams([]);

      await service.createFixture(ownerUser, 'tournament-1', {
        groupId: 'group-1', round: '결승', fixtureNumber: 1, homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2',
      } as never);

      expect(groupTeams).toEqual([]);
    });

    it('조 없는 경기는 조 편성을 건드리지 않는다', async () => {
      arrangeCreateFixture('group');
      useStatefulGroupTeams([]);

      await service.createFixture(ownerUser, 'tournament-1', {
        round: '4강', fixtureNumber: 1, homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2',
      } as never);

      expect(groupTeams).toEqual([]);
    });

    it('조별 경기의 팀을 바꾸면 새 팀이 그 조에 편성된다', async () => {
      arrangeCreateFixture('group');
      useStatefulGroupTeams([{ id: 'gt-existing', groupId: 'group-1', registrationId: 'reg-2', sortOrder: 0 }]);
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
      prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValue(canonicalDetailsRow());
      queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: null });
      prisma.v1TeamMatch.update.mockResolvedValue({ id: 'fixture-1', tournamentId: 'tournament-1', title: '테스트 경기', startAt: null, placeName: null, status: 'matched', createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z') });
      prisma.v1TournamentRegistration.findUnique.mockResolvedValue({ team: { id: 'team-reg-3', name: 'reg-3' } });

      await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });

      expect(groupTeams.map(({ registrationId }) => registrationId)).toEqual(['reg-2', 'reg-3']);
    });

    describe('removeGroupTeam', () => {
      function arrangeRemove(registrationId: string, phase: 'group' | 'quarter' = 'group') {
        prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
        prisma.v1TournamentGroupTeam.findUnique.mockImplementation(async () => ({
          id: 'gt-1', groupId: 'group-1', registrationId, isBye: false, sortOrder: 0, group: { tournamentId: 'tournament-1', phase },
        }));
        // 경기가 붙은 팀은 reg-busy 뿐이다.
        prisma.v1TournamentMatchDetails.count.mockImplementation(async ({ where }: { where: { OR: Array<Record<string, string>> } }) =>
          where.OR.some((side) => Object.values(side).includes('reg-busy')) ? 2 : 0);
      }

      it('그 조에 경기가 남아 있는 팀의 편성 해제는 409 로 막고 아무것도 지우지 않는다', async () => {
        arrangeRemove('reg-busy');

        await expect(service.removeGroupTeam(ownerUser, 'gt-1')).rejects.toMatchObject({
          response: { code: 'GROUP_TEAM_HAS_FIXTURES' },
        });
        expect(prisma.v1TournamentGroupTeam.delete).not.toHaveBeenCalled();
        expect(prisma.v1TournamentStanding.deleteMany).not.toHaveBeenCalled();
      });

      it('경기가 없는 팀의 편성 해제는 성공하고 순위 행도 정리한다', async () => {
        arrangeRemove('reg-idle');

        await expect(service.removeGroupTeam(ownerUser, 'gt-1')).resolves.toEqual({ deleted: true });
        expect(prisma.v1TournamentGroupTeam.delete).toHaveBeenCalledWith({ where: { id: 'gt-1' } });
        expect(prisma.v1TournamentStanding.deleteMany).toHaveBeenCalledWith({
          where: { groupId: 'group-1', registrationId: 'reg-idle' },
        });
      });

      it('결선 단계 조의 편성 해제는 기존대로 허용한다', async () => {
        arrangeRemove('reg-busy', 'quarter');

        await expect(service.removeGroupTeam(ownerUser, 'gt-1')).resolves.toEqual({ deleted: true });
      });
    });
  });

  // ─── 대진 …InTx 추출 함수 (tournament-bracket-tx.ts) ─────────────────────────

  const activeAdmin = { id: 'owner-admin-id', userId: 'owner-user-id', adminRole: 'owner' as const, status: 'active' as const };

  describe('createGroupInTx', () => {
    function makeTx(created: Record<string, unknown>) {
      return {
        v1TournamentGroup: { create: jest.fn().mockResolvedValue(created) },
        v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
        v1StatusChangeLog: { create: jest.fn() },
      };
    }

    it('입력을 빠짐없이 저장하고(결선 조의 advanceCount 포함) 감사 로그에 어드민 행 id 를 남긴다', async () => {
      const tx = makeTx(groupRow({ id: 'group-9', name: '조별 A', phase: 'group', sortOrder: 3, advanceCount: 2 }));

      const created = await createGroupInTx(tx as never, activeAdmin, 'tournament-1', {
        name: '조별 A', phase: 'group', sortOrder: 3, advanceCount: 2,
      });

      expect(created.id).toBe('group-9');
      expect(tx.v1TournamentGroup.create).toHaveBeenCalledWith({
        data: { tournamentId: 'tournament-1', name: '조별 A', phase: 'group', sortOrder: 3, advanceCount: 2 },
      });
      expect(tx.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'owner-admin-id',
          action: 'tournament.bracket.group.create',
          targetType: 'tournament_group',
          targetId: 'group-9',
          afterJson: { tournamentId: 'tournament-1', name: '조별 A', phase: 'group' },
        }),
      });
    });

    it('advanceCount 가 null 이면 null 로 저장한다 (0 이나 undefined 로 바뀌지 않는다)', async () => {
      const tx = makeTx(groupRow({ id: 'group-10', name: '결승', phase: 'final', advanceCount: null }));

      await createGroupInTx(tx as never, activeAdmin, 'tournament-1', { name: '결승', phase: 'final', sortOrder: 0, advanceCount: null });

      expect(tx.v1TournamentGroup.create).toHaveBeenCalledWith({
        data: { tournamentId: 'tournament-1', name: '결승', phase: 'final', sortOrder: 0, advanceCount: null },
      });
    });
  });

  describe('softDeleteTournamentFixtureInTx', () => {
    const linkedRow = (overrides: { gameState?: string } = {}) => canonicalDetailsRow({
      teamMatch: {
        ...canonicalDetailsRow().teamMatch,
        homeSlotId: 'slot-h',
        awaySlotId: 'slot-a',
        game: { ...canonicalDetailsRow().teamMatch.game, state: overrides.gameState ?? 'SCHEDULED' },
      },
    });

    it('자리에 연결된 경기를 지우면 두 자리 연결이 같은 update 로 풀린다 (자리 삭제가 FK 로 막히지 않게)', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow());

      await softDeleteTournamentFixtureInTx(prisma as never, activeAdmin, 'fixture-1');

      expect(prisma.v1TeamMatch.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith({
        where: { id: 'fixture-1' },
        data: { status: 'archived', deletedAt: expect.any(Date), homeSlotId: null, awaySlotId: null },
      });
      expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ targetId: 'fixture-1', toStatus: 'archived', actorType: 'admin', actorUserId: 'owner-user-id' }),
      });
    });

    it('시작된 경기는 지우지 못하고 자리 연결도 그대로 둔다', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow({ gameState: 'LIVE' }));

      await expect(softDeleteTournamentFixtureInTx(prisma as never, activeAdmin, 'fixture-1')).rejects.toMatchObject({
        response: { code: 'FIXTURE_ALREADY_STARTED' },
      });
      expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
    });

    it('대회 행 잠금은 호출자의 몫이다 — 이 함수는 v1_tournaments 를 raw 로 건드리지 않는다', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow());

      await softDeleteTournamentFixtureInTx(prisma as never, activeAdmin, 'fixture-1');

      const sql = prisma.$queryRaw.mock.calls.map((call) => Array.from(call[0] as readonly string[]).join('?'));
      expect(sql.length).toBeGreaterThan(0);
      expect(sql.some((text) => /\bv1_tournaments\b/.test(text))).toBe(false);
      expect(sql.some((text) => text.includes('v1_games'))).toBe(true);
    });
  });

  describe('assignTournamentFixtureSideInTx', () => {
    const resultRow = { id: 'fixture-1', tournamentId: 'tournament-1', title: '테스트 경기', startAt: null, placeName: null, status: 'matched', createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z') };
    const arrange = () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue({ tournamentId: 'tournament-1', groupId: 'group-1' });
      queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: null });
      prisma.v1TeamMatch.update.mockResolvedValue(resultRow);
    };

    it('어웨이를 null 로 비우면 어웨이 사이드만 "미정" 으로 돌아가고 홈은 건드리지 않는다', async () => {
      arrange();
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ id: 'reg-1', teamId: 'team-old', team: { name: '홈' } }]);

      await assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'fixture-1', side: 'AWAY', registrationId: null });

      expect(prisma.v1TournamentMatchDetails.update).toHaveBeenCalledWith({
        where: { teamMatchId: 'fixture-1' },
        data: { homeRegistrationId: 'reg-1', awayRegistrationId: null },
      });
      expect(prisma.v1GameSide.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1GameSide.update).toHaveBeenCalledWith({
        where: { id: 'side-away' },
        data: { teamId: null, displayNameSnapshot: '어웨이 팀 미정' },
      });
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ adminUserId: 'owner-admin-id', action: 'tournament.bracket.fixture.update', targetId: 'fixture-1' }),
      });
    });

    it('홈에 팀을 넣으면 홈 사이드만 바뀌고 어웨이 배정은 그대로다 (대조군)', async () => {
      arrange();
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([
        { id: 'reg-3', teamId: 'team-new', team: { name: '새 팀' } },
        { id: 'reg-2', teamId: 'team-away', team: { name: '어웨이 팀' } },
      ]);

      await assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'fixture-1', side: 'HOME', registrationId: 'reg-3' });

      expect(prisma.v1TournamentMatchDetails.update).toHaveBeenCalledWith({
        where: { teamMatchId: 'fixture-1' },
        data: { homeRegistrationId: 'reg-3', awayRegistrationId: 'reg-2' },
      });
      expect(prisma.v1GameSide.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1GameSide.update).toHaveBeenCalledWith({ where: { id: 'side-home' }, data: expect.objectContaining({ teamId: 'team-new' }) });
    });

    it('없는 경기는 404 이고 아무것도 쓰지 않는다', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(null);

      await expect(
        assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'ghost', side: 'HOME', registrationId: 'reg-1' }),
      ).rejects.toMatchObject({ response: { code: 'FIXTURE_NOT_FOUND' } });
      expect(prisma.v1TournamentMatchDetails.update).not.toHaveBeenCalled();
      expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
    });
  });

  describe('assertSidesNotSlotLinked', () => {
    const current = { homeSlotId: 'slot-h', awaySlotId: null, homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2' };

    it('자리에 연결된 사이드를 다른 팀으로 바꾸거나 비우려 하면 SLOT_LINKED', () => {
      expect(() => assertSidesNotSlotLinked(current, { homeRegistrationId: 'reg-3' })).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'SLOT_LINKED' }) }),
      );
      expect(() => assertSidesNotSlotLinked(current, { homeRegistrationId: null })).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'SLOT_LINKED' }) }),
      );
    });

    it('자리에 연결되지 않은 반대쪽 사이드는 자유롭게 바꾼다 (대조군)', () => {
      expect(() => assertSidesNotSlotLinked(current, { awayRegistrationId: 'reg-3' })).not.toThrow();
      expect(() => assertSidesNotSlotLinked(current, { awayRegistrationId: null })).not.toThrow();
    });

    it('연결된 사이드라도 현재와 같은 값이거나 보내지 않았으면 통과한다 (일정·장소만 고치는 요청)', () => {
      expect(() => assertSidesNotSlotLinked(current, { homeRegistrationId: 'reg-1' })).not.toThrow();
      expect(() => assertSidesNotSlotLinked(current, {})).not.toThrow();
    });

    it('원정 쪽만 연결돼 있으면 원정만 막는다', () => {
      const awayLinked = { ...current, homeSlotId: null, awaySlotId: 'slot-a' };
      expect(() => assertSidesNotSlotLinked(awayLinked, { awayRegistrationId: 'reg-9' })).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'SLOT_LINKED' }) }),
      );
      expect(() => assertSidesNotSlotLinked(awayLinked, { homeRegistrationId: 'reg-9' })).not.toThrow();
    });
  });

  describe('updateFixture 의 SLOT_LINKED 배선', () => {
    const linkedRow = (slots: { homeSlotId: string | null; awaySlotId: string | null }, official = false) => canonicalDetailsRow({
      teamMatch: {
        ...canonicalDetailsRow().teamMatch,
        ...slots,
        game: { ...canonicalDetailsRow().teamMatch.game, ...(official ? { currentOfficialRevisionId: 'revision-1', currentOfficialRevision: { state: 'OFFICIAL' } } : {}) },
      },
    });

    it('홈이 자리에 연결된 경기의 홈을 PATCH 로 바꾸면 409 SLOT_LINKED 이고 트랜잭션도 열지 않는다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow({ homeSlotId: 'slot-h', awaySlotId: null }));

      await expect(service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' })).rejects.toMatchObject({
        response: { code: 'SLOT_LINKED' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('연결되지 않은 홈을 바꾸는 요청은 SLOT_LINKED 를 거치지 않고 다음 가드(결과 잠금)까지 간다 (대조군)', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow({ homeSlotId: null, awaySlotId: 'slot-a' }, true));

      await expect(service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' })).rejects.toMatchObject({
        response: { code: 'FIXTURE_HAS_RESULT' },
      });
    });
  });

  // ─── …InTx 추출 함수 끝 (새 describe 는 이 줄 위에 추가한다) ───

});
