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
    v1TournamentRegistration: { findFirst: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    v1GameSide: { update: jest.Mock };
    v1TeamTacticsBoard: { deleteMany: jest.Mock };
    v1TournamentFixture: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    v1TournamentFixtureResult: { upsert: jest.Mock };
    v1TournamentFixtureVideo: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    v1TournamentFixtureGoal: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    v1TournamentPlayer: { findMany: jest.Mock };
    v1TournamentStanding: { upsert: jest.Mock; findMany: jest.Mock };
    v1TournamentOverallStanding: { upsert: jest.Mock; deleteMany: jest.Mock };
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
      v1TournamentRegistration: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      v1GameSide: { update: jest.fn().mockResolvedValue({}) },
      v1TeamTacticsBoard: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TournamentFixture: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      v1TournamentOverallStanding: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
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

  it('updateFixture: 사이드의 팀이 바뀌면 그 사이드의 전술보드를 같은 트랜잭션에서 지운다', async () => {
    // 팀 교체는 결과가 나오기 전이면 정상 운영 동작이다(FIXTURE_HAS_RESULT 는 결과가
    // 있을 때만 막는다). 그런데 전술보드는 sideId 로 붙어 있고 자기 teamId 를 따로 들고
    // 있어서, 지우지 않으면 옛 팀의 배치가 새 팀 자리에 남는다 — 읽기 쪽 불변식 검사가
    // 409 로 막아 주지만 아무도 그 보드를 고칠 수 없어 영구히 잠긴다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      game: {
        id: 'game-1',
        currentOfficialRevision: null,
        sides: [{ id: 'side-home', sideKey: 'HOME', teamId: 'team-old' }],
      },
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ id: 'reg-3' }));
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      team: { id: 'team-new', name: '새로 들어온 팀' },
    });
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ homeRegistrationId: 'reg-3' }));

    await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });

    expect(prisma.v1GameSide.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'side-home' },
        data: expect.objectContaining({ teamId: 'team-new' }),
      }),
    );
    expect(prisma.v1TeamTacticsBoard.deleteMany).toHaveBeenCalledWith({
      where: { sideId: 'side-home' },
    });
  });

  it('updateFixture: 사이드의 팀이 그대로면 전술보드를 지우지 않는다', async () => {
    // 일정·장소만 고치는 흔한 호출에서 팀의 전술보드가 날아가면 안 된다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue({
      ...fixtureRow(),
      game: {
        id: 'game-1',
        currentOfficialRevision: null,
        sides: [{ id: 'side-home', sideKey: 'HOME', teamId: 'team-same' }],
      },
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ id: 'reg-3' }));
    // 배정된 팀이 이미 그 사이드의 팀과 같다 → sideTeamUpdates 가 비어야 한다.
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      team: { id: 'team-same', name: '그대로인 팀' },
    });
    prisma.v1TournamentFixture.update.mockResolvedValue(fixtureRow({ homeRegistrationId: 'reg-3' }));

    await service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' });

    expect(prisma.v1GameSide.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamTacticsBoard.deleteMany).not.toHaveBeenCalled();
  });

  it('deleteFixture: 신규 경로에 OFFICIAL 결과가 있으면 삭제가 409로 막힌다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(
      deletableFixtureRow({ game: { id: 'game-1', currentOfficialRevision: { state: 'OFFICIAL' } } }),
    );

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
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(
      deletableFixtureRow({ result: { id: 'legacy-result-1' } }),
    );

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_HAS_RESULT' },
    });
  });

  it('deleteFixture: 아무것도 매달려 있지 않으면 삭제된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(deletableFixtureRow());

    const result = await service.deleteFixture(ownerUser, 'fixture-1');
    expect(result).toEqual({ deleted: true });
  });

  // 대회 경기는 만들어질 때 항상 게임과 GAME_CREATED 감사를 동반한다. 그 대진에 delete() 를
  // 그대로 부르면 FK 위반(P2003)이 매핑 없이 500 으로 나가서, 운영자는 휴지통을 눌러 놓고
  // "서버 오류" 만 본다. 무엇이 막고 있는지 이름을 붙여 409 로 돌려준다.
  it.each([
    ['게임이 붙은', { game: { id: 'game-1', currentOfficialRevision: null }, _count: { operationAudits: 1, staffScopes: 0 } }, '경기 기록'],
    ['감사 기록만 남은', { _count: { operationAudits: 1, staffScopes: 0 } }, '운영 감사 기록'],
    ['스태프가 배정된', { _count: { operationAudits: 0, staffScopes: 1 } }, '스태프 배정'],
  ])('deleteFixture: %s 대진은 500 대신 이유를 말하는 409 로 거절한다', async (_label, overrides, reason) => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(deletableFixtureRow(overrides));

    const error = await service
      .deleteFixture(ownerUser, 'fixture-1')
      .then(() => null)
      .catch((err: ConflictException) => err);
    const response = error!.getResponse() as { code: string; message: string };

    expect(response.code).toBe('FIXTURE_NOT_DELETABLE');
    expect(response.message).toContain(reason);
    expect(prisma.v1TournamentFixture.deleteMany).not.toHaveBeenCalled();
  });

  // 판정과 DELETE 사이에 다른 요청이 경기를 붙일 수 있다. where 에 전제를 다시 적어(CAS)
  // 0건이 지워지게 하고, 0건이면 롤백한다 — 그대로 delete() 를 부르면 같은 상황이 500 이다.
  it('deleteFixture: 판정 직후 경기가 붙어 0건이 지워지면 감사 로그도 남기지 않고 거절한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1TournamentFixture.findUnique.mockResolvedValue(deletableFixtureRow());
    prisma.v1TournamentFixture.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteFixture(ownerUser, 'fixture-1')).rejects.toMatchObject({
      response: { code: 'FIXTURE_NOT_DELETABLE' },
    });
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });
});
