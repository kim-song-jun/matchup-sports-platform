import type { Prisma } from '@prisma/client';

/**
 * R3 §4-3단계 — 대회 픽스처 결과를 레거시 `V1TournamentFixtureResult` 대신
 * `V1Game.currentOfficialRevision`(신규 경로)에서 읽기 위한 공용 파서/조립기.
 * `docs/ops/legacy-game-result-r3-removal-inventory.md` §1 참고.
 *
 * `V1GameResultRevision.score`는 느슨한 JSON 컬럼이고, 실제로 서로 다른 두 producer가
 * 공존한다(apps/v1_web/src/types/api.ts의 V1GameResultScore 주석·2026-08 실제 QA 재현과
 * 동일한 사실):
 *  - GAME_BACKFILL(레거시 마이그레이션, apps/v1_api/src/games/migration/game-result-backfill.ts)
 *    이 쓴 리비전은 `{ regulation: {home,away}|null, penalty: {home,away}|null, goals: [...],
 *    incomplete, provenance }` 로 감싸여 있다 — 지금 이미 완료된 대회 픽스처 21건이 전부 이
 *    형태다.
 *  - 새로 대회 경기를 "종료"해서 만든 리비전(GamesService.deriveTournamentRevision ->
 *    scoreFromEvents)은 `{ home, away }` 로 평평하다. 이 경로는 승부차기 개념이 아예 없다 —
 *    `CreateGameResultRevisionDto`(승부차기 `penalties` 지원)는 TOURNAMENT_FIXTURE 소스에
 *    대해 `TOURNAMENT_RESULT_DERIVED_ONLY` 로 하드 거부된다(games.service.ts
 *    createResultRevision). 즉 **오늘 이후 새로 종료되는 대회 경기는 신규 경로 자체에
 *    승부차기 기록 수단이 없다** — 21건의 레거시 백필 데이터만 승부차기 정보를 보존한다.
 */
export type TournamentFixtureOfficialScore = {
  homeScore: number;
  awayScore: number;
  hasPenalty: boolean;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
};

export function parseTournamentFixtureOfficialScore(
  score: Prisma.JsonValue | null | undefined,
): TournamentFixtureOfficialScore | null {
  if (typeof score !== 'object' || score === null || Array.isArray(score)) return null;
  const record = score as Record<string, unknown>;
  if ('regulation' in record) {
    // GAME_BACKFILL 형태 — regulation이 null이면(팀매치 완료-전용 소스처럼 스코어가
    // 아예 없는 경우) 대회 픽스처에서는 나타나지 않아야 하지만, 방어적으로 "결과 없음"
    // 취급한다(허구 스코어를 만들어내지 않는다).
    if (!isScorePair(record.regulation)) return null;
    const penalty = record.penalty;
    const hasPenalty = isScorePair(penalty);
    return {
      homeScore: record.regulation.home,
      awayScore: record.regulation.away,
      hasPenalty,
      homePenaltyScore: hasPenalty ? penalty.home : null,
      awayPenaltyScore: hasPenalty ? penalty.away : null,
    };
  }
  // 평평한 { home, away } 형태 — deriveTournamentRevision 산출물. 승부차기 개념이 없다.
  if (!isScorePair(record)) return null;
  return {
    homeScore: record.home,
    awayScore: record.away,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
  };
}

function isScorePair(value: unknown): value is { home: number; away: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { home?: unknown }).home === 'number' &&
    typeof (value as { away?: unknown }).away === 'number'
  );
}

export type TournamentFixtureOfficialGoal = {
  id: string;
  team: 'home' | 'away';
  playerId: string | null;
  playerName: string;
  minute: number | null;
};

export type TournamentFixtureGoalEventRow = {
  id: string;
  type: string;
  sideId: string | null;
  participantId: string | null;
  clockMs: number;
  reversesEventId: string | null;
};

/**
 * 레거시 `v1_tournament_fixture_goals`의 신규 대응은 `V1GameEvent`의 GOAL 이벤트다.
 * 정정(CORRECTION) 이벤트는 그 자체로는 `type: 'GOAL'`이 아니라서 `type` 필터만으로는
 * 취소된 골을 걸러내지 못한다 — 이 저장소에서 이미 한 번 샌 버그(public-live-score.ts /
 * loadScorers()의 reversedIds 패턴 참고)와 동일한 함정이라, 그 두 곳과 똑같이
 * `reversesEventId`로 되돌려진 이벤트 id 집합을 먼저 구해서 제외한다.
 *
 * 참고로 GAME_BACKFILL로 들어온 21건의 기존 대회 픽스처는 `V1GameEvent` 행 자체를
 * 전혀 만들지 않았다(백필은 score JSON에만 goals를 넣었다) — 그래서 이 함수는 그 21건에
 * 대해 항상 빈 배열을 반환한다. "재현 못 하는 필드" 보고 대상.
 */
export function deriveTournamentFixtureOfficialGoals(
  events: readonly TournamentFixtureGoalEventRow[],
  sideKeyById: ReadonlyMap<string, 'HOME' | 'AWAY'>,
  participantNameById: ReadonlyMap<string, string>,
): TournamentFixtureOfficialGoal[] {
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
  );
  return events
    .filter((event) => event.type === 'GOAL' && !reversedIds.has(event.id))
    .map((event) => ({
      id: event.id,
      team: sideKeyById.get(event.sideId ?? '') === 'HOME' ? ('home' as const) : ('away' as const),
      playerId: event.participantId,
      playerName:
        event.participantId !== null ? (participantNameById.get(event.participantId) ?? '선수 정보 없음') : '선수 정보 없음',
      // 레거시 minute은 기록자가 수기로 입력한 "경기 중 몇 분"이었다(전/후반을 합산했는지
      // 여부도 보장되지 않았다). 신규 경로는 이벤트의 period 내 경과 시간(clockMs)만 갖고
      // 있어 전/후반 누적 분이 아니라 "해당 피리어드 시작 후 경과 분"이다 — 근사치다.
      minute: Math.max(0, Math.floor(event.clockMs / 60000)),
    }));
}

export type TournamentFixtureGameForResult = {
  sides: readonly { id: string; sideKey: 'HOME' | 'AWAY' }[];
  participants: readonly { id: string; displayNameSnapshot: string }[];
  events: readonly TournamentFixtureGoalEventRow[];
  currentOfficialRevision: {
    id: string;
    state: string;
    score: Prisma.JsonValue;
    officialAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
} | null;

export type TournamentFixtureOfficialResult = {
  revisionId: string;
  score: TournamentFixtureOfficialScore;
  officialAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  goals: TournamentFixtureOfficialGoal[];
};

/**
 * 픽스처의 `game` relation 하나를 받아 "레거시 result 존재 여부"에 대응하는 판정 +
 * 스코어/골 조립을 한 번에 한다. `currentOfficialRevisionId`는 OFFICIAL로 전환될 때만
 * 세팅되지만 VOID(결과 무효화) 이후에는 VOID 리비전을 가리키도록 다시 옮겨간다
 * (tournament-result-review.service.ts voidResult 참고) — 그래서 존재 자체가 아니라
 * `state === 'OFFICIAL'`을 반드시 확인해야 레거시의 "결과가 있다"와 동등해진다.
 */
export function resolveTournamentFixtureOfficialResult(
  game: TournamentFixtureGameForResult,
): TournamentFixtureOfficialResult | null {
  const revision = game?.currentOfficialRevision;
  if (!game || !revision || revision.state !== 'OFFICIAL') return null;
  const score = parseTournamentFixtureOfficialScore(revision.score);
  if (!score) return null;
  const sideKeyById = new Map(game.sides.map((side) => [side.id, side.sideKey] as const));
  const participantNameById = new Map(
    game.participants.map((participant) => [participant.id, participant.displayNameSnapshot] as const),
  );
  const goals = deriveTournamentFixtureOfficialGoals(game.events, sideKeyById, participantNameById);
  return {
    revisionId: revision.id,
    score,
    officialAt: revision.officialAt,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
    goals,
  };
}

/** `resolveTournamentFixtureOfficialResult`가 OFFICIAL 결과 유무만 판정할 때 쓰는 얕은 버전. */
export function hasTournamentFixtureOfficialResult(
  game: { currentOfficialRevision: { state: string } | null } | null | undefined,
): boolean {
  return game?.currentOfficialRevision?.state === 'OFFICIAL';
}

/**
 * V1GameEvent를 GOAL/reversesEventId만 좁혀 읽을 때 쓰는 Prisma where/select 모양 --
 * `where: { OR: [{ type: 'GOAL' }, { reversesEventId: { not: null } }] },
 * select: { id, type, sideId, participantId, clockMs, reversesEventId }`.
 * Prisma의 `WhereInput`은 배열 필드(`OR`)가 mutable(`T[]`)이라 `as const`로 얼린 공용
 * 상수를 만들면 readonly 튜플이 되어 대입 자리마다 타입 에러가 난다 -- 그래서 상수로
 * 추출하지 않고, 이 모양 그대로 각 호출부(tournament-bracket.service.ts의 getBracket,
 * tournaments-read.query.ts의 TOURNAMENT_DETAIL_INCLUDE)에 인라인한다. 두 곳 모두
 * `deriveTournamentFixtureOfficialGoals()`가 기대하는 `TournamentFixtureGoalEventRow`
 * 필드 집합과 정확히 일치해야 한다.
 */
