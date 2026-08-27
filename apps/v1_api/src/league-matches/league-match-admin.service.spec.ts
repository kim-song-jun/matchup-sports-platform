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
  /** "매치가 곧 팀일정" 배선(createTeamMatchScheduleInTx) 검증용 — 대진마다 홈/원정 각각. */
  scheduleCreates: Array<{ teamId: string; teamMatchId: string }>;
  /** 이 트랜잭션에서 실제로 실행된 statement 이름(`모델.메서드`) 순서대로. */
  calls: string[];
}

function createFake() {
  const state: FakeState = { participants: [], sides: [], links: [], linkEvents: [], scheduleCreates: [], calls: [] };
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
    // 리그 대진 생성이 "매치가 곧 팀일정" 불변식을 지키도록 양 팀 스케줄을
    // createTeamMatchScheduleInTx 로 함께 만든다(league-match-admin.service.ts).
    // 그 헬퍼가 tx.v1TeamSchedule 을 쓰므로 fake tx 에도 있어야 한다.
    v1TeamSchedule: {
      create: track('v1TeamSchedule.create', async (args: { data: { teamId: string; teamMatchId: string } }) => {
        state.scheduleCreates.push({ teamId: args.data.teamId, teamMatchId: args.data.teamMatchId });
        return { id: next('team-schedule') };
      }),
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

  it('대진마다 홈/원정 팀 모두에 팀 일정이 생긴다 — "매치가 곧 팀일정" 불변식', async () => {
    // 그룹 B 감사 결함 5: raw create 경로(createFixturesInTx)는 일반 팀매치 생성/신청승인이
    // 부르는 createTeamMatchScheduleInTx를 우회해서, 리그 대진이 참가 팀 캘린더에 한 건도
    // 뜨지 않았다. weeksCount:1 · 2팀이면 라운드로빈 대진은 1건이므로 홈·원정 각 1건씩,
    // 정확히 2건의 팀일정이 생겨야 한다.
    await service.generateFixtures(adminUser, 'league-1', { weeksCount: 1 });

    expect(state.scheduleCreates).toHaveLength(2);
    expect(state.scheduleCreates.map((row) => row.teamId).sort()).toEqual(['team-a', 'team-b']);
    // 두 스케줄이 같은 대진(teamMatchId)을 가리켜야 한다 — 따로 생성되면 팀 캘린더가
    // 서로 다른 경기 id를 가리켜 "매치가 곧 팀일정" 1:1 관계가 깨진다.
    const teamMatchIds = new Set(state.scheduleCreates.map((row) => row.teamMatchId));
    expect(teamMatchIds.size).toBe(1);
  });
});

// ── addTeam: 형제 티어 중복 게이트 ──────────────────────────────────────────
// 그룹 B 감사 결함 1(두 번째 발견): checkLeagueTeamAddAllowed()는 "이 리그 안에서만"
// 중복을 본다. 시리즈 소속 리그(같은 seriesId·seasonNo)에서는 같은 팀이 형제 티어에
// 이미 있어도 그 게이트를 통과했다 — addTeam 안에 인라인으로 추가된 형제 티어 조회가
// 그 구멍을 막는다(league-match-admin.service.ts:423-441). 이 조회는 어디에서도
// 테스트된 적이 없었다(addTeam/removeTeam 전체가 이 스펙 추가 전엔 spec 커버리지 0건).
describe('LeagueMatchAdminService.addTeam — 형제 티어 중복 게이트', () => {
  const LEAGUE_ID = 'league-1';
  const SERIES_ID = 'series-1';
  const NEW_TEAM_ID = 'team-new';

  function makePrisma(siblingLeague: { tier: number | null } | null) {
    const prisma: any = {
      v1League: {
        findUnique: jest.fn().mockResolvedValue({
          id: LEAGUE_ID,
          seriesId: SERIES_ID,
          seasonNo: 1,
          sportId: 'sport-futsal',
          teams: [{ teamId: 'team-a' }],
        }),
        findFirst: jest.fn().mockResolvedValue(siblingLeague),
      },
      v1Team: {
        findFirst: jest.fn().mockResolvedValue({ id: NEW_TEAM_ID, sportId: 'sport-futsal' }),
      },
      v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
      v1LeagueTeam: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
    return prisma;
  }

  function makeAdminContext() {
    return {
      getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-row-1', userId: adminUser.id, adminRole: 'ops' }),
      getActiveAdmin: jest.fn(),
      logAdminAction: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('같은 시즌 형제 티어에 이미 있는 팀을 추가하면 422 LEAGUE_TEAM_INVALID로 거부한다', async () => {
    const prisma = makePrisma({ tier: 2 });
    const adminContext = makeAdminContext();
    const notifications = { emitToManyDeferred: jest.fn() };
    const service = new LeagueMatchAdminService(prisma, adminContext as any, {} as any, notifications as any);

    await expect(
      service.addTeam(adminUser, LEAGUE_ID, { teamId: NEW_TEAM_ID } as never),
    ).rejects.toMatchObject({
      response: { code: 'LEAGUE_TEAM_INVALID', message: expect.stringContaining('2부') },
    });

    // 거부됐으면 로스터에 아무것도 안 쓴다 — 검증 게이트를 통과한 뒤에야 create를 부른다.
    expect(prisma.v1LeagueTeam.create).not.toHaveBeenCalled();
    expect(prisma.v1League.findFirst).toHaveBeenCalledWith({
      where: { seriesId: SERIES_ID, seasonNo: 1, id: { not: LEAGUE_ID }, teams: { some: { teamId: NEW_TEAM_ID } } },
      select: { tier: true },
    });
  });

  it('형제 티어에 없으면 통과해서 로스터에 팀이 추가된다', async () => {
    const prisma = makePrisma(null);
    const adminContext = makeAdminContext();
    const notifications = { emitToManyDeferred: jest.fn() };
    const service = new LeagueMatchAdminService(prisma, adminContext as any, {} as any, notifications as any);

    const result = await service.addTeam(adminUser, LEAGUE_ID, { teamId: NEW_TEAM_ID } as never);

    expect(result).toMatchObject({ leagueId: LEAGUE_ID, teamId: NEW_TEAM_ID });
    expect(prisma.v1LeagueTeam.create).toHaveBeenCalledWith({ data: { leagueId: LEAGUE_ID, teamId: NEW_TEAM_ID } });
  });
});

// ── removeTeam: 대진 취소 알림 + 제외 확인 ──────────────────────────────────
// 그룹 B 감사 결함 4: 팀 제외로 대진이 취소돼도 상대 팀·제외된 팀 본인 그 누구에게도
// 알림이 없었다(notifyFixturesCancelled 자체가 이번에 처음 생겼다). 이 스펙 추가
// 전에는 removeTeam을 부르는 테스트가 이 파일을 포함해 어디에도 없었다.
describe('LeagueMatchAdminService.removeTeam — 대진 취소 알림과 제외 확인', () => {
  const LEAGUE_ID = 'league-1';
  const REMOVED_TEAM = 'team-a';
  const OPPONENT_TEAM = 'team-b';
  const OTHER_HOST_TEAM = 'team-c';
  const CANCEL_REASON = '리그 참가팀에서 제외돼 자동으로 취소했어요.';

  function makePrisma() {
    const fixtures = [
      {
        id: 'fixture-1',
        status: 'matched',
        title: '1주차 A vs B',
        hostTeamId: REMOVED_TEAM,
        approvedApplicantTeamId: OPPONENT_TEAM,
        game: { currentOfficialRevisionId: null },
      },
      {
        id: 'fixture-2',
        status: 'matched',
        title: '2주차 C vs A',
        hostTeamId: OTHER_HOST_TEAM,
        approvedApplicantTeamId: REMOVED_TEAM,
        game: { currentOfficialRevisionId: null },
      },
    ];
    const prisma: any = {
      v1League: {
        // state를 'active'가 아닌 값으로 둔다 — LeagueCompletionProjectionService.settle()이
        // 첫 조회에서 조기 반환해, 이 테스트의 관심사(취소·알림)와 무관한 추가 목을 안 늘려도 된다.
        findUnique: jest.fn().mockResolvedValue({
          id: LEAGUE_ID,
          state: 'scheduled',
          teams: [{ teamId: REMOVED_TEAM }, { teamId: OPPONENT_TEAM }, { teamId: OTHER_HOST_TEAM }],
        }),
      },
      // removeTeam은 트랜잭션 밖에서 한 번(초기 게이트 판정), 락을 잡은 트랜잭션 안에서
      // 다시 한 번(TOCTOU 재검증, :517) 같은 조건으로 대진을 읽는다 — 둘 다 이 목록을 본다.
      v1TeamMatch: {
        findMany: jest.fn().mockResolvedValue(fixtures),
        update: jest.fn().mockResolvedValue({}),
      },
      v1LeagueTeam: {
        count: jest.fn().mockImplementation(async ({ where }: any) => {
          // remainingAfterRemoval: where.teamId = { not: teamId } → 제거 후 남는 팀 수(2).
          if (where.teamId && typeof where.teamId === 'object') return 2;
          // stillPresent: where.teamId = teamId(원시값) → 아직 로스터에 있음(1).
          return 1;
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      v1TeamMatchApplication: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1TeamSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      v1TeamMembership: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) => [{ userId: `owner-of-${where.teamId}` }]),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: LEAGUE_ID }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
    return prisma;
  }

  function makeAdminContext() {
    return {
      getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-row-1', userId: adminUser.id, adminRole: 'ops' }),
      getActiveAdmin: jest.fn(),
      logAdminAction: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('제외된 팀의 예정 대진을 취소하고, 취소된 대진에 걸린 모든 팀(제외된 팀 본인 포함)에게 알린다', async () => {
    const prisma = makePrisma();
    const adminContext = makeAdminContext();
    const notifications = { emitToManyDeferred: jest.fn() };
    const service = new LeagueMatchAdminService(prisma, adminContext as any, {} as any, notifications as any);

    const result = await service.removeTeam(adminUser, LEAGUE_ID, REMOVED_TEAM);

    // 제외 확인 — 어드민 화면이 그대로 보여줄 결과값.
    expect(result).toMatchObject({
      leagueId: LEAGUE_ID,
      teamId: REMOVED_TEAM,
      cancelledFixtureCount: 2,
      leagueCompleted: false,
    });
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledTimes(2);

    // 대진 취소 알림 — fixture-1(A·B) + fixture-2(C·A)에 걸린 고유 팀은 A·B·C 3개.
    // "제외된 팀 본인"도 포함된다는 게 이 알림 함수의 핵심 계약(코드 주석 :583-586).
    expect(notifications.emitToManyDeferred).toHaveBeenCalledTimes(3);
    for (const call of notifications.emitToManyDeferred.mock.calls) {
      expect(call[1]).toBe('league_fixture_cancelled');
      expect(call[2]).toBe(LEAGUE_ID);
      expect(call[3]).toBe(`리그 대진 2경기가 취소됐어요. 사유: ${CANCEL_REASON}`);
    }
    // 알림 대상 결정 클로저를 실제로 실행해 어느 팀이 조회됐는지까지 못박는다 —
    // 호출 횟수만 3이고 실제로는 같은 팀을 3번 쐈다면 위 개수 단언만으론 못 잡는다.
    const resolvedUserIds = (
      await Promise.all(notifications.emitToManyDeferred.mock.calls.map((call: any) => call[0]()))
    ).flat();
    expect(resolvedUserIds.sort()).toEqual(
      ['owner-of-team-a', 'owner-of-team-b', 'owner-of-team-c'].sort(),
    );
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
