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
  displayNameSnapshot: string;
  jerseyNumber: number | null;
  position: string | null;
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

const ELIGIBLE_PARTICIPANT: FakeParticipant = {
  id: 'participant-eligible',
  sideId: 'side-home',
  displayNameSnapshot: '김철수',
  jerseyNumber: 7,
  position: 'FW',
};

const INELIGIBLE_PARTICIPANT: FakeParticipant = {
  id: 'participant-ineligible',
  sideId: 'side-away',
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
            state: 'LIVE',
            visibilityPolicy: { mode: 'LIVE', lineupAt: null },
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            participants: [ELIGIBLE_PARTICIPANT, INELIGIBLE_PARTICIPANT],
            currentOfficialRevision: null,
            periods: [],
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
