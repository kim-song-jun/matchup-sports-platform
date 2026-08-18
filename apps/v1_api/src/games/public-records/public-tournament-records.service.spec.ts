import type { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 이 스펙 전까지 `public-tournament-records.service.ts` 에는 전용 스펙이 없었다
 * (task9 계열 스펙은 result-projection 워커를 다룰 뿐 이 서비스를 건드리지 않는다).
 * `games.task8-snapshot.spec.ts` 가 쓰는 손수 구현한 fake-Prisma 패턴을 그대로
 * 재사용한다 -- 실제 DB 커넥션 없이 `PrismaService` 의 부분 집합만 흉내 낸다.
 */

type FakeParticipant = {
  id: string;
  sideId: string;
  lineupId: string;
  userId: string | null;
  displayNameSnapshot: string;
  jerseyNumber: number | null;
  position: string | null;
};

/** `loadParticipantNameProfiles`가 조회하는 V1UserProfile 투영 -- 스펙 전용 fake 타입. */
type FakeNameProfile = {
  userId: string;
  realName: string | null;
  displayName: string | null;
  nickname: string;
  tournamentRealNameVisible: boolean;
  /**
   * 프로덕션 select 가 항상 돌려주는 필드라 픽스처도 필수로 둔다 -- 생략을 허용하면
   * `undefined !== null` 이 참이 되어 미탈퇴 프로필이 탈퇴로 오판된다.
   */
  deletedAt: Date | null;
};

type FakeGoalEvent = {
  id: string;
  gameId: string;
  type: 'GOAL';
  sideId: string;
  participantId: string | null;
  period: number;
  clockMs: number;
  reversesEventId: string | null;
};

type FakeConsentLink = { participantId: string; linkId: string; userId: string };
type FakeConsentSnapshot = { linkId: string; state: 'GRANTED' | 'REVOKED'; effectiveAt: Date };

// UUID-shaped (issue #377's new staff-bypass tests route these through the
// REAL `decideTournamentStaffAccess`, which strictly validates `tournamentId`/
// `fixtureId`/`fieldId` as stable (UUID) ids and denies INVALID_INPUT
// otherwise -- a plain 'tournament-1' string would fail that validation and
// make every allow-case look like a deny-case for the wrong reason).
const TOURNAMENT_ID = 'a1000000-0000-4000-8000-000000000001';
const FIXTURE_ID = 'a1000000-0000-4000-8000-000000000002';
const GAME_ID = 'game-1';

// userId: null(미연동) -- 이 파일 대부분의 기존 테스트는 "이름이 보이는가"(동의 게이팅)만
// 다루므로 스냅샷 폴백 그대로 둔다. 실명/닉네임 토글 자체는 아래 전용 describe에서 검증한다.
const ELIGIBLE_PARTICIPANT: FakeParticipant = {
  id: 'participant-eligible',
  sideId: 'side-home',
  lineupId: 'lineup-home-1',
  userId: null,
  displayNameSnapshot: '김철수',
  jerseyNumber: 7,
  position: 'FW',
};

const INELIGIBLE_PARTICIPANT: FakeParticipant = {
  id: 'participant-ineligible',
  sideId: 'side-away',
  lineupId: 'lineup-away-1',
  userId: null,
  displayNameSnapshot: '이영희',
  jerseyNumber: 10,
  position: 'MF',
};

function buildFakePrisma(options: {
  scheduledAt: Date;
  consentLinks: FakeConsentLink[];
  consentSnapshots: FakeConsentSnapshot[];
  events: FakeGoalEvent[];
  /** Issue #377 -- this fixture's assigned field, for the staff-bypass scope tests below. */
  fieldId?: string | null;
  /**
   * 참가팀 공개 정책 통일(fix/v1-publish) — 대부분의 기존 테스트는 팀명 숨김과
   * 무관하므로 기본값 'closed'(모집 마감 이후, hideIdentity 항상 false). 팀명
   * 숨김 자체를 검증하는 테스트만 'open'으로 override한다.
   */
  tournamentStatus?: string;
  /**
   * 승부차기 표면화 테스트용 -- 기본값 `null`(확정 결과 없음)이라 기존 테스트는
   * 그대로 라이브 경로를 탄다. `score` 는 실제 컬럼과 같은 느슨한 JSON 이라
   * 평평한 형태/백필 중첩 형태를 그대로 넣어볼 수 있다.
   */
  officialRevision?: {
    state: string;
    supersedesId: string | null;
    officialAt: Date;
    score: unknown;
  } | null;
  /**
   * `resolvePeriodBreak` 배선 검증용(하프타임/정규 시간 종료) -- 기본값 `[]`이라
   * 기존 테스트는 그대로 LIVE 클록 없는 경로를 탄다(회귀 없음).
   */
  periods?: readonly {
    number: number;
    state: string;
    startedAt: Date | null;
    pausedTotalMs: number;
    pausedAt: Date | null;
  }[];
  /**
   * `periodBreak`의 `status === 'live'` 게이트 검증용 -- 기본값 'LIVE'라 기존 테스트는
   * 전부 그대로 진행 중 경로를 탄다. 'ENDED'로 override하면 publicFixtureStatus가
   * 'ended'를 돌려주므로(public-visibility.ts의 GAME_STATE_TO_PUBLIC_STATUS) 종료된
   * 경기에서 라이브 전용 필드가 새는지 확인할 수 있다.
   */
  gameState?: string;
  lineups?: readonly { id: string; sideId: string; revision: number }[];
  participants?: readonly FakeParticipant[];
  /**
   * 2026-08-18 대회 실명 표시 정책 -- `loadParticipantNameProfiles`가 in 조회하는
   * V1UserProfile 행. 기본값 빈 배열 -- userId가 있어도 매칭되는 프로필이 없으면
   * 스냅샷으로 폴백하는 기존 테스트를 그대로 둔다.
   */
  nameProfiles?: FakeNameProfile[];
}): PrismaService {
  const database = {
    v1Tournament: {
      async findUnique() {
        return {
          id: TOURNAMENT_ID,
          title: '테스트 대회',
          status: options.tournamentStatus ?? 'closed',
          bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
          bracketPublishScheduledAt: null,
        };
      },
    },
    v1TournamentFixture: {
      // getMatch 의 본 조회(select 에 game 포함)와 findNextMatch 의 다음 경기
      // 조회(select 에 game 미포함)가 같은 모델을 두 번 다른 select 로 호출한다 --
      // select 형태로 어느 호출인지 구분한다.
      async findFirst(args: { select: Record<string, unknown> }) {
        if (!('game' in args.select)) return null; // 다음 경기 없음 -- 이 스펙의 관심사가 아니다.
        return {
          id: FIXTURE_ID,
          tournamentId: TOURNAMENT_ID,
          round: '결승',
          fixtureNumber: 1,
          legNumber: 1,
          groupId: null,
          scheduledAt: options.scheduledAt,
          venue: null,
          status: 'in_progress',
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          homeRegistration: { team: { id: 'team-home', name: '홈팀' } },
          awayRegistration: { team: { id: 'team-away', name: '원정팀' } },
          group: null,
          fieldId: options.fieldId ?? null,
          field: null,
          videos: [],
          game: {
            id: GAME_ID,
            state: options.gameState ?? 'LIVE',
            visibilityPolicy: { mode: 'LIVE', lineupAt: null },
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            lineups: options.lineups ?? [
              { id: 'lineup-home-1', sideId: 'side-home', revision: 1 },
              { id: 'lineup-away-1', sideId: 'side-away', revision: 1 },
            ],
            participants: options.participants ?? [ELIGIBLE_PARTICIPANT, INELIGIBLE_PARTICIPANT],
            currentOfficialRevision: options.officialRevision ?? null,
            periods: options.periods ?? [],
          },
        };
      },
    },
    v1GameOperationFlag: {
      async findUnique() {
        return { value: 'on' }; // PUBLIC_LIVE 켜짐 -- LIVE 정책이 'live' 모드로 승격된다.
      },
    },
    v1ParticipantIdentityLinkCurrent: {
      async findMany() {
        return options.consentLinks;
      },
    },
    v1ParticipantConsentSnapshot: {
      async findMany() {
        return options.consentSnapshots;
      },
    },
    // 사용자 단위 공개 동의(Task 24 규칙 재정의, 2026-08-13). 이 스펙의 롤백 스위치
    // 테스트는 전부 consentLinks가 빈 배열이라 loadParticipantConsentEligibility가
    // 이 테이블까지 조회하지는 않지만(링크가 없으면 조회 자체를 skip), 방어적으로
    // 빈 배열을 반환하도록 둔다.
    v1UserRecordConsent: {
      async findMany() {
        return [];
      },
    },
    // 2026-08-18 대회 실명 표시 정책 -- 위 consent 조회와 달리 게이팅 없이 매 getMatch
    // 호출마다 조회한다("보이면 어떤 이름인가", 위 v1UserRecordConsent 주석과 동일한
    // 이유로 정책 롤백 여부와 무관하다).
    v1UserProfile: {
      async findMany() {
        return options.nameProfiles ?? [];
      },
    },
    v1GameEvent: {
      // computeLiveScore(select 에 participantId 없음)와 buildEvents(select 에
      // participantId 있음) 가 같은 모델을 다른 select 로 두 번 조회한다.
      async findMany(args: { select: Record<string, unknown> }) {
        return 'participantId' in args.select ? options.events : options.events;
      },
    },
    v1GameResultRevision: {
      async findMany() {
        return [];
      },
    },
  };
  return database as unknown as PrismaService;
}

/**
 * Issue #377 -- a fake `TournamentStaffAccessService` backed by a minimal
 * `v1AdminUser`/`v1TournamentStaffAssignment` fake, so the staff-bypass
 * tests below exercise the REAL `assertAccess` -> `decideTournamentStaffAccess`
 * policy chain (the same one `TournamentFixtureLineupService` already relies
 * on) instead of a hand-rolled mock that could hide a wiring bug. Never
 * platform_ops in these tests -- `v1AdminUser.findUnique` always resolves
 * `null`, so every case goes through the assignment-scoped path.
 */
function buildFakeAccessService(
  assignments: readonly {
    role: 'FIELD_OPERATOR' | 'TOURNAMENT_DIRECTOR' | 'SUPPORT_READONLY';
    fieldId?: string | null;
    fixtureIds?: readonly string[];
  }[],
): TournamentStaffAccessService {
  const fakeAccessPrisma = {
    v1AdminUser: {
      async findUnique() {
        return null;
      },
    },
    v1TournamentStaffAssignment: {
      async findMany() {
        return assignments.map((assignment, index) => ({
          id: `assignment-${index}`,
          tournamentId: TOURNAMENT_ID,
          role: assignment.role,
          fieldId: assignment.fieldId ?? null,
          version: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          revokedAt: null,
          fixtureScopes: (assignment.fixtureIds ?? []).map((fixtureId) => ({ fixtureId })),
        }));
      },
    },
  };
  return new TournamentStaffAccessService(fakeAccessPrisma as unknown as PrismaService);
}

/** No assignments at all -- used by the pre-existing anonymous-path tests below, which never expect a bypass. */
const NO_ASSIGNMENTS_ACCESS = buildFakeAccessService([]);

const STAFF_USER: V1AuthUser = {
  id: 'staff-user-1',
  email: null,
  accountStatus: 'active',
  onboardingStatus: 'signup_done',
};

describe('PublicTournamentRecordsService.getMatch -- event participant identity (골/카드 이름·등번호)', () => {
  it('각 팀에서 가장 마지막으로 저장한 라인업 revision의 참가자만 공개한다', async () => {
    const oldHome = { ...ELIGIBLE_PARTICIPANT, id: 'participant-home-old', lineupId: 'lineup-home-1', displayNameSnapshot: '이전 홈 선수' };
    const latestHome = { ...ELIGIBLE_PARTICIPANT, id: 'participant-home-latest', lineupId: 'lineup-home-2', displayNameSnapshot: '최신 홈 선수' };
    const oldAway = { ...INELIGIBLE_PARTICIPANT, id: 'participant-away-old', lineupId: 'lineup-away-1', displayNameSnapshot: '이전 원정 선수' };
    const latestAway = { ...INELIGIBLE_PARTICIPANT, id: 'participant-away-latest', lineupId: 'lineup-away-3', displayNameSnapshot: '최신 원정 선수' };
    const prisma = buildFakePrisma({
      scheduledAt: new Date(Date.now() - 60_000),
      consentLinks: [], consentSnapshots: [], events: [],
      lineups: [
        { id: 'lineup-home-1', sideId: 'side-home', revision: 1 },
        { id: 'lineup-away-1', sideId: 'side-away', revision: 1 },
        { id: 'lineup-home-2', sideId: 'side-home', revision: 2 },
        { id: 'lineup-away-3', sideId: 'side-away', revision: 3 },
      ],
      participants: [oldHome, latestHome, oldAway, latestAway],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.lineup).toEqual({
      home: [expect.objectContaining({ participantId: latestHome.id, displayName: '최신 홈 선수' })],
      away: [expect.objectContaining({ participantId: latestAway.id, displayName: '최신 원정 선수' })],
    });
  });

  it('동의한 참가자의 골 이벤트에 participantName/jerseyNumber 가 실린다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000), // 킥오프 90분 전 -- 라인업 미공개 구간
      consentLinks: [{ participantId: ELIGIBLE_PARTICIPANT.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      events: [
        {
          id: 'event-goal-1',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-home',
          participantId: ELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 600_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    // 익명 요청(user: undefined) -- 스태프 우회는 로그인 사용자에게만 적용되므로
    // 여기서는 순수 동의(consent) 게이팅만 검증한다.
    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([
      expect.objectContaining({
        participantId: ELIGIBLE_PARTICIPANT.id,
        participantName: '김철수',
        jerseyNumber: 7,
      }),
    ]);
  });

  it('정책 변경(2026-08-13): 동의 없이 미연동/게스트 참가자라도 대회 참가자면 관전자에게 이름이 보인다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [], // 링크 자체가 없음 -- 게스트/미연동. 예전엔 이 이유만으로 항상 masked였다.
      consentSnapshots: [],
      events: [
        {
          id: 'event-goal-2',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-away',
          participantId: INELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 900_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    // 익명 요청 -- 대회 참가자는 동의/연동 여부와 무관하게 이름이 공개된다(정책 변경).
    // 이전 정책의 회귀 테스트는 아래 "롤백 스위치" describe 블록으로 옮겼다.
    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([
      expect.objectContaining({
        participantId: INELIGIBLE_PARTICIPANT.id,
        participantName: '이영희',
        jerseyNumber: 10,
      }),
    ]);
  });

  it('라인업이 null(킥오프 60분 전, 미공개)인 상황에서도 이벤트의 participantName 은 나온다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      // 킥오프 90분 전으로 예약 -- isLineupPublished 는 킥오프 60분 전부터 true 이므로
      // 지금은 false 여야 한다 (derivedLineupAt = scheduledAt - 60m > now).
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [{ participantId: ELIGIBLE_PARTICIPANT.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      events: [
        {
          id: 'event-goal-3',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-home',
          participantId: ELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 600_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    // 핵심 계약: 라인업 게이트(lineupAt)와 이벤트 이름 노출은 서로 독립이다.
    expect(result.lineup).toBeNull();
    expect(result.events).toEqual([
      expect.objectContaining({ participantName: '김철수', jerseyNumber: 7 }),
    ]);
  });
});

/**
 * 대회 참가자 이름 공개 정책의 롤백 스위치 자체를 검증한다. 이 describe 안에서만
 * `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true`를 설정하고 각 테스트가 끝나면
 * 반드시 지운다 -- 이 값이 다른 테스트로 새어나가면 위/아래의 "정책 공개가 기본"이라는
 * 전제를 조용히 뒤집는다.
 */
describe('PublicTournamentRecordsService.getMatch -- 롤백 스위치(V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE)', () => {
  const CONSENT_GATE_ENV_KEY = 'V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE';

  it('플래그를 켜면(true) 이전 Task 24 동의 게이팅으로 즉시 되돌아간다 -- 미연동 참가자는 다시 masked', async () => {
    process.env[CONSENT_GATE_ENV_KEY] = 'true';
    try {
      const now = new Date();
      const prisma = buildFakePrisma({
        scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
        consentLinks: [],
        consentSnapshots: [],
        events: [
          {
            id: 'event-goal-rollback',
            gameId: GAME_ID,
            type: 'GOAL',
            sideId: 'side-away',
            participantId: INELIGIBLE_PARTICIPANT.id,
            period: 1,
            clockMs: 900_000,
            reversesEventId: null,
          },
        ],
      });
      const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

      const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

      expect(result.events).toEqual([
        expect.objectContaining({ participantId: null, participantName: null, jerseyNumber: null }),
      ]);
    } finally {
      delete process.env[CONSENT_GATE_ENV_KEY];
    }
  });
});

/**
 * Issue #377 -- 권한 범위(scope)가 이 이슈의 핵심이다. 아래 다섯 케이스는 모두
 * `INELIGIBLE_PARTICIPANT`(consent 없음, 원래는 항상 masked)에 골을 넣혀
 * "동의가 아예 없어도 이 경기 담당 스태프에게만 실명이 뜨는지" 그리고
 * "대회 단위가 아니라 fixture/field 단위로 정확히 좁혀지는지"를 함께 검증한다.
 * `TournamentStaffAccessService`는 실제 구현을 그대로 쓴다(mock 이 아니다) --
 * `decideTournamentStaffAccess` 정책 자체가 아니라, `getMatch`가 그 정책에
 * *올바른 resource*(대회 전체가 아니라 이 fixture 의 실제 fieldId)를 넘기는지가
 * 이 스펙의 진짜 관심사이기 때문이다.
 *
 * 대회 참가자 이름 공개 정책(2026-08-13)으로 기본 정책이 "전원 공개"가 되면서 이
 * 블록의 전제("스태프 우회가 없으면 masked") 자체는 기본 상태에서 더는 관측되지
 * 않는다(누구나 이름을 본다, 스태프 여부와 무관). 그래서 이 블록 전체를 롤백
 * 스위치로 강제 전환해 예전 동의 게이팅 경로를 켜 둔 채로 돌린다 -- PR #389의 스태프
 * 우회 로직 자체가 손대지 않고 그대로 남아 있는지를 계속 증명하기 위해서다. 기대값은
 * 원래 그대로다.
 */
describe('PublicTournamentRecordsService.getMatch -- issue #377 스태프 실명 우회 권한 스코프', () => {
  const CONSENT_GATE_ENV_KEY = 'V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE';
  beforeEach(() => {
    process.env[CONSENT_GATE_ENV_KEY] = 'true';
  });
  afterEach(() => {
    delete process.env[CONSENT_GATE_ENV_KEY];
  });

  // 마찬가지로 UUID 형태 -- decideTournamentStaffAccess 의 stable-id 검증 대상.
  const FIELD_ID = 'a1000000-0000-4000-8000-000000000003';
  const OTHER_FIELD_ID = 'a1000000-0000-4000-8000-000000000004';
  const OTHER_FIXTURE_ID = 'a1000000-0000-4000-8000-000000000005';

  function buildIneligibleGoalPrisma(fieldId: string | null = FIELD_ID) {
    const now = new Date();
    return buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [], // 동의 없음 -- 우회가 없으면 항상 masked
      consentSnapshots: [],
      fieldId,
      events: [
        {
          id: 'event-goal-scope',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-away',
          participantId: INELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 900_000,
          reversesEventId: null,
        },
      ],
    });
  }

  it('권한 없는 로그인 사용자(대회 스태프 배정이 전혀 없음)는 비공개 선수 -- 403 이 아니라 masked 응답', async () => {
    const prisma = buildIneligibleGoalPrisma();
    const service = new PublicTournamentRecordsService(prisma, buildFakeAccessService([]));

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    expect(result.events).toEqual([
      expect.objectContaining({ participantId: null, participantName: null, jerseyNumber: null }),
    ]);
  });

  it('다른 필드 담당 FIELD_OPERATOR 는 비공개 선수 -- 대회 단위가 아니라 field 단위로 거부된다', async () => {
    const prisma = buildIneligibleGoalPrisma(FIELD_ID);
    const access = buildFakeAccessService([{ role: 'FIELD_OPERATOR', fieldId: OTHER_FIELD_ID }]);
    const service = new PublicTournamentRecordsService(prisma, access);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    expect(result.events).toEqual([
      expect.objectContaining({ participantId: null, participantName: null, jerseyNumber: null }),
    ]);
  });

  it('다른 경기(fixture) 담당 FIELD_OPERATOR 는 비공개 선수 -- fixtureId 스코프도 독립적으로 거부된다', async () => {
    const prisma = buildIneligibleGoalPrisma(null); // 이 fixture 는 필드 미배정 -- fixtureScopes 로만 판단
    const access = buildFakeAccessService([{ role: 'FIELD_OPERATOR', fixtureIds: [OTHER_FIXTURE_ID] }]);
    const service = new PublicTournamentRecordsService(prisma, access);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    expect(result.events).toEqual([
      expect.objectContaining({ participantId: null, participantName: null, jerseyNumber: null }),
    ]);
  });

  it('이 경기가 배정된 필드의 FIELD_OPERATOR 는 동의 없는 참가자도 실명으로 본다', async () => {
    const prisma = buildIneligibleGoalPrisma(FIELD_ID);
    const access = buildFakeAccessService([{ role: 'FIELD_OPERATOR', fieldId: FIELD_ID }]);
    const service = new PublicTournamentRecordsService(prisma, access);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    expect(result.events).toEqual([
      expect.objectContaining({
        participantId: INELIGIBLE_PARTICIPANT.id,
        participantName: '이영희',
        jerseyNumber: 10,
      }),
    ]);
  });

  it('TOURNAMENT_DIRECTOR 는 대회 전체 스코프라 실명으로 본다 (fixtureIds/fieldId 미지정 배정)', async () => {
    const prisma = buildIneligibleGoalPrisma(FIELD_ID);
    const access = buildFakeAccessService([{ role: 'TOURNAMENT_DIRECTOR' }]);
    const service = new PublicTournamentRecordsService(prisma, access);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    expect(result.events).toEqual([
      expect.objectContaining({ participantName: '이영희', jerseyNumber: 10 }),
    ]);
  });

  it('우회가 적용돼도 라인업 스냅샷에 없는 참가자의 이름은 지어내지 않는다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [],
      consentSnapshots: [],
      fieldId: FIELD_ID,
      events: [
        {
          id: 'event-goal-vanished',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-away',
          // 이 게임의 참가자 목록(ELIGIBLE_PARTICIPANT/INELIGIBLE_PARTICIPANT)에
          // 없는 id -- "동의가 없어서 가려짐"이 아니라 "애초에 못 찾음"인 경우.
          participantId: 'participant-vanished',
          period: 1,
          clockMs: 500_000,
          reversesEventId: null,
        },
      ],
    });
    const access = buildFakeAccessService([{ role: 'FIELD_OPERATOR', fieldId: FIELD_ID }]);
    const service = new PublicTournamentRecordsService(prisma, access);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    // participantId 는 (eligible 이므로) 원본 그대로 echo 되지만, 실제 참가자 레코드가
    // 없으니 이름/등번호는 지어내지 않고 null 로 남아야 한다.
    expect(result.events).toEqual([
      expect.objectContaining({
        participantId: 'participant-vanished',
        participantName: null,
        jerseyNumber: null,
      }),
    ]);
  });
});

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) -- `getMatch`도 fixture.homeRegistration/
 * awayRegistration을 통해 팀명을 보여주므로(참가자 실명과는 별개 경로), 모집 중(open)엔
 * 이 팀명도 같은 조건으로 가려야 한다. 이 경기 하나만 다루는 페이지이므로 스태프
 * 우회는 위 스코프 테스트들과 동일한 fixture/field 단위 isStaffBypass를 그대로 쓴다.
 */
describe('PublicTournamentRecordsService.getMatch -- 참가팀 공개 정책 통일(홈/원정 팀명)', () => {
  function buildOpenTournamentPrisma() {
    const now = new Date();
    return buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      tournamentStatus: 'open',
    });
  }

  it('모집 중(open)에는 관전자에게 home/away 팀명·팀ID가 가려진다 — registrationId는 유지', async () => {
    const prisma = buildOpenTournamentPrisma();
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.home).toEqual({ registrationId: 'reg-home', teamId: null, teamName: null });
    expect(result.away).toEqual({ registrationId: 'reg-away', teamId: null, teamName: null });
  });

  it('이 경기가 배정된 필드의 FIELD_OPERATOR에게는 모집 중에도 home/away 팀명이 그대로 보인다', async () => {
    const FIELD_ID = 'a1000000-0000-4000-8000-000000000003';
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      fieldId: FIELD_ID,
      tournamentStatus: 'open',
    });
    const access = buildFakeAccessService([{ role: 'FIELD_OPERATOR', fieldId: FIELD_ID }]);
    const service = new PublicTournamentRecordsService(prisma, access);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, STAFF_USER);

    expect(result.home).toEqual({ registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' });
    expect(result.away).toEqual({ registrationId: 'reg-away', teamId: 'team-away', teamName: '원정팀' });
  });

  it('모집이 끝나면(closed) 관전자에게도 home/away 팀명이 다시 공개된다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      tournamentStatus: 'closed',
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.home).toEqual({ registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' });
  });
});

/**
 * 승부차기(penalties) 표면화 계약.
 *
 * `v1_game_result_revisions.score` 는 느슨한 JSON 이고 **승부차기 필드 이름이 저장
 * 형태마다 다르다** -- 라이브 종료 경로가 쓰는 평평한 형태는 `penalties`(복수),
 * 레거시 백필(`games/migration/game-result-backfill.ts`)이 쓴 중첩 형태는
 * `penalty`(단수). 이 저장소에서 소비처가 한쪽만 읽어 승부차기가 조용히 사라지는
 * 사고가 반복됐으므로(같은 이유로 `tournaments/tournament-fixture-official-result.ts`
 * 도 양쪽을 다 읽는다), 두 형태를 각각 못박는다. 한쪽만 테스트하면 나머지 형태로
 * 저장된 경기에서 승부차기가 사라져도 전부 초록이다.
 */
describe('PublicTournamentRecordsService.getMatch -- 승부차기 표면화', () => {
  const OFFICIAL_AT = new Date('2026-08-10T06:00:00.000Z');

  function buildPenaltyPrisma(score: unknown): PrismaService {
    return buildFakePrisma({
      scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      officialRevision: { state: 'OFFICIAL', supersedesId: null, officialAt: OFFICIAL_AT, score },
    });
  }

  it('평평한 형태 { home, away, penalties } 의 승부차기가 응답에 실린다', async () => {
    const service = new PublicTournamentRecordsService(
      buildPenaltyPrisma({ home: 1, away: 1, penalties: { home: 4, away: 3 } }),
      NO_ASSIGNMENTS_ACCESS,
    );

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.scoreStatus).toBe('official');
    // 정규시간 스코어는 승부차기로 덮이지 않는다 -- 둘은 별개의 값이다.
    expect(result.score).toEqual({ home: 1, away: 1, penalties: { home: 4, away: 3 } });
  });

  it('백필 중첩 형태 { regulation, penalty } 의 승부차기도 같은 모양으로 실린다', async () => {
    const service = new PublicTournamentRecordsService(
      buildPenaltyPrisma({
        regulation: { home: 2, away: 2 },
        penalty: { home: 5, away: 4 },
        goals: [],
        incomplete: false,
        provenance: 'TOURNAMENT_FIXTURE_RESULT',
      }),
      NO_ASSIGNMENTS_ACCESS,
    );

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    // 저장 형태가 달라도 소비처가 보는 모양은 하나여야 한다.
    expect(result.score).toEqual({ home: 2, away: 2, penalties: { home: 5, away: 4 } });
  });

  it('승부차기가 없는 경기는 두 형태 모두 penalties 가 null 이다(키가 사라지지 않는다)', async () => {
    const flat = new PublicTournamentRecordsService(
      buildPenaltyPrisma({ home: 3, away: 0 }),
      NO_ASSIGNMENTS_ACCESS,
    );
    const nested = new PublicTournamentRecordsService(
      buildPenaltyPrisma({
        regulation: { home: 3, away: 0 },
        penalty: null,
        goals: [],
        incomplete: false,
        provenance: 'TOURNAMENT_FIXTURE_RESULT',
      }),
      NO_ASSIGNMENTS_ACCESS,
    );

    expect(await flat.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined)).toMatchObject({
      score: { home: 3, away: 0, penalties: null },
    });
    expect(await nested.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined)).toMatchObject({
      score: { home: 3, away: 0, penalties: null },
    });
  });
});

describe('PublicTournamentRecordsService.getMatch -- periodBreak 배선', () => {
  it('HALFTIME 피리어드가 있으면 응답 periodBreak가 halftime이고 clock은 null이다', async () => {
    const prisma = buildFakePrisma({
      scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      periods: [
        { number: 1, state: 'ENDED', startedAt: new Date('2026-08-10T04:00:00.000Z'), pausedTotalMs: 0, pausedAt: null },
        { number: 2, state: 'HALFTIME', startedAt: null, pausedTotalMs: 0, pausedAt: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.periodBreak).toBe('halftime');
    expect(result.clock).toBeNull();
  });

  it('경기가 이미 종료됐으면(status !== live) 피리어드가 전부 ENDED여도 periodBreak는 null이다', async () => {
    // 게이트가 없으면 `resolvePeriodBreak`가 'regulation_ended'를 반환해, 이미 끝난
    // 경기 응답에 라이브 전용 상태가 실린다(PR #433 Copilot 리뷰 지적). `liveScore`가
    // 이미 `status === 'live'`로 게이팅하는 것과 같은 계약을 맞춘다.
    const prisma = buildFakePrisma({
      scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      gameState: 'ENDED',
      periods: [
        { number: 1, state: 'ENDED', startedAt: new Date('2026-08-10T04:00:00.000Z'), pausedTotalMs: 0, pausedAt: null },
        { number: 2, state: 'ENDED', startedAt: new Date('2026-08-10T04:30:00.000Z'), pausedTotalMs: 0, pausedAt: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.status).toBe('ended');
    expect(result.periodBreak).toBeNull();
  });

  it('진행 중 경기에서 피리어드가 전부 ENDED면(결과 확정 대기) regulation_ended를 노출한다', async () => {
    // 위 테스트와 쌍 -- 게이트가 정상 케이스까지 막아버리면 하프타임/정규시간 종료
    // 표시 자체가 죽으므로, 양방향으로 확인한다.
    const prisma = buildFakePrisma({
      scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
      consentLinks: [],
      consentSnapshots: [],
      events: [],
      periods: [
        { number: 1, state: 'ENDED', startedAt: new Date('2026-08-10T04:00:00.000Z'), pausedTotalMs: 0, pausedAt: null },
        { number: 2, state: 'ENDED', startedAt: new Date('2026-08-10T04:30:00.000Z'), pausedTotalMs: 0, pausedAt: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.status).toBe('live');
    expect(result.periodBreak).toBe('regulation_ended');
  });
});

/**
 * 대회 경기 기록 실명 표시 정책(2026-08-18 사용자 결정) -- 위 "event participant
 * identity" 블록은 "이름이 보이는가"(동의 게이팅)만 다뤘다. 여기서는 그 게이트를
 * 통과한 뒤 "보이면 어떤 이름인가"(resolveParticipantDisplayName)를 세 경우로 못박는다:
 * 토글 ON(실명) / 토글 OFF(닉네임 기본값) / userId 없음(스냅샷 그대로).
 */
describe('PublicTournamentRecordsService.getMatch -- 대회 경기 기록 실명 표시 정책 (닉네임 기본 + 프로필 토글)', () => {
  const LINKED_PARTICIPANT: FakeParticipant = {
    id: 'participant-linked',
    sideId: 'side-home',
    lineupId: 'lineup-home-1',
    userId: 'user-linked',
    displayNameSnapshot: '스냅샷이름',
    jerseyNumber: 11,
    position: 'FW',
  };

  function buildLinkedGoalPrisma(nameProfiles: FakeNameProfile[]) {
    const now = new Date();
    return buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [],
      consentSnapshots: [],
      participants: [LINKED_PARTICIPANT],
      nameProfiles,
      events: [
        {
          id: 'event-goal-linked',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-home',
          participantId: LINKED_PARTICIPANT.id,
          period: 1,
          clockMs: 600_000,
          reversesEventId: null,
        },
      ],
    });
  }

  it('토글 ON: 이벤트/라인업 모두 V1UserProfile.realName(실명)을 보여준다', async () => {
    const prisma = buildLinkedGoalPrisma([
      { userId: 'user-linked', realName: '홍길동', displayName: '길동이', nickname: '닉네임러', tournamentRealNameVisible: true, deletedAt: null },
    ]);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    // 이 fixture는 킥오프 90분 전(라인업 미공개 구간, 위 "라인업이 null..." 테스트와
    // 동일한 전제)이라 lineup은 null이다 -- events 경로만으로 resolveParticipantDisplayName을
    // 검증한다(라인업 게이트 자체는 이 describe의 관심사가 아니다).
    expect(result.events).toEqual([expect.objectContaining({ participantName: '홍길동' })]);
  });

  it('토글 OFF(기본값): 실명이 아니라 nickname(닉네임)을 보여준다', async () => {
    const prisma = buildLinkedGoalPrisma([
      { userId: 'user-linked', realName: '홍길동', displayName: '길동이', nickname: '닉네임러', tournamentRealNameVisible: false, deletedAt: null },
    ]);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([expect.objectContaining({ participantName: '닉네임러' })]);
  });

  // 이 테스트가 이 파일의 핵심 회귀 방어다. 위 케이스들은 realName과 displayName을
  // 서로 다른 값으로 꾸며 두는데, 실제 데이터에는 그런 행이 없다 --
  // `auth.service.ts`의 가입 경로가 `const realName = displayName;`으로 **같은 값**
  // (가입 폼에 적은 실명)을 두 컬럼에 함께 쓰고, `UpdateProfileDto.displayName`은
  // `@deprecated`로 남은 realName의 미러다. 그래서 OFF 분기가 displayName을 우선하면
  // "닉네임을 보여준다"는 계약이 실데이터에서 조용히 깨진다(2026-08-18 alpha 실측:
  // 공개 기록에 nickname이 아니라 displayName이 떴다). 프로덕션과 같은 모양으로 고정한다.
  it('실데이터 모양(realName === displayName)에서도 OFF면 실명이 새지 않는다', async () => {
    const prisma = buildLinkedGoalPrisma([
      { userId: 'user-linked', realName: '홍길동', displayName: '홍길동', nickname: '닉네임러', tournamentRealNameVisible: false, deletedAt: null },
    ]);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([expect.objectContaining({ participantName: '닉네임러' })]);
  });

  // 탈퇴 회원은 nickname이 `deleted_<8자>`(admin.service.ts buildDeletedNickname)라
  // 화면에 그대로 내보낼 수 없다. 탈퇴 시 displayName만 '탈퇴 회원'으로 덮어쓰므로
  // 이 경우에만 displayName을 쓴다.
  it('탈퇴 회원은 deleted_ 닉네임 대신 익명화된 displayName을 보여준다', async () => {
    const prisma = buildLinkedGoalPrisma([
      {
        userId: 'user-linked',
        realName: null,
        displayName: '탈퇴 회원',
        nickname: 'deleted_1234abcd',
        tournamentRealNameVisible: false,
        deletedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([expect.objectContaining({ participantName: '탈퇴 회원' })]);
  });

  it('userId 없음(게스트/미연동): 프로필 조인 대상이 아니므로 displayNameSnapshot 그대로다', async () => {
    // ELIGIBLE_PARTICIPANT는 이 파일 상단에서부터 userId: null -- 대부분의 기존
    // 테스트가 이미 이 경로를 돌지만, 정책 자체를 이 describe 안에서도 명시적으로
    // 박아 둔다(위 두 케이스와 나란히 "세 경우"를 이루도록).
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [],
      consentSnapshots: [],
      // userId가 없는데도 nameProfiles를 채워 둬 "조인 자체를 안 한다"를 증명한다 --
      // 매칭되는 프로필이 있어도 게스트 참가자는 여전히 스냅샷이어야 한다.
      nameProfiles: [
        { userId: 'user-unrelated', realName: '무관한사람', displayName: null, nickname: '무관닉네임', tournamentRealNameVisible: true, deletedAt: null },
      ],
      events: [
        {
          id: 'event-goal-guest',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-home',
          participantId: ELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 600_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([expect.objectContaining({ participantName: '김철수' })]);
  });

  it('userId는 있지만 매칭되는 V1UserProfile 행이 없으면(온보딩 미완료 등) 스냅샷으로 폴백한다', async () => {
    const prisma = buildLinkedGoalPrisma([]); // 프로필 없음
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([expect.objectContaining({ participantName: '스냅샷이름' })]);
  });

  it('토글 ON인데 realName이 비어 있으면(실명 미입력) 빈 이름 대신 닉네임으로 방어적으로 내려간다', async () => {
    const prisma = buildLinkedGoalPrisma([
      // displayName이 남아 있어도(레거시 미러) 실명이 없으면 닉네임으로 내려가야 한다 --
      // displayName을 실명 대체재로 쓰면 OFF 계약과 어긋난 값이 ON 경로로 새어 나온다.
      { userId: 'user-linked', realName: null, displayName: '길동이', nickname: '닉네임러', tournamentRealNameVisible: true, deletedAt: null },
    ]);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    expect(result.events).toEqual([expect.objectContaining({ participantName: '닉네임러' })]);
  });
});
