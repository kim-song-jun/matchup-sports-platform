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
import { leagueFixtureTitle } from './league-fixture-creation';
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
  /** dual-write 가 통합 축 거울에 보낸 `updateMany` 인자 — where·data 를 그대로 본다. */
  mirrorUpdates: Array<{ where: { id: string; kind: string }; data: { status: string } }>;
  /** 수동 대진의 주차 파생이 읽는 형제 대진 시작 시각. 테스트가 갈아끼운다. */
  siblingStartAts: Date[];
  /** `v1TeamMatch.create` 에 실린 data — 제목·시각·장소를 그대로 본다. */
  teamMatchCreates: Array<{ title: string; startAt: Date; endAt?: Date; placeName: string }>;
  /** 자동 승인 신청서에 실린 data — 어드민 화면에 그대로 노출되는 문구를 본다. */
  applicationCreates: Array<{ message: string; status: string }>;
}

/** 리그에 등록된 두 팀 — 기존 스펙이 멤버십 이름으로 사이드 배정을 단언하므로 고정한다. */
const KNOWN_TEAMS = new Map([
  ['team-a', teamRow('team-a', 'A팀', ['membership-a1', 'membership-a2'])],
  ['team-b', teamRow('team-b', 'B팀', ['membership-b1', 'membership-b2'])],
]);

function createFake() {
  const state: FakeState = {
    participants: [], sides: [], links: [], linkEvents: [], scheduleCreates: [], calls: [], mirrorUpdates: [],
    // 기본: 서로 다른 두 경기일이 이미 있다(KST 9/5, 9/12).
    siblingStartAts: [new Date('2026-09-05T01:00:00.000Z'), new Date('2026-09-12T01:00:00.000Z')],
    teamMatchCreates: [],
    applicationCreates: [],
  };
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
    // dual-write 대상 — 리그 state 를 바꾸는 자리는 통합 축의 거울도 같이 고친다.
    // `updateMany` 는 백필 전에는 0행이 정상이라(거울이 아직 없다) count 0 을 준다.
    // **인자를 잡아 둔다** — 호출 여부만 보면 `where` 에서 `kind` 가드가 빠져도 통과한다.
    v1Tournament: {
      updateMany: track('v1Tournament.updateMany', async (args: FakeState['mirrorUpdates'][number]) => {
        state.mirrorUpdates.push(args);
        return { count: 0 };
      }),
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
      // ⚠️ `where.id.in` 을 **실제로 지킨다.** 요청한 id 를 그대로 돌려주지 않고 고정 두 팀만
      // 주면, "리그에 등록되지 않은 팀" 과 "비활성/삭제된 팀" 이 구분되지 않는다 — 둘 다
      // 같은 코드(LEAGUE_TEAM_INVALID)로 거부되므로 앞 가드를 지워도 뒤 가드가 같은 응답을
      // 내서 테스트가 통과한다(실측: 등록 검증을 지우는 변이가 green 이었다).
      findMany: track('v1Team.findMany', async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => KNOWN_TEAMS.get(id) ?? teamRow(id, `${id} 팀`, [`${id}-m1`, `${id}-m2`])),
      ),
    },
    v1TeamMatch: {
      count: track('v1TeamMatch.count', async () => 0),
      create: track('v1TeamMatch.create', async (args: { data: { title: string; startAt: Date; endAt?: Date; placeName: string } }) => {
        state.teamMatchCreates.push(args.data);
        return { id: 'team-match-1' };
      }),
      // 수동 대진의 기본 제목이 주차를 파생할 때 읽는 형제 목록.
      // 기본값은 "이미 두 경기일이 있는 리그" — 새로 넣는 경기가 3번째 날이면 3주차다.
      findMany: track('v1TeamMatch.findMany', async () => state.siblingStartAts.map((startAt) => ({ startAt }))),
    },
    v1TeamMatchApplication: {
      create: track('v1TeamMatchApplication.create', async (args: { data: { message: string; status: string } }) => {
        state.applicationCreates.push(args.data);
        return { id: 'application-1' };
      }),
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

  it('리그를 active 로 옮길 때 통합 축 거울의 status 도 같이 옮긴다 (dual-write)', async () => {
    await service.generateFixtures(adminUser, 'league-1', { weeksCount: 1 });

    // 호출 여부만 보지 않는다 — `where` 에서 `kind` 가드가 빠지면 같은 id 의 **진짜 대회**를
    // 덮어쓸 수 있는데, 호출됐다는 것만으로는 그게 안 보인다.
    expect(state.mirrorUpdates).toEqual([
      { where: { id: 'league-1', kind: 'regular_league' }, data: { status: 'in_progress' } },
    ]);
  });

  /**
   * Task 164 BE-1 — 한 경기 생성을 `createLeagueFixture` 로 추출했다(자동·수동이 같은 함수).
   * **추출 전후 동일성을 다섯 부수효과 각각으로 못 박는다.**
   *
   * "생성된 행 수가 같다" 로 뭉뚱그리면 아무것도 못 잡는다 — 하나가 빠지고 다른 하나가
   * 두 번 생기면 총계는 같다. 그리고 이 다섯은 각각 **다른 화면·알림**을 켠다:
   *   ① 팀매치         경기 자체
   *   ② 팀 일정 2건    팀 캘린더 · 용병 모집(일정의 자식) · D-1 리마인더
   *   ③ 게임/사이드/로스터  결과 입력 · 기록
   *   ④ 승인된 신청서   재생성본과 최초 생성본의 계약 동일성
   *   ⑤ 결과입력 리마인더  시작 +24h 미입력 시 운영자 알림
   * 실제로 ②가 빠진 채로 배포돼 리그 경기가 팀 캘린더에 한 건도 안 뜬 적이 있다.
   */
  it('한 대진 생성이 다섯 부수효과를 모두 만든다 (추출 전후 동일성)', async () => {
    await service.generateFixtures(adminUser, 'league-1', { weeksCount: 1 });

    // ① 팀매치 — 2팀·1주차면 정확히 한 경기.
    expect(state.calls.filter((call) => call === 'v1TeamMatch.create')).toHaveLength(1);

    // ② 양 팀 팀 일정. 팀별로 정확히 하나씩이고 같은 대진을 가리킨다.
    expect(state.scheduleCreates.map((row) => row.teamId).sort()).toEqual(['team-a', 'team-b']);
    expect(new Set(state.scheduleCreates.map((row) => row.teamMatchId)).size).toBe(1);

    // ③ 게임 사이드 2개 + 자동 로스터(양 팀 멤버 2명씩 = 4). 로스터에는 사람을 붙이지
    //    않는다 — 붙이면 안 뛴 팀원 전원에게 신원 연결이 생긴다(그 근거는 함수 주석에).
    expect(state.sides.map((side) => side.sideKey).sort()).toEqual([V1GameSideKey.AWAY, V1GameSideKey.HOME]);
    expect(state.participants).toHaveLength(4);
    expect(state.participants.every((row) => row.userId === null)).toBe(true);

    // ④ 승인된 신청서 1건.
    expect(state.calls.filter((call) => call === 'v1TeamMatchApplication.create')).toHaveLength(1);

    // ⑤ 결과입력 리마인더 — outbox 에 $executeRaw 로 넣는다.
    expect(state.calls.filter((call) => call === '$executeRaw')).toHaveLength(1);
  });

  describe('수동 대진 추가 (Task 164 BE-1)', () => {
    const manual = {
      homeTeamId: 'team-a',
      awayTeamId: 'team-b',
      startsAt: '2026-09-19T01:00:00.000Z',
    } as const;

    /**
     * **핵심 계약**: 수동 추가가 자동 생성과 **같은 부수효과**를 낸다. 두 경로가 각자
     * 팀매치를 만들면 한쪽에만 빠지는데, 그게 실제로 일어났던 사고다(리그 대진이 팀
     * 일정을 안 만들어 참가 팀 캘린더에 한 건도 안 떴다).
     */
    it('자동 생성과 같은 다섯 부수효과를 낸다', async () => {
      await service.createManualFixture(adminUser, 'league-1', { ...manual });

      expect(state.calls.filter((call) => call === 'v1TeamMatch.create')).toHaveLength(1);
      expect(state.scheduleCreates.map((row) => row.teamId).sort()).toEqual(['team-a', 'team-b']);
      expect(new Set(state.scheduleCreates.map((row) => row.teamMatchId)).size).toBe(1);
      expect(state.sides.map((side) => side.sideKey).sort()).toEqual([V1GameSideKey.AWAY, V1GameSideKey.HOME]);
      expect(state.participants).toHaveLength(4);
      expect(state.participants.every((row) => row.userId === null)).toBe(true);
      expect(state.calls.filter((call) => call === 'v1TeamMatchApplication.create')).toHaveLength(1);
      expect(state.calls.filter((call) => call === '$executeRaw')).toHaveLength(1);
    });

    /**
     * 신청서 문구는 **어드민 화면에 그대로 노출된다**(팀매치 상세의 applications.message).
     * 자동·수동이 같은 함수를 쓰므로 경로를 단정하면 수동으로 넣은 경기가 "자동 생성" 이라고
     * 표시된다 — 운영자가 자기가 손으로 넣은 경기를 시스템이 만든 것으로 읽는다.
     */
    it('자동 승인 신청서 문구가 경로를 단정하지 않는다', async () => {
      await service.createManualFixture(adminUser, 'league-1', { ...manual });

      expect(state.applicationCreates).toHaveLength(1);
      expect(state.applicationCreates[0].status).toBe('approved');
      expect(state.applicationCreates[0].message).not.toContain('자동');
    });

    /**
     * 제목 기본값은 **화면과 같은 규칙**으로 주차를 파생한다(`league-week-number.ts`).
     * 저장된 제목을 흉내 내면 안 되는 이유가 그 모듈에 있다 — 재일정은 `startAt` 만 바꾸고
     * `title` 은 두므로 저장된 주차가 낡는다. 여기서 다른 규칙을 쓰면 새로 넣은 경기만
     * 화면과 다른 주차로 불린다.
     */
    it('제목 미지정: 그 리그의 경기일을 세어 주차를 파생한다 (새 날짜 = 3번째 날 → 3주차)', async () => {
      // 형제 경기일 두 개(9/5, 9/12) + 새 경기 9/19 → 3번째 날.
      await service.createManualFixture(adminUser, 'league-1', { ...manual });

      expect(state.teamMatchCreates[0].title).toBe('테스트 리그 3주차');
    });

    it('제목 미지정: 이미 경기가 있는 날에 넣으면 그 날의 주차를 쓴다 (9/5 → 1주차)', async () => {
      await service.createManualFixture(adminUser, 'league-1', {
        ...manual,
        startsAt: '2026-09-05T08:00:00.000Z',
      });

      // 같은 KST 날짜에 이미 경기가 있으므로 새 날이 아니다 — 4주차가 되면 안 된다.
      expect(state.teamMatchCreates[0].title).toBe('테스트 리그 1주차');
    });

    it('제목을 주면 그대로 쓴다 (공백만 준 것은 미지정으로 본다)', async () => {
      await service.createManualFixture(adminUser, 'league-1', { ...manual, title: '  결승 재경기  ' });
      expect(state.teamMatchCreates[0].title).toBe('결승 재경기');

      state.teamMatchCreates.length = 0;
      await service.createManualFixture(adminUser, 'league-1', { ...manual, title: '   ' });
      expect(state.teamMatchCreates[0].title).toBe('테스트 리그 3주차');
    });

    it('durationMinutes 를 주면 종료 시각이 붙고, 안 주면 비운다', async () => {
      await service.createManualFixture(adminUser, 'league-1', { ...manual, durationMinutes: 90 });
      expect(state.teamMatchCreates[0].endAt).toEqual(new Date('2026-09-19T02:30:00.000Z'));

      state.teamMatchCreates.length = 0;
      await service.createManualFixture(adminUser, 'league-1', { ...manual });
      // 종료 시각을 직접 받지 않으므로 "시작보다 이른 종료" 를 만들 입력 자체가 없다.
      expect(state.teamMatchCreates[0].endAt).toBeUndefined();
    });

    it('durationMinutes 가 null 이어도 미지정으로 본다 — 0분 경기를 만들지 않는다', async () => {
      // `@IsOptional()` 은 null 을 통과시키고 `@Type(() => Number)` 도 null 을 숫자로
      // 바꾸지 않는다(실측). `=== undefined` 만 보면 `null * 60_000 === 0` 이라
      // **종료 = 시작**인 경기가 저장된다 — DTO 가 약속한 "이른 종료를 만들 입력을 두지
      // 않는다" 가 그 자리에서 깨진다.
      await service.createManualFixture(adminUser, 'league-1', {
        ...manual,
        durationMinutes: null as unknown as undefined,
      });

      expect(state.teamMatchCreates[0].endAt).toBeUndefined();
    });

    it('장소 미지정·공백은 "장소 미정" 으로 — 일괄 생성과 같은 규칙', async () => {
      await service.createManualFixture(adminUser, 'league-1', { ...manual, placeName: '  ' });
      expect(state.teamMatchCreates[0].placeName).toBe('장소 미정');
    });

    it('이 리그에 등록되지 않은 팀은 422 로 거부하고 아무것도 만들지 않는다', async () => {
      await expect(
        service.createManualFixture(adminUser, 'league-1', { ...manual, awayTeamId: 'team-zzz' }),
      ).rejects.toMatchObject({ response: { code: 'LEAGUE_TEAM_INVALID' } });

      // 검증 게이트를 통과한 뒤에야 쓰기가 시작돼야 한다 — 반쪽 생성이 남으면 안 된다.
      expect(state.calls.filter((call) => call === 'v1TeamMatch.create')).toHaveLength(0);
      expect(state.scheduleCreates).toHaveLength(0);
    });

    it('같은 팀끼리는 422 로 거부한다', async () => {
      await expect(
        service.createManualFixture(adminUser, 'league-1', { ...manual, awayTeamId: 'team-a' }),
      ).rejects.toMatchObject({ response: { code: 'LEAGUE_TEAM_INVALID' } });
      expect(state.calls.filter((call) => call === 'v1TeamMatch.create')).toHaveLength(0);
    });
  });

  it('제목 규칙은 자동·수동이 같은 함수를 쓴다 — 슬롯이 있으면 경기 순번까지 붙는다', () => {
    // 문자열 템플릿을 두 곳에 복사하면 한쪽만 바뀌어 같은 리그 안에서 제목이 갈린다.
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', round: 3 })).toBe('가을 리그 3주차');
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', round: 3, matchday: 2, orderInDay: 4 })).toBe(
      '가을 리그 2주차 4경기',
    );
    // 슬롯 정보가 반쪽만 있으면 순번을 붙이지 않는다 — "N주차 undefined경기" 를 만들지 않는다.
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', round: 3, matchday: 2 })).toBe('가을 리그 3주차');
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', round: 3, orderInDay: 4 })).toBe('가을 리그 3주차');
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
