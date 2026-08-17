/**
 * tournament-fixture-official-result.spec.ts
 *
 * R3 §4-3~§4-4단계 사이 한시적 레거시 폴백의 단일 소스(tournament-fixture-official-result.ts)를
 * 직접 검증한다. 순수 함수라 mock 없이 실제 입력/출력만으로 계약을 증명한다.
 *
 * 핵심 두 가지(작업 지시서 그대로):
 *   1. 새 경로에 OFFICIAL 리비전이 없고 레거시 결과만 있을 때 → 레거시로 점수/골/타임스탬프가 나온다.
 *   2. 새 경로와 레거시가 둘 다 있을 때 → 새 경로가 이긴다(레거시는 무시된다).
 * 그 외 hasTournamentFixtureOfficialResult() 가드 판정도 동일 기준으로 함께 검증한다.
 */
import type { Prisma } from '@prisma/client';
import {
  deriveTournamentFixtureOfficialGoals,
  hasTournamentFixtureOfficialResult,
  isPeriodUnknown,
  parseTournamentFixtureOfficialScore,
  resolveTournamentFixtureOfficialResult,
  resolveTournamentFixtureOfficialScore,
  resolveTournamentFixtureOfficialTimestamp,
  type TournamentFixtureGameForResult,
  type TournamentFixtureGoalEventRow,
  type TournamentFixtureLegacyResult,
} from './tournament-fixture-official-result';

function officialGame(overrides: Record<string, unknown> = {}): TournamentFixtureGameForResult {
  return {
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    participants: [{ id: 'player-1', displayNameSnapshot: '새경로 선수' }],
    events: [
      // payload: null -- 라이브로 기록된 평범한 골(백필의 `minuteKnown` 표식 없음).
      { id: 'event-1', type: 'GOAL', sideId: 'side-home', participantId: 'player-1', clockMs: 60000, reversesEventId: null, payload: null },
    ],
    currentOfficialRevision: {
      id: 'revision-new-path',
      state: 'OFFICIAL',
      score: { home: 2, away: 1 } satisfies Prisma.JsonObject,
      officialAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    ...overrides,
  } as TournamentFixtureGameForResult;
}

function legacyResult(overrides: Record<string, unknown> = {}): TournamentFixtureLegacyResult {
  return {
    id: 'legacy-result-1',
    fixtureId: 'fixture-1',
    homeScore: 3,
    awayScore: 0,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: '레거시 메모',
    recordedByAdminUserId: null,
    recordedAt: new Date('2026-07-01T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    goals: [
      {
        id: 'legacy-goal-1',
        fixtureResultId: 'legacy-result-1',
        team: 'home',
        playerId: null,
        playerName: '레거시 득점자',
        minute: 10,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
    ...overrides,
  } as TournamentFixtureLegacyResult;
}

describe('resolveTournamentFixtureOfficialScore', () => {
  it('game 자체가 없고(백필 전) 레거시만 있을 때 → 레거시 스코어로 폴백한다', () => {
    const score = resolveTournamentFixtureOfficialScore(null, {
      homeScore: 3,
      awayScore: 0,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
    expect(score).toEqual({ homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null });
  });

  it('OFFICIAL 리비전과 레거시가 둘 다 있으면 새 경로 스코어가 이긴다', () => {
    const score = resolveTournamentFixtureOfficialScore(
      { currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 } } },
      { homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
    );
    expect(score).toEqual({ homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null });
  });

  it('VOID로 넘어간 리비전은 OFFICIAL이 아니므로 레거시로 폴백한다', () => {
    const score = resolveTournamentFixtureOfficialScore(
      { currentOfficialRevision: { state: 'VOID', score: { home: 2, away: 1 } } },
      { homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
    );
    expect(score).toEqual({ homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null });
  });

  it('둘 다 없으면 null', () => {
    expect(resolveTournamentFixtureOfficialScore(null, null)).toBeNull();
    expect(resolveTournamentFixtureOfficialScore(null, undefined)).toBeNull();
  });
});

describe('parseTournamentFixtureOfficialScore (승부차기)', () => {
  it('평평한 {home,away} 형태에 penalties가 없으면 hasPenalty:false로 남는다(회귀 방지)', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 0 })).toEqual({
      homeScore: 1,
      awayScore: 0,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
  });

  it('평평한 {home,away,penalties} 형태(GamesService.deriveTournamentRevision/교정 산출물) → hasPenalty가 표면화된다', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 1, penalties: { home: 5, away: 4 } })).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 4,
    });
  });

  it('중첩 GAME_BACKFILL 형태의 penalty는 기존대로 계속 동작한다(회귀 방지)', () => {
    expect(
      parseTournamentFixtureOfficialScore({
        regulation: { home: 1, away: 1 },
        penalty: { home: 5, away: 4 },
        goals: [],
        incomplete: false,
        provenance: 'GAME_BACKFILL',
      }),
    ).toEqual({ homeScore: 1, awayScore: 1, hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 4 });
  });

  it('penalties가 구조를 갖추지 못하면(home/away 아님) hasPenalty:false로 무시한다', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 1, penalties: { home: 5 } })).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
  });
});

describe('resolveTournamentFixtureOfficialResult', () => {
  it('새 경로에 OFFICIAL 리비전이 없고 레거시 결과만 있을 때 → 레거시 스코어/골/note/타임스탬프로 조립한다', () => {
    const resolved = resolveTournamentFixtureOfficialResult(null, legacyResult());
    expect(resolved).toEqual({
      revisionId: 'legacy-result-1',
      score: { homeScore: 3, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
      note: '레거시 메모',
      officialAt: new Date('2026-07-01T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      goals: [
        { id: 'legacy-goal-1', team: 'home', playerId: null, playerName: '레거시 득점자', minute: 10 },
      ],
    });
  });

  it('새 경로 OFFICIAL 리비전과 레거시 결과가 둘 다 있으면 새 경로가 이긴다(레거시는 무시)', () => {
    const resolved = resolveTournamentFixtureOfficialResult(officialGame(), legacyResult());
    expect(resolved).toMatchObject({
      revisionId: 'revision-new-path',
      score: { homeScore: 2, awayScore: 1 },
      note: null,
    });
    expect(resolved?.goals).toEqual([
      { id: 'event-1', team: 'home', playerId: 'player-1', playerName: '새경로 선수', minute: 1 },
    ]);
  });

  it('레거시 결과도 game도 없으면 null', () => {
    expect(resolveTournamentFixtureOfficialResult(null, null)).toBeNull();
    expect(resolveTournamentFixtureOfficialResult(null, undefined)).toBeNull();
  });

  it('OFFICIAL 리비전은 있지만 score가 파싱 불가하면 레거시로 덮어쓰지 않고 null(조용한 데이터 오염 방지)', () => {
    const resolved = resolveTournamentFixtureOfficialResult(
      officialGame({
        currentOfficialRevision: {
          id: 'revision-new-path',
          state: 'OFFICIAL',
          score: { garbage: true } satisfies Prisma.JsonObject,
          officialAt: new Date('2026-08-01T00:00:00.000Z'),
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      }),
      legacyResult(),
    );
    expect(resolved).toBeNull();
  });
});

describe('hasTournamentFixtureOfficialResult', () => {
  it('game 없음 + 레거시 결과 있음 → true(폴백 반영)', () => {
    expect(hasTournamentFixtureOfficialResult(null, { id: 'legacy-result-1' })).toBe(true);
  });

  it('game 없음 + 레거시 결과도 없음 → false', () => {
    expect(hasTournamentFixtureOfficialResult(null, null)).toBe(false);
    expect(hasTournamentFixtureOfficialResult(undefined, undefined)).toBe(false);
  });

  it('새 경로 OFFICIAL 리비전이 있으면 레거시 유무와 무관하게 true', () => {
    expect(hasTournamentFixtureOfficialResult({ currentOfficialRevision: { state: 'OFFICIAL' } }, null)).toBe(true);
  });

  it('VOID 리비전만 있고 레거시가 없으면 false(레거시 결과만 있는 픽스처의 팀 변경 가드와 동일 기준)', () => {
    expect(hasTournamentFixtureOfficialResult({ currentOfficialRevision: { state: 'VOID' } }, null)).toBe(false);
  });
});

describe('resolveTournamentFixtureOfficialTimestamp', () => {
  it('game 없음 + 레거시 recordedAt 있음 → 레거시 타임스탬프로 폴백(리뷰 게이트가 이 값을 그대로 쓴다)', () => {
    const recordedAt = new Date('2026-07-01T00:00:00.000Z');
    expect(resolveTournamentFixtureOfficialTimestamp(null, recordedAt)).toEqual(recordedAt);
  });

  it('새 경로 OFFICIAL 리비전이 있으면 officialAt이 이기고 레거시는 무시된다', () => {
    const officialAt = new Date('2026-08-01T00:00:00.000Z');
    const legacyRecordedAt = new Date('2026-07-01T00:00:00.000Z');
    expect(
      resolveTournamentFixtureOfficialTimestamp({ currentOfficialRevision: { state: 'OFFICIAL', officialAt } }, legacyRecordedAt),
    ).toEqual(officialAt);
  });

  it('둘 다 없으면 null(완료 처리 안 된 경기)', () => {
    expect(resolveTournamentFixtureOfficialTimestamp(null, null)).toBeNull();
    expect(resolveTournamentFixtureOfficialTimestamp(null, undefined)).toBeNull();
  });
});

/**
 * 골 이벤트 백필(goal-event-backfill.ts)이 "몇 분인지 모르는 골"을 넣기 시작하면서
 * 생긴 계약. `V1GameEvent.clockMs`는 non-null이라 분을 모르는 골도 `clockMs: 0`으로
 * 저장될 수밖에 없는데, 그대로 분으로 환산하면 "0분 득점"이라는 없는 사실을 만든다.
 * 그래서 백필은 `payload.minuteKnown: false`를 함께 실어 보내고, 읽는 쪽은 그 표식을
 * 보면 분을 `0`이 아니라 `null`(모름)로 내려야 한다.
 *
 * `TournamentFixtureOfficialGoal.minute`는 이미 `number | null`이므로 DTO 변경은
 * 필요 없다 — 지금은 `Math.max(0, ...)`가 null이 될 길을 막고 있을 뿐이다.
 */
describe('deriveTournamentFixtureOfficialGoals — minuteKnown', () => {
  const sideKeyById = new Map<string, 'HOME' | 'AWAY'>([
    ['side-home', 'HOME'],
    ['side-away', 'AWAY'],
  ]);
  const participantNameById = new Map<string, string>();

  function goalEvent(overrides: Record<string, unknown> = {}) {
    return {
      id: 'event-1',
      type: 'GOAL',
      sideId: 'side-home',
      participantId: null,
      clockMs: 0,
      reversesEventId: null,
      ...overrides,
    } as TournamentFixtureGoalEventRow;
  }

  it('minuteKnown이 false면 분을 0이 아니라 null(모름)로 내린다', () => {
    const goals = deriveTournamentFixtureOfficialGoals(
      [goalEvent({ payload: { source: 'GOAL_BACKFILL_V1', minuteKnown: false } })],
      sideKeyById,
      participantNameById,
    );

    expect(goals).toHaveLength(1);
    expect(goals[0].minute).toBeNull();
  });

  it('minuteKnown 표식이 없는 골은 기존대로 clockMs를 분으로 환산한다(회귀 방지)', () => {
    const goals = deriveTournamentFixtureOfficialGoals(
      [goalEvent({ clockMs: 71 * 60_000, payload: { source: 'GOAL_BACKFILL_V1' } })],
      sideKeyById,
      participantNameById,
    );

    expect(goals[0].minute).toBe(71);
  });

  it('진짜 0분 득점(minuteKnown 표식 없음)은 계속 0으로 남는다 — null과 구분된다', () => {
    // "0분"과 "모름"이 둘 다 clockMs 0으로 저장되므로, payload 표식이 없을 때까지
    // null로 접어버리면 실제 개막 직후 득점이 사라진다.
    const goals = deriveTournamentFixtureOfficialGoals(
      [goalEvent({ clockMs: 0, payload: null })],
      sideKeyById,
      participantNameById,
    );

    expect(goals[0].minute).toBe(0);
  });

  it('백필이 쓰지 않은 이벤트의 minuteKnown:false 는 무시한다 — 라이브 골의 시각을 지우지 못한다', () => {
    // `V1GameEvent.payload` 는 `AppendGameEventDto` 에서 `@IsObject()` 하나만 걸린
    // 자유형 객체다(games/dto/game-event.dto.ts) — 전역 ValidationPipe 의 whitelist 도
    // 그 안쪽 키까지 검사하지 않으므로 기록 클라이언트가 아무 키나 넣을 수 있다.
    // `source` 를 확인하지 않고 `minuteKnown` 만 보면, 아래 71분 골의 시각이 공개
    // 대진표/타임라인/일정 카드에서 통째로 사라진다.
    const goals = deriveTournamentFixtureOfficialGoals(
      [goalEvent({ clockMs: 71 * 60_000, payload: { note: '현장 메모', minuteKnown: false } })],
      sideKeyById,
      participantNameById,
    );

    expect(goals[0].minute).toBe(71);
  });
});

describe('isPeriodUnknown — 백필이 복원한 골은 전/후반을 모른다', () => {
  it('백필이 쓴 행이면 표식(minuteKnown) 유무와 무관하게 period 를 모른다고 판정한다', () => {
    // 레거시 원본에는 전/후반이 아예 없었다 — 분이 남아 있는 골도 마찬가지다.
    // 그래서 `minuteKnown` 같은 행별 표식 없이 `source` 만으로 판정하며, 덕분에
    // 이미 삽입된 행에도 소급 적용된다.
    expect(isPeriodUnknown({ source: 'GOAL_BACKFILL_V1', legacyPlayerName: '김철수' })).toBe(true);
    expect(isPeriodUnknown({ source: 'GOAL_BACKFILL_V1', minuteKnown: false })).toBe(true);
  });

  it('라이브로 기록된 골의 period 는 그대로 신뢰한다', () => {
    expect(isPeriodUnknown(null)).toBe(false);
    expect(isPeriodUnknown(undefined)).toBe(false);
    expect(isPeriodUnknown({ card: 'YELLOW' })).toBe(false);
    // 클라이언트가 백필 흉내를 낼 수 없는 것은 아니지만(자유형 payload), 그때 잃는 것은
    // "전반/후반" 라벨뿐이고 득점 사실·시각은 그대로 남는다 — minute 쪽과 달리
    // period 는 애초에 이 경로에서 신뢰도가 낮은 값이다.
    expect(isPeriodUnknown({ minuteKnown: false })).toBe(false);
  });
});
