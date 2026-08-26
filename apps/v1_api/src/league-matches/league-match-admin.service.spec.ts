/**
 * league-match-admin.service.spec.ts
 *
 * 리그 대진 자동 생성이 만드는 **자동 로스터**가 신원 연결(V1ParticipantIdentityLinkCurrent)을
 * 만들지 않는다는 것을 고정한다.
 *
 * 왜 "만들지 않는다"가 계약인가: 자동 로스터는 팀이 이 경기를 위해 작성한 명단이 아니라
 * 대진 생성 시점의 **팀 전체 활성 멤버 스냅샷**이다. 거기에 연결을 만들면 한 경기도 뛰지
 * 않은 팀원이 "연결된 기록이 있는 사람"이 되어
 *   · 선수 카드가 "기록 공개 동의를 켜면 골·도움·출전이 열려요"라고 거짓 안내를 하고
 *     (profile/player-card.spec.ts 의 "연결된 기록이 아예 없는 사용자" 블록이 막는 결함),
 *   · 상호평가 대상 로스터(reviews.service.ts)에 뛰지 않은 팀원 전원이 올라온다.
 * 개인 기록으로 이어지는 연결은 팀이 실제로 작성한 라인업에서만 생긴다
 * (team-matches/team-match-lineup.service.ts saveLineup — 그쪽 스펙이 담당).
 *
 * 그래서 이 스펙은 **GamesService 를 목으로 바꾸지 않고 진짜 구현을 쓴다.** 목을 쓰면
 * "userId 를 안 실었다"까지만 볼 수 있고 "그래서 연결이 0건이다"는 증명되지 않는다 —
 * 자동 연결을 만드는 쪽은 GamesService.createFromSourceInTransaction 이기 때문이다.
 * 가짜 tx 는 호출된 statement 를 전부 기록하므로 트랜잭션 부하(참가자당 statement 수)도
 * 같은 하네스에서 직접 센다.
 */
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { GameTakeoverService } from '../games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../games/games.service';
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeagueMatchAdminService } from './league-match-admin.service';

const adminUser: V1AuthUser = {
  id: 'admin-user-id',
  email: 'admin@test.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

/** 팀 하나의 활성 멤버십 — 실제 `loadTeamsWithMembers` select 투영과 같은 모양. */
function teamRow(id: string, name: string, membershipIds: string[]) {
  return {
    id,
    name,
    memberships: membershipIds.map((membershipId) => ({
      id: membershipId,
      user: { profile: { nickname: `${membershipId} 님`, displayName: null } },
    })),
  };
}

interface FakeState {
  participants: Array<{ id: string; sideId: string; userId: string | null; displayNameSnapshot: string }>;
  sides: Array<{ id: string; sideKey: string }>;
  links: Array<{ participantId: string; userId: string }>;
  linkEvents: Array<{ participantId: string; action: string; userId: string }>;
  /** 이 트랜잭션에서 실제로 실행된 statement 이름(`모델.메서드`) 순서대로. */
  calls: string[];
}

function createFake() {
  const state: FakeState = { participants: [], sides: [], links: [], linkEvents: [], calls: [] };
  let seq = 0;
  const next = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };
  /** 모든 가짜 statement 는 이 래퍼를 지나 호출 기록을 남긴다. */
  const track = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => {
    return (...args: A): R => {
      state.calls.push(name);
      return fn(...args);
    };
  };

  const tx = {
    v1League: {
      findUnique: track('v1League.findUnique', async () => ({
        id: 'league-1',
        title: '테스트 리그',
        sportId: 'sport-futsal',
        regionId: 'region-1',
        startsOn: new Date('2026-09-05T00:00:00.000Z'),
        state: 'scheduled',
        teams: [{ teamId: 'team-a' }, { teamId: 'team-b' }],
      })),
      update: track('v1League.update', async () => ({ id: 'league-1' })),
    },
    v1Sport: { findFirst: track('v1Sport.findFirst', async () => ({ code: 'futsal' })) },
    v1CompetitionConfigVersion: {
      findFirst: track('v1CompetitionConfigVersion.findFirst', async () => ({ id: 'config-1' })),
      findUnique: track('v1CompetitionConfigVersion.findUnique', async () => ({
        id: 'config-1',
        status: 'ACTIVE',
        periods: { count: 2 },
        visibility: { mode: 'live' },
      })),
    },
    v1Team: {
      findMany: track('v1Team.findMany', async () => [
        teamRow('team-a', 'A팀', ['membership-a1', 'membership-a2']),
        teamRow('team-b', 'B팀', ['membership-b1', 'membership-b2']),
      ]),
    },
    v1TeamMatch: {
      count: track('v1TeamMatch.count', async () => 0),
      create: track('v1TeamMatch.create', async () => ({ id: 'team-match-1' })),
    },
    v1TeamMatchApplication: {
      create: track('v1TeamMatchApplication.create', async () => ({ id: 'application-1' })),
    },
    v1IdempotencyRecord: {
      findUnique: track('v1IdempotencyRecord.findUnique', async () => null),
      create: track('v1IdempotencyRecord.create', async () => ({})),
    },
    v1Game: {
      findFirst: track('v1Game.findFirst', async () => null),
      // writeAudit 이 대회 픽스처 스코프를 읽는 조회. 리그 대진은 팀매치 소스라 null 이다.
      findUnique: track('v1Game.findUnique', async () => ({ tournamentFixture: null })),
      create: track('v1Game.create', async (args: { data: { sourceType: string; competitionConfigVersionId: string } }) => ({
        id: 'game-1',
        sourceType: args.data.sourceType,
        competitionConfigVersionId: args.data.competitionConfigVersionId,
        state: 'SCHEDULED',
        version: 0,
      })),
    },
    v1GameSide: {
      create: track('v1GameSide.create', async (args: { data: { sideKey: string } }) => {
        const row = { id: next('side'), sideKey: args.data.sideKey };
        state.sides.push(row);
        return row;
      }),
    },
    v1GameLineup: {
      create: track('v1GameLineup.create', async () => ({ id: next('lineup') })),
    },
    v1GameParticipant: {
      create: track(
        'v1GameParticipant.create',
        async (args: { data: { sideId: string; userId?: string | null; displayNameSnapshot: string } }) => {
          const row = {
            id: next('participant'),
            sideId: args.data.sideId,
            userId: args.data.userId ?? null,
            displayNameSnapshot: args.data.displayNameSnapshot,
          };
          state.participants.push(row);
          return row;
        },
      ),
    },
    v1GamePeriod: { createMany: track('v1GamePeriod.createMany', async () => ({ count: 2 })) },
    v1GameVisibilityPolicy: { create: track('v1GameVisibilityPolicy.create', async () => ({})) },
    v1ParticipantIdentityLinkCurrent: {
      findUnique: track('v1ParticipantIdentityLinkCurrent.findUnique', async (args: { where: { participantId: string } }) =>
        state.links.find((row) => row.participantId === args.where.participantId) ?? null),
      create: track('v1ParticipantIdentityLinkCurrent.create', async (args: { data: { participantId: string; userId: string } }) => {
        state.links.push({ participantId: args.data.participantId, userId: args.data.userId });
        return args.data;
      }),
    },
    v1ParticipantIdentityLinkEvent: {
      findFirst: track('v1ParticipantIdentityLinkEvent.findFirst', async () => null),
      create: track('v1ParticipantIdentityLinkEvent.create', async (args: { data: { participantId: string; action: string; userId: string } }) => {
        const row = { ...args.data, effectiveAt: new Date() };
        state.linkEvents.push(row);
        return row;
      }),
    },
    $queryRaw: track('$queryRaw', async () => [{ id: 'league-1' }]),
    $executeRaw: track('$executeRaw', async () => 1),
    $transaction: async <T>(fn: (client: unknown) => Promise<T>) => fn(tx),
  };

  const prisma = tx as unknown as PrismaService;
  const games = new GamesService(
    prisma,
    { create: async () => undefined } as unknown as OperationAuditWriterService,
    {} as GameTakeoverService,
  );
  return { state, prisma, games, tx };
}

async function createModule(prisma: PrismaService, games: GamesService) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LeagueMatchAdminService,
      { provide: PrismaService, useValue: prisma },
      { provide: GamesService, useValue: games },
      {
        provide: AdminContextService,
        useValue: {
          getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-1', userId: adminUser.id, adminRole: 'ops' }),
          logAdminAction: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: NotificationsService, useValue: { emitToManyDeferred: jest.fn() } },
    ],
  }).compile();
  return module.get(LeagueMatchAdminService);
}

describe('LeagueMatchAdminService.generateFixtures — 자동 로스터와 신원 연결', () => {
  let state: FakeState;
  let service: LeagueMatchAdminService;

  beforeEach(async () => {
    const fake = createFake();
    state = fake.state;
    service = await createModule(fake.prisma, fake.games);
  });

  it('자동 로스터만 있는 대진에서는 신원 연결이 0건이다', async () => {
    await service.generateFixtures(adminUser, 'league-1', { weeksCount: 1 });

    // 참가자 행 자체는 그대로 만들어진다 — 없애는 게 아니라 "사람을 못박지 않는" 것이다.
    expect(state.participants).toHaveLength(4);
    expect(state.participants.every((participant) => participant.userId === null)).toBe(true);

    // 이것이 이 스펙의 본론. 하나라도 생기면 뛰지 않은 팀원이 선수 카드·상호평가에서
    // "기록이 연결된 사람"으로 취급된다.
    expect(state.links).toHaveLength(0);
    expect(state.linkEvents).toHaveLength(0);
    expect(state.calls.filter((call) => call.startsWith('v1ParticipantIdentityLink'))).toEqual([]);
  });

  it('참가자는 자기 팀 사이드에, 자기 멤버십 이름으로 붙는다', async () => {
    await service.generateFixtures(adminUser, 'league-1', { weeksCount: 1 });

    const homeSideId = state.sides.find((side) => side.sideKey === V1GameSideKey.HOME)!.id;
    const awaySideId = state.sides.find((side) => side.sideKey === V1GameSideKey.AWAY)!.id;
    const namesOn = (sideId: string) =>
      state.participants.filter((row) => row.sideId === sideId).map((row) => row.displayNameSnapshot);

    // 홈/원정이 뒤바뀌면 나중에 입력된 기록이 상대 팀 선수에게 붙는다.
    expect(namesOn(homeSideId)).toEqual(['membership-a1 님', 'membership-a2 님']);
    expect(namesOn(awaySideId)).toEqual(['membership-b1 님', 'membership-b2 님']);
  });

  it('참가자당 statement 는 create 1건뿐이다 — 대형 리그 트랜잭션 타임아웃 방지', async () => {
    await service.generateFixtures(adminUser, 'league-1', { weeksCount: 1 });

    // 대진 생성은 리그 행을 FOR UPDATE 로 잠근 단일 인터랙티브 트랜잭션(timeout 120s)
    // 안에서 돈다. 참가자당 statement 가 1건을 넘으면 팀·라운드 수에 곱해져 P2028 로
    // 대진 생성 전체가 실패한다(12팀 × 30명 × 104라운드 = 참가자 37,440).
    const perParticipant = state.calls.filter(
      (call) => call === 'v1GameParticipant.create' || call.startsWith('v1ParticipantIdentityLink'),
    );
    expect(perParticipant).toHaveLength(state.participants.length);
  });
});

describe('GamesService.createFromSourceInTransaction — 대회 경로 회귀 방지', () => {
  it('userId 가 실린 참가자에는 예전처럼 ROSTER_ASSERTED 연결이 생긴다', async () => {
    const { state, games, tx } = createFake();

    await games.createFromSourceInTransaction(
      tx as never,
      {
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        sourceId: 'fixture-1',
        competitionConfigVersionId: 'config-1',
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: 'team-a', displayNameSnapshot: 'A팀' },
          { sideKey: V1GameSideKey.AWAY, teamId: 'team-b', displayNameSnapshot: 'B팀' },
        ],
        participants: [
          { sourceParticipantId: 'reg-a1', userId: 'user-a1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: '가나다' },
          { sourceParticipantId: 'reg-b1', userId: 'user-b1', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '라마바' },
        ],
      },
      {
        actor: { actorType: 'USER', actorUserId: 'ops-user', role: 'platform_ops', tournamentId: 't-1', fixtureId: 'fixture-1' },
        expectedVersion: 0,
        durableCommandId: 'tournament-fixture-create:fixture-1',
        payloadHash: canonicalGameCommandPayloadHash({ fixtureId: 'fixture-1' }),
      },
    );

    expect(state.participants).toHaveLength(2);
    expect(state.links.map((link) => link.userId).sort()).toEqual(['user-a1', 'user-b1']);
    // 연결은 **그 참가자 행**에 걸려야 한다 — 이름으로 되짚으면 동명이인에서 어긋난다.
    for (const link of state.links) {
      expect(state.participants.find((row) => row.id === link.participantId)?.userId).toBe(link.userId);
    }
    expect(state.linkEvents.every((event) => event.action === 'ROSTER_ASSERTED')).toBe(true);
  });
});
