import type { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 일정 카드 득점자 요약(`getSchedule` -> `PublicScheduleEntry.scorers`) 전용 스펙.
 * `public-tournament-records.service.spec.ts`와 같은 손수 구현 fake-Prisma 패턴을
 * 재사용하되, 그 스펙은 `getMatch`(findFirst 경로)만 다루므로 `getSchedule`이 쓰는
 * `findMany` 경로는 여기서 새로 흉내 낸다.
 */

const TOURNAMENT_ID = 'tournament-1';

/**
 * Issue #377 -- `PublicTournamentRecordsService`'s constructor now also takes
 * a `TournamentStaffAccessService`, but only `getMatch` (not `getSchedule`,
 * which every test in this file exercises) ever calls it. A type-satisfying
 * stub that is never invoked is deliberate here, not a shortcut around real
 * coverage -- the staff-bypass scope tests live in
 * `public-tournament-records.service.spec.ts` next to `getMatch` itself.
 */
const UNUSED_ACCESS_SERVICE = {} as unknown as TournamentStaffAccessService;

type FakeFixture = {
  id: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  groupId: null;
  scheduledAt: Date;
  venue: null;
  status: string;
  homeRegistrationId: string;
  awayRegistrationId: string;
  homeRegistration: { team: { id: string; name: string } };
  awayRegistration: { team: { id: string; name: string } };
  group: null;
  field: null;
  videos: never[];
  game: {
    id: string;
    state: string;
    visibilityPolicy: { mode: string; lineupAt: null };
    currentOfficialRevision: { state: string; supersedesId: null; officialAt: Date; score: unknown } | null;
    sides: { id: string; sideKey: 'HOME' | 'AWAY' }[];
    periods: never[];
    participants: { id: string; sideId: string; displayNameSnapshot: string; jerseyNumber: number | null }[];
  } | null;
};

type FakeGoalEvent = {
  id: string;
  gameId: string;
  // 취소는 GOAL 행이 아니라 CORRECTION 행이 `reversesEventId` 로 가리킨다.
  // fake 가 type 을 안 갖고 있으면 그 구조를 흉내낼 수 없어, 취소된 골이
  // 그대로 남는 실제 버그를 이 스펙이 못 잡는다(알파 실측으로 드러난 사고).
  type: 'GOAL' | 'CARD' | 'FOUL' | 'SUBSTITUTION' | 'CORRECTION';
  sideId: string;
  participantId: string | null;
  period: number | null;
  clockMs: number;
  reversesEventId: string | null;
  /** CARD 이벤트의 색상은 컬럼이 아니라 payload(`{ card: 'YELLOW' | 'RED' }`)에 있다. */
  payload?: unknown;
};

function buildFakePrisma(options: {
  fixtures: FakeFixture[];
  consentLinks: { participantId: string; linkId: string; userId: string }[];
  consentSnapshots: { linkId: string; state: 'GRANTED' | 'REVOKED'; effectiveAt: Date }[];
  /**
   * 사용자 단위 공개 동의(Task 24 규칙 재정의, 2026-08-13). 기본값 없음 --
   * `loadParticipantConsentEligibility`가 `consentLinks`에 있는 userId만
   * 조회하므로, 롤백 스위치 테스트처럼 링크가 있는 케이스는 반드시 이 필드도
   * 채워야 eligible로 남는다.
   */
  userConsents?: { userId: string; state: 'GRANTED' | 'REVOKED' }[];
  goalEvents: FakeGoalEvent[];
  /**
   * 참가팀 공개 정책 통일(fix/v1-publish) — 기본값 'closed'(hideIdentity 항상
   * false)로 이 파일의 기존(득점자 요약) 테스트를 그대로 둔다. 팀명 숨김 자체를
   * 검증하는 아래 describe 블록만 'open'으로 override한다.
   */
  tournamentStatus?: string;
  tournamentId?: string;
}): PrismaService {
  const database = {
    v1Tournament: {
      async findUnique() {
        return {
          id: options.tournamentId ?? TOURNAMENT_ID,
          title: '테스트 대회',
          status: options.tournamentStatus ?? 'closed',
          bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
          bracketPublishScheduledAt: null,
        };
      },
    },
    // getSchedule 은 순위 행이 아직 없는 조별 조를 찾아 '전 지표 0' 기준선을 만든다(#374).
    // 이 spec 의 관심사는 득점자 요약이라 기준선 대상이 없는 상태(빈 배열)로 둔다.
    v1TournamentGroup: {
      async findMany() {
        return [];
      },
    },
    v1TournamentFixture: {
      async findMany(args: { where: { scheduledAt?: unknown } }) {
        // getSchedule은 scheduledAt이 있는 픽스처(paged)와 없는 픽스처(unscheduled)를
        // 서로 다른 where 절로 두 번 조회한다 -- null 여부로 호출을 구분한다.
        const wantsScheduled = args.where.scheduledAt !== null;
        return wantsScheduled ? options.fixtures : [];
      },
    },
    v1TournamentStanding: {
      async findMany() {
        return [];
      },
    },
    v1GameOperationFlag: {
      async findUnique() {
        return { value: 'on' };
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
    v1UserRecordConsent: {
      async findMany() {
        return options.userConsents ?? [];
      },
    },
    v1GameEvent: {
      async findMany(args: { where: Record<string, unknown> }) {
        // loadLiveScores 경로 -- 이 스펙의 관심사가 아니다.
        if ('OR' in args.where) return [];
        // **where 절을 실제로 적용한다.** 예전 fake 는 where 를 무시하고 배열을
        // 통째로 돌려줬는데, 그러면 "쿼리에서 type:'GOAL' 로 걸러 CORRECTION 행을
        // 못 읽는" 종류의 버그를 이 스펙이 절대 못 잡는다(알파에서 실제로 새어나감).
        // Postgres 가 하는 필터링을 fake 도 똑같이 해야 테스트가 계약을 검증한다.
        const wantedType = args.where.type;
        return options.goalEvents.filter(
          (event) => wantedType === undefined || event.type === wantedType,
        );
      },
    },
  };
  return database as unknown as PrismaService;
}

const ELIGIBLE = { id: 'participant-eligible', sideId: 'side-home', displayNameSnapshot: '김철수', jerseyNumber: 7 };
const INELIGIBLE = { id: 'participant-ineligible', sideId: 'side-away', displayNameSnapshot: '이영희', jerseyNumber: 10 };

function makeFixture(overrides: Partial<FakeFixture>): FakeFixture {
  return {
    id: 'fixture-1',
    round: '결승',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
    venue: null,
    status: 'in_progress',
    homeRegistrationId: 'reg-home',
    awayRegistrationId: 'reg-away',
    homeRegistration: { team: { id: 'team-home', name: '홈팀' } },
    awayRegistration: { team: { id: 'team-away', name: '원정팀' } },
    group: null,
    field: null,
    videos: [],
    game: {
      id: 'game-1',
      state: 'LIVE',
      visibilityPolicy: { mode: 'LIVE', lineupAt: null },
      currentOfficialRevision: null,
      sides: [
        { id: 'side-home', sideKey: 'HOME' },
        { id: 'side-away', sideKey: 'AWAY' },
      ],
      periods: [],
      participants: [ELIGIBLE, INELIGIBLE],
    },
    ...overrides,
  };
}

describe('PublicTournamentRecordsService.getSchedule -- 일정 카드 득점자 요약', () => {
  it('정책 변경(2026-08-13): 동의 여부와 무관하게 대회 참가자는 모두 홈/원정과 이름/등번호가 실린다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 600_000, reversesEventId: null },
        { id: 'g2', gameId: 'game-1', type: 'GOAL', sideId: 'side-away', participantId: INELIGIBLE.id, period: 2, clockMs: 2_700_000, reversesEventId: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items).toHaveLength(1);
    // INELIGIBLE(연동/동의 없음)도 이름이 그대로 실린다 -- 대회 참가자는 동의와
    // 무관하게 공개된다(정책 변경). 이전 정책 회귀는 아래 롤백 플래그 테스트로 옮겼다.
    expect(result.items[0].scorers).toEqual([
      { side: 'home', participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 600_000 },
      { side: 'away', participantName: '이영희', jerseyNumber: 10, period: 2, clockMs: 2_700_000 },
    ]);
  });

  it('롤백 스위치(V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true)를 켜면 동의 게이팅으로 되돌아간다', async () => {
    const CONSENT_GATE_ENV_KEY = 'V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE';
    process.env[CONSENT_GATE_ENV_KEY] = 'true';
    try {
      const prisma = buildFakePrisma({
        fixtures: [makeFixture({})],
        consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
        consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
        userConsents: [{ userId: 'user-1', state: 'GRANTED' }],
        goalEvents: [
          { id: 'g1', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 600_000, reversesEventId: null },
          { id: 'g2', gameId: 'game-1', type: 'GOAL', sideId: 'side-away', participantId: INELIGIBLE.id, period: 2, clockMs: 2_700_000, reversesEventId: null },
        ],
      });
      const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

      const result = await service.getSchedule(TOURNAMENT_ID, {});

      expect(result.items[0].scorers).toEqual([
        { side: 'home', participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 600_000 },
        { side: 'away', participantName: null, jerseyNumber: null, period: 2, clockMs: 2_700_000 },
      ]);
    } finally {
      delete process.env[CONSENT_GATE_ENV_KEY];
    }
  });

  it('취소된(reversesEventId로 되돌려진) 골은 요약에서 빠진다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 600_000, reversesEventId: null },
        // 취소 행은 GOAL 이 아니라 CORRECTION 이다 -- 이게 실제 저장 구조다.
        { id: 'c1', gameId: 'game-1', type: 'CORRECTION', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 600_000, reversesEventId: 'g1' },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    // g1 은 c1 에 취소됐고, c1 자신은 GOAL 이 아니므로 득점자가 아니다 -> 빈 배열.
    expect(result.items[0].scorers).toEqual([]);
  });

  // 알파 실측 회귀: 골 2개인 경기에서 둘 다 CORRECTION 으로 취소되고 다시 기록돼
  // GOAL 행이 4개가 됐는데, loadScorers 가 쿼리에서 type:'GOAL' 로 걸러 CORRECTION
  // 행을 아예 안 읽는 바람에 취소 판정이 되지 않아 요약에 4개가 전부 떴다.
  it('취소 후 재기록으로 GOAL 행이 늘어나도, 살아있는 골만 남는다 (알파 실측 회귀)', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 645_886, reversesEventId: null },
        { id: 'g5', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 27_166_083, reversesEventId: null },
        { id: 'c9', gameId: 'game-1', type: 'CORRECTION', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 27_166_083, reversesEventId: 'g5' },
        { id: 'c10', gameId: 'game-1', type: 'CORRECTION', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 645_886, reversesEventId: 'g1' },
        { id: 'g11', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 27_166_083, reversesEventId: null },
        { id: 'g12', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 645_886, reversesEventId: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    // 살아있는 골은 재기록된 g11/g12 둘뿐 -- 4개가 아니다.
    expect(result.items[0].scorers).toEqual([
      { side: 'home', participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 27_166_083 },
      { side: 'home', participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 645_886 },
    ]);
  });

  it('status_only 모드 픽스처는 골이 있어도 요약이 비어 있다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [
        makeFixture({
          game: {
            id: 'game-1',
            state: 'LIVE',
            visibilityPolicy: { mode: 'STATUS_ONLY', lineupAt: null },
            currentOfficialRevision: null,
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            periods: [],
            participants: [ELIGIBLE, INELIGIBLE],
          },
        }),
      ],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 600_000, reversesEventId: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items[0].scorers).toEqual([]);
  });
});

/**
 * `v1_game_result_revisions.score` 에는 두 형태가 공존한다 -- 실시간 확정 경로는
 * 평평한 `{home,away}`, 레거시 백필(`game-result-backfill.ts` ScoreSnapshot)은
 * `{regulation:{home,away},...}`. 리더가 평평한 형태만 알아서 백필된 완료 경기
 * 21건이 전부 `scoreStatus:'unavailable'` 로 보였다(알파 실측 회귀).
 *
 * **승부차기 필드 이름도 형태마다 다르다** -- 평평한 형태는 `penalties`(복수),
 * 백필 형태는 `penalty`(단수). 정규 스코어와 똑같은 함정이라(한쪽만 읽으면 그
 * 형태로 저장된 경기에서만 승부차기가 조용히 사라진다) 양쪽을 함께 못박는다.
 */
describe('PublicTournamentRecordsService.getSchedule -- 리비전 score JSON 두 형태', () => {
  function fixtureWithRevisionScore(score: unknown) {
    return makeFixture({
      status: 'completed',
      game: {
        id: 'game-1',
        state: 'ENDED',
        visibilityPolicy: { mode: 'LIVE', lineupAt: null },
        currentOfficialRevision: {
          state: 'OFFICIAL',
          supersedesId: null,
          officialAt: new Date('2026-08-01T00:00:00.000Z'),
          score,
        },
        sides: [
          { id: 'side-home', sideKey: 'HOME' },
          { id: 'side-away', sideKey: 'AWAY' },
        ],
        periods: [],
        participants: [ELIGIBLE, INELIGIBLE],
      },
    });
  }

  const emptyConsent = { consentLinks: [], consentSnapshots: [], goalEvents: [] };

  it('평평한 형태 {home,away} 를 읽는다 (실시간 확정 경로)', async () => {
    const prisma = buildFakePrisma({ fixtures: [fixtureWithRevisionScore({ home: 2, away: 0 })], ...emptyConsent });
    const result = await new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});
    // 승부차기가 없었던 경기도 `penalties` 키 자체는 남는다(null) -- 소비처가
    // "키가 없다"와 "값이 null 이다" 두 경우를 갈라 다룰 필요가 없게 한다.
    expect(result.items[0].score).toEqual({ home: 2, away: 0, penalties: null });
    expect(result.items[0].scoreStatus).toBe('official');
  });

  it('평평한 형태의 penalties(복수) 를 그대로 실어 보낸다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [fixtureWithRevisionScore({ home: 1, away: 1, penalties: { home: 4, away: 3 } })],
      ...emptyConsent,
    });
    const result = await new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});
    // 정규시간 스코어는 승부차기로 덮이지 않는다 -- 축구에서 둘은 별개의 값이다.
    expect(result.items[0].score).toEqual({ home: 1, away: 1, penalties: { home: 4, away: 3 } });
  });

  it('중첩 형태 {regulation:{home,away}} 를 읽는다 (레거시 백필 경로)', async () => {
    const prisma = buildFakePrisma({
      fixtures: [
        fixtureWithRevisionScore({
          regulation: { home: 3, away: 0 },
          penalty: null,
          goals: [],
          incomplete: false,
          provenance: 'TOURNAMENT_FIXTURE_RESULT',
        }),
      ],
      ...emptyConsent,
    });
    const result = await new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});
    expect(result.items[0].score).toEqual({ home: 3, away: 0, penalties: null });
    expect(result.items[0].scoreStatus).toBe('official');
  });

  it('백필 중첩 형태의 penalty(단수) 도 평평한 형태와 똑같은 모양으로 실린다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [
        fixtureWithRevisionScore({
          regulation: { home: 2, away: 2 },
          penalty: { home: 5, away: 4 },
          goals: [],
          incomplete: false,
          provenance: 'TOURNAMENT_FIXTURE_RESULT',
        }),
      ],
      ...emptyConsent,
    });
    const result = await new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});
    // 저장 형태가 달라도 소비처(공개 일정 화면)가 보는 모양은 하나여야 한다.
    expect(result.items[0].score).toEqual({ home: 2, away: 2, penalties: { home: 5, away: 4 } });
  });

  it('regulation 이 null 이면(스코어 미기록) 점수를 지어내지 않는다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [
        fixtureWithRevisionScore({
          regulation: null,
          penalty: null,
          goals: [],
          incomplete: true,
          provenance: 'TEAM_MATCH_COMPLETION_ONLY',
        }),
      ],
      ...emptyConsent,
    });
    const result = await new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});
    expect(result.items[0].score).toBeNull();
  });
});

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) -- 사용자가 지적한 "참가팀 공개는 안 됐는데
 * 조별일정은 어떻게 되어있냐"의 실제 발단이 이 엔드포인트(`GET /tournaments/:id/schedule`,
 * 화면상 "경기 일정" 탭/`/schedule` 페이지)다. 대회 전체 일정을 한 번에 내려주므로
 * 스태프 우회는 fixture 단위가 아니라 대회 전체 단위(`{ tournamentId }`)로 판정한다 --
 * tournamentId가 UUID 형태여야 decideTournamentStaffAccess가 통과시키므로, 이 블록만
 * 로컬 UUID를 쓴다(파일 상단의 TOURNAMENT_ID는 다른 스펙과의 호환을 위해 그대로 둔다).
 */
describe('PublicTournamentRecordsService.getSchedule -- 참가팀 공개 정책 통일', () => {
  const SCHEDULE_TOURNAMENT_UUID = 'c3000000-0000-4000-8000-000000000001';

  function buildFakeAccessService(
    assignments: readonly { role: 'FIELD_OPERATOR' | 'TOURNAMENT_DIRECTOR' | 'SUPPORT_READONLY'; fieldId?: string | null }[],
  ): TournamentStaffAccessService {
    const fakeAccessPrisma = {
      v1AdminUser: { async findUnique() { return null; } },
      v1TournamentStaffAssignment: {
        async findMany() {
          return assignments.map((assignment, index) => ({
            id: `assignment-${index}`,
            tournamentId: SCHEDULE_TOURNAMENT_UUID,
            role: assignment.role,
            fieldId: assignment.fieldId ?? null,
            version: 1,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            expiresAt: null,
            revokedAt: null,
            fixtureScopes: [],
          }));
        },
      },
    };
    return new TournamentStaffAccessService(fakeAccessPrisma as unknown as PrismaService);
  }

  it('모집 중(open)에는 관전자에게 일정 카드의 home/away 팀명이 가려진다 — registrationId는 유지', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [],
      consentSnapshots: [],
      goalEvents: [],
      tournamentStatus: 'open',
      tournamentId: SCHEDULE_TOURNAMENT_UUID,
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(SCHEDULE_TOURNAMENT_UUID, {}, undefined);

    expect(result.items[0].home).toEqual({ registrationId: 'reg-home', teamId: null, teamName: null });
    expect(result.items[0].away).toEqual({ registrationId: 'reg-away', teamId: null, teamName: null });
  });

  it('대회 운영진(TOURNAMENT_DIRECTOR)에게는 모집 중에도 일정 카드의 팀명이 그대로 보인다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [],
      consentSnapshots: [],
      goalEvents: [],
      tournamentStatus: 'open',
      tournamentId: SCHEDULE_TOURNAMENT_UUID,
    });
    const access = buildFakeAccessService([{ role: 'TOURNAMENT_DIRECTOR' }]);
    const service = new PublicTournamentRecordsService(prisma, access);
    const staffUser = { id: 'staff-1', email: null, accountStatus: 'active' as const, onboardingStatus: 'signup_done' as const };

    const result = await service.getSchedule(SCHEDULE_TOURNAMENT_UUID, {}, staffUser);

    expect(result.items[0].home).toEqual({ registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' });
  });

  it('모집이 끝나면(closed) 관전자에게도 일정 카드의 팀명이 다시 공개된다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [],
      consentSnapshots: [],
      goalEvents: [],
      tournamentStatus: 'closed',
      tournamentId: SCHEDULE_TOURNAMENT_UUID,
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(SCHEDULE_TOURNAMENT_UUID, {}, undefined);

    expect(result.items[0].home).toEqual({ registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' });
  });
});

/**
 * 일정 카드 **카드(경고/퇴장) 요약** 전용. 예전에는 이 요약이 골만 실어서, 같은
 * 경기의 같은 경고가 경기 상세 타임라인에는 나오는데 대회 일정 카드에서는 통째로
 * 사라졌다(오너 지적). 아래 테스트가 그 회귀를 막는다.
 */
describe('PublicTournamentRecordsService.getSchedule -- 일정 카드 카드(경고/퇴장) 요약', () => {
  it('CARD 이벤트가 색상과 함께 cards에 실리고, scorers에는 섞이지 않는다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [],
      consentSnapshots: [],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', type: 'GOAL', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 600_000, reversesEventId: null },
        { id: 'c1', gameId: 'game-1', type: 'CARD', sideId: 'side-away', participantId: INELIGIBLE.id, period: 2, clockMs: 1_500_000, reversesEventId: null, payload: { card: 'YELLOW' } },
        { id: 'c2', gameId: 'game-1', type: 'CARD', sideId: 'side-home', participantId: ELIGIBLE.id, period: 2, clockMs: 1_740_000, reversesEventId: null, payload: { card: 'RED' } },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items[0].cards).toEqual([
      { side: 'away', cardColor: 'YELLOW', participantName: '이영희', jerseyNumber: 10, period: 2, clockMs: 1_500_000 },
      { side: 'home', cardColor: 'RED', participantName: '김철수', jerseyNumber: 7, period: 2, clockMs: 1_740_000 },
    ]);
    // `scorers`는 골만 담는 기존 계약 그대로 -- 이미 배포된 클라이언트가 이 배열의
    // length를 골 수로 읽고 있어, 카드가 한 건이라도 섞이면 곧장 스코어 오독이 된다.
    expect(result.items[0].scorers).toEqual([
      { side: 'home', participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 600_000 },
    ]);
  });

  it('색상을 알 수 없는 과거 payload의 카드는 색을 추측하지 않고 cardColor: null로 내려간다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [],
      consentSnapshots: [],
      goalEvents: [
        { id: 'c1', gameId: 'game-1', type: 'CARD', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 300_000, reversesEventId: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items[0].cards).toEqual([
      { side: 'home', cardColor: null, participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 300_000 },
    ]);
  });

  it('취소된(reversesEventId로 되돌려진) 카드는 요약에서 빠진다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [],
      consentSnapshots: [],
      goalEvents: [
        { id: 'c1', gameId: 'game-1', type: 'CARD', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 300_000, reversesEventId: null, payload: { card: 'YELLOW' } },
        { id: 'x1', gameId: 'game-1', type: 'CORRECTION', sideId: 'side-home', participantId: ELIGIBLE.id, period: 1, clockMs: 300_000, reversesEventId: 'c1' },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items[0].cards).toEqual([]);
  });
});
