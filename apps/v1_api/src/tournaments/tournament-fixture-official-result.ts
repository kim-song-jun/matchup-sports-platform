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
 *    scoreFromEvents)은 `{ home, away, penalties?: {home,away} }` 로 평평하다.
 *    `CreateGameResultRevisionDto`는 TOURNAMENT_FIXTURE 소스에 대해 여전히
 *    `TOURNAMENT_RESULT_DERIVED_ONLY` 로 하드 거부되지만(games.service.ts
 *    createResultRevision), 결선(knockout, `V1TournamentGroup.phase !== 'group'`) 경기를
 *    `end` 커맨드로 종료할 때 정규시간이 무승부면 `payload.penalties: {home,away}`를 함께
 *    보내 승부차기 스코어를 기록할 수 있다(games.service.ts의 `applyPenalties`/
 *    `extractEndPenalties` 참고) — 조별리그 경기는 같은 경로에서 하드 거부된다. 그 전까지는
 *    (이 변경 이전 리비전) 21건의 레거시 백필 데이터만 승부차기 정보를 보존했다.
 *
 * **레거시 폴백(R3 §4-3~§4-4단계 사이 한시적):** 새 경로를 무조건 우선하되, 새 경로에
 * `currentOfficialRevision` 자체가 없을 때만(`game`이 아직 없는 경우 포함) 레거시
 * `V1TournamentFixtureResult`로 폴백한다. 이 창(window) 안에서는 레거시 테이블이 여전히
 * 실사용처를 가진다(`docs/ops/legacy-game-result-r3-removal-inventory.md` §3) — 폴백이
 * 없으면 아직 game 백필이 안 된 픽스처·환경에서 점수가 조용히 0/빈칸이 된다(오너가 신고한
 * "결과를 확정해도 점수가 안 바뀐다" 버그의 원인). 이 폴백 자체는 문서 §4-4단계
 * (`TOURNAMENT_DETAIL_INCLUDE` 등 레거시 조인 제거)에서 함께 삭제된다 — `resolveTournamentFixtureOfficialScore`/
 * `resolveTournamentFixtureOfficialResult`/`hasTournamentFixtureOfficialResult`/
 * `resolveTournamentFixtureOfficialTimestamp` 네 함수 모두 정확히 같은 우선순위 기준으로
 * 판정해야 소비처 간(스코어보드/순위/가드/리뷰 게이트) 결과가 어긋나지 않는다.
 *
 * **`revision`이 존재하지만 `state !== 'OFFICIAL'`인 경우(대표적으로 VOID)는 레거시로
 * 폴백하지 않고 "결과 없음"으로 취급한다.** `currentOfficialRevisionId`는 OFFICIAL로
 * 전환될 때만 세팅되고, 결과가 무효화(voidResultRevision)되면 그 VOID 리비전을 계속
 * 가리키도록 옮겨간다 — 즉 revision이 있다는 것 자체가 "새 경로가 이 픽스처에 대해 명시적
 * 답을 갖고 있다"는 뜻이다. 그 답이 VOID(무효화)일 때 레거시의 오래된 스코어로 조용히
 * 덮어써 버리면 운영자가 무효화 버튼을 눌러도 스코어보드/순위/통계에는 반영되지 않는
 * 조용한 데이터 오염이 된다(위 "score 파싱 실패" 케이스와 동일한 원칙 — 새 경로 값이
 * 이상해도 레거시로 덮어쓰지 않는다). 레거시로 폴백하는 것은 오직 `revision` 자체가
 * 없을 때(새 경로가 아직 이 픽스처에 대해 아무 답도 갖고 있지 않을 때)뿐이다.
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
  // 평평한 { home, away, penalties? } 형태 — deriveTournamentRevision/createResultCorrection/
  // supersedeAndSubmit 산출물. `penalties`가 있으면(결선 무승부 승부차기 기록) 레거시
  // hasPenalty/homePenaltyScore/awayPenaltyScore와 같은 모양으로 표면화한다 -- 아래 두
  // producer가 둘 다 같은 필드 이름(`penalties: {home,away}`)을 쓰므로 하나의 검사로 충분하다.
  const penalties = record.penalties;
  const hasPenalty = isScorePair(penalties);
  if (!isScorePair(record)) return null;
  return {
    homeScore: record.home,
    awayScore: record.away,
    hasPenalty,
    homePenaltyScore: hasPenalty ? penalties.home : null,
    awayPenaltyScore: hasPenalty ? penalties.away : null,
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
  /**
   * `playerId`(신규 경로에서는 `V1GameParticipant.id`)는 경기(대회 픽스처)마다 새로 생기는
   * 값이라 대회 전체에서 같은 로스터 선수를 묶는 안정적 키로 못 쓴다 — `V1GameParticipant.userId`
   * 만 라인업 저장 시점부터 대회 전체에서 동일하다(공개 개인 어워드 랭킹이 이미 이 우선순위를
   * 쓴다, public-tournament-records.service.ts의 `resolveScorerKey` 참고). 명단에 없는
   * 비회원/대타 득점자이거나 레거시 폴백 결과일 때는 null — 그때만 이름+팀으로 동일인을
   * 판정한다(같은 팀 동명이인은 여전히 구분 못 하지만, userId가 있는 한 이 값이 우선한다).
   */
  playerUserId: string | null;
  minute: number | null;
  ownGoal?: boolean;
};

export type TournamentFixtureRevisionGoal = {
  id: string;
  sideId: string;
  participantId: string | null;
  minute: number | null;
  period: number | null;
  ownGoal: boolean;
};

/**
 * 자책골의 `sideId`는 점수를 얻는 상대 팀을 가리키지만, 경기 기록에서 선수는
 * 실제 소속 팀 영역에 보여야 한다. 점수 계산용 sideId는 변경하지 않고 표시
 * projection에서만 행위 선수의 sideId를 사용한다.
 */
export function resolveGoalDisplaySideId(
  creditedSideId: string,
  participantId: string | null,
  ownGoal: boolean,
  participantSideIdById: ReadonlyMap<string, string>,
): string {
  if (!ownGoal || participantId === null) return creditedSideId;
  return participantSideIdById.get(participantId) ?? creditedSideId;
}

export function parseTournamentFixtureRevisionGoals(
  value: Prisma.JsonValue | null | undefined,
): TournamentFixtureRevisionGoal[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: TournamentFixtureRevisionGoal[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.sideId !== 'string') return null;
    if (row.participantId !== null && row.participantId !== undefined && typeof row.participantId !== 'string') return null;
    if (row.minute !== null && row.minute !== undefined && (!Number.isSafeInteger(row.minute) || (row.minute as number) < 0)) return null;
    if (row.period !== null && row.period !== undefined && (!Number.isSafeInteger(row.period) || (row.period as number) < 1)) return null;
    if (typeof row.ownGoal !== 'boolean') return null;
    parsed.push({
      id: row.id,
      sideId: row.sideId,
      participantId: typeof row.participantId === 'string' ? row.participantId : null,
      minute: typeof row.minute === 'number' ? row.minute : null,
      period: typeof row.period === 'number' ? row.period : null,
      ownGoal: row.ownGoal,
    });
  }
  return parsed;
}

export type TournamentFixtureGoalEventRow = {
  id: string;
  type: string;
  sideId: string | null;
  participantId: string | null;
  clockMs: number;
  reversesEventId: string | null;
  /**
   * 골 이벤트 백필이 남긴 표식(`source` / `minuteKnown`)만 이 파일이 payload에서
   * 읽는다 — 그 외 키는 보지 않는다. 아래 `isBackfilledGoalEvent` 주석 참고.
   */
  payload: Prisma.JsonValue;
};

/**
 * 골 이벤트 백필(`games/migration/goal-event-backfill.ts`)이 자기가 쓴 GOAL 이벤트에
 * 싣는 `payload.source` 값. **읽는 쪽인 이 파일이 정본**이고 백필이 이걸 import 해서
 * 쓴다 — 양쪽이 문자열을 따로 적으면 한쪽만 바뀌었을 때 표식이 조용히 무시되고
 * (= "모름"이 "0분"으로 되살아나고) 컴파일러는 아무 말도 하지 않는다.
 */
export const GOAL_BACKFILL_EVENT_SOURCE = 'GOAL_BACKFILL_V1' as const;

function backfillPayload(payload: Prisma.JsonValue | undefined): Record<string, unknown> | null {
  if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  // `source` 확인이 이 판정의 핵심 방어다. `V1GameEvent.payload`는 `AppendGameEventDto`
  // 에서 `@IsObject()` 하나만 걸린 자유형 객체라(games/dto/game-event.dto.ts), 전역
  // ValidationPipe의 whitelist도 그 안쪽까지 파고들지 않는다 — 즉 기록 클라이언트가
  // 아무 키나 넣을 수 있다. `minuteKnown` 만 보고 판정하면 라이브 기록에 우연히(혹은
  // 악의로) 실린 `minuteKnown: false` 가 실제 71분 득점의 시각을 공개 화면에서
  // 지워버린다. 백필이 쓴 행에만 적용되도록 producer 를 먼저 확인한다.
  return record.source === GOAL_BACKFILL_EVENT_SOURCE ? record : null;
}

/**
 * "이 GOAL 이벤트는 골 이벤트 백필이 레거시 스냅숏에서 복원한 행인가."
 *
 * 백필이 복원하는 레거시 원본(`v1_tournament_fixture_results`의 goals[])은 골마다
 * **분(minute) 하나만** 갖고 있었고 전/후반(period)은 아예 기록된 적이 없다. 그런데
 * `V1GameEvent.period` 는 non-null 컬럼이라 백필은 모든 골을 `period: 1` 로 넣을 수밖에
 * 없다 — 그 값을 그대로 내보내면 공개 화면이 그걸 "전반"이라고 단정한다(상세 타임라인의
 * `periodLabel()` 섹션 헤딩, 일정 카드의 전반/후반 분리). 그래서 백필이 쓴 골은 period 를
 * `null`("모름")로 내린다. 백필 행 **전부**가 대상이라 `minuteKnown` 같은 별도 표식이
 * 필요 없고, 덕분에 이 규칙은 이미 삽입된 행에도 소급 적용된다.
 */
export function isPeriodUnknown(payload: Prisma.JsonValue | undefined): boolean {
  return backfillPayload(payload) !== null;
}

/**
 * "이 골은 레거시 기록에 분 자체가 없던 골인가" — 백필이 그런 골에만
 * `minuteKnown: false` 를 싣는다. `clockMs` 가 non-null 컬럼이라 그런 골도 `0` 으로
 * 저장될 수밖에 없어서, 이 표식이 없으면 "0분 득점"과 "몇 분인지 모름"이 구분되지
 * 않는다. 표식이 있을 때만 분을 `null` 로 내리고, 없으면 기존대로 `clockMs` 를 그대로
 * 환산한다 — 표식 없는 `clockMs: 0` 을 null 로 접으면 실제 개막 직후 득점이 사라진다.
 */
export function isMinuteUnknown(payload: Prisma.JsonValue | undefined): boolean {
  return backfillPayload(payload)?.minuteKnown === false;
}

/**
 * 레거시 `v1_tournament_fixture_goals`의 신규 대응은 `V1GameEvent`의 GOAL 이벤트다.
 * 정정(CORRECTION) 이벤트는 그 자체로는 `type: 'GOAL'`이 아니라서 `type` 필터만으로는
 * 취소된 골을 걸러내지 못한다 — 이 저장소에서 이미 한 번 샌 버그(public-live-score.ts /
 * loadScorers()의 reversedIds 패턴 참고)와 동일한 함정이라, 그 두 곳과 똑같이
 * `reversesEventId`로 되돌려진 이벤트 id 집합을 먼저 구해서 제외한다.
 *
 * GAME_BACKFILL로 들어온 21건의 기존 대회 픽스처는 원래 `V1GameEvent` 행 자체가
 * 없어서(백필이 score JSON에만 goals를 넣었다) 이 함수가 항상 빈 배열을 반환했다.
 * 골 이벤트 백필(`games/migration/goal-event-backfill.ts`)이 그 골들을 GOAL 이벤트로
 * 복원하면서 더는 그렇지 않다 — 다만 그 백필은 참가자를 특정할 수 없는 골
 * (`PARTICIPANT_UNRESOLVED`)은 일부러 넣지 않으므로, 여기서 나오는 골 목록이 score
 * JSON의 goals 전부와 일치한다는 보장은 없다.
 *
 * `minute`은 `clockMs`를 분으로 환산하되, 백필이 `payload.minuteKnown: false`로
 * "분을 모른다"고 표시한 골은 `0`이 아니라 `null`로 내린다(`isMinuteUnknown` 주석 참고).
 */
export function deriveTournamentFixtureOfficialGoals(
  events: readonly TournamentFixtureGoalEventRow[],
  sideKeyById: ReadonlyMap<string, 'HOME' | 'AWAY'>,
  participantNameById: ReadonlyMap<string, string>,
  participantSideIdById: ReadonlyMap<string, string> = new Map(),
  participantUserIdById: ReadonlyMap<string, string | null> = new Map(),
): TournamentFixtureOfficialGoal[] {
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
  );
  return events
    .filter(
      (event) =>
        (event.type === 'GOAL' || event.type === 'OWN_GOAL') &&
        !reversedIds.has(event.id),
    )
    .map((event) => ({
      id: event.id,
      team:
        sideKeyById.get(
          resolveGoalDisplaySideId(
            event.sideId ?? '',
            event.participantId,
            event.type === 'OWN_GOAL',
            participantSideIdById,
          ),
        ) === 'HOME'
          ? ('home' as const)
          : ('away' as const),
      playerId: event.participantId,
      playerName:
        event.participantId !== null ? (participantNameById.get(event.participantId) ?? '선수 정보 없음') : '선수 정보 없음',
      playerUserId: event.participantId !== null ? (participantUserIdById.get(event.participantId) ?? null) : null,
      // 레거시 minute은 기록자가 수기로 입력한 "경기 중 몇 분"이었다(전/후반을 합산했는지
      // 여부도 보장되지 않았다). 신규 경로는 이벤트의 period 내 경과 시간(clockMs)만 갖고
      // 있어 전/후반 누적 분이 아니라 "해당 피리어드 시작 후 경과 분"이다 — 근사치다.
      // 단 "분 자체가 기록되지 않은 골"은 근사치조차 없으므로 null(모름)이다.
      minute: isMinuteUnknown(event.payload) ? null : Math.max(0, Math.ceil(event.clockMs / 60000)),
      ...(event.type === 'OWN_GOAL' ? { ownGoal: true } : {}),
    }));
}

export type TournamentFixtureGameForResult = {
  sides: readonly { id: string; sideKey: 'HOME' | 'AWAY' }[];
  participants: readonly { id: string; sideId?: string; userId?: string | null; displayNameSnapshot: string }[];
  events: readonly TournamentFixtureGoalEventRow[];
  currentOfficialRevision: {
    id: string;
    state: string;
    score: Prisma.JsonValue;
    goalEvents?: Prisma.JsonValue | null;
    /**
     * 정상 종료가 아니면(몰수/중단) 그 종류 — `V1GameOutcomeReason`(schema.prisma).
     * `currentOfficialRevisionId`는 OFFICIAL로만 세팅되므로 이 필드는 항상 새 경로에서
     * 조립된 결과를 소비하는 화면(어드민 통계 등)이 정상 종료가 아닌 경기를 구분해
     * 다르게 취급할 수 있게 하는 근거다(finding: 몰수·중단 경기가 정상 경기와 동일하게
     * 집계됨). 선택 필드로 둔 것은 이 필드를 select하지 않는 기존 소비처(팀 변경 가드
     * 등)와의 호환 때문 — undefined면 'NORMAL'로 취급한다.
     */
    outcomeReason?: string | null;
    officialAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
} | null;

export type TournamentFixtureOfficialResult = {
  revisionId: string;
  score: TournamentFixtureOfficialScore;
  /**
   * 신규 경로(V1GameResultRevision)에는 대응 컬럼이 없어 새 경로에서 조립된 결과는 항상
   * `null`이다. 레거시 폴백에서 나온 결과만 레거시 `V1TournamentFixtureResult.note`를
   * 그대로 채운다.
   */
  note: string | null;
  /**
   * 정상 종료가 아니면 그 종류('FORFEIT' | 'ABANDONED'). 레거시 폴백 결과는 이 개념이
   * 생기기 전 데이터라 항상 'NORMAL'이다.
   */
  outcomeReason: 'NORMAL' | 'FORFEIT' | 'ABANDONED';
  officialAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  goals: TournamentFixtureOfficialGoal[];
};

/**
 * R3 §4-4단계(문서 §4)까지의 한시적 레거시 폴백 입력. `V1TournamentFixtureResult`를
 * `goals`와 함께 그대로 받는다 — Prisma의 `V1TournamentFixtureResultGetPayload`를 그대로
 * 재사용해 스키마 필드와 어긋나지 않게 한다.
 */
export type TournamentFixtureLegacyResult = Prisma.V1TournamentFixtureResultGetPayload<{
  include: { goals: true };
}> | null;

/**
 * 순위 계산처럼 골 목록·note 없이 스코어만 필요한 소비처(tournament-group-standings.ts)가
 * 쓰는 얕은 버전. "새 경로 우선, `revision` 자체가 없을 때만 레거시로 폴백"이라는 판정
 * 기준의 단일 소스 — `resolveTournamentFixtureOfficialResult()`도 이 함수와 정확히 같은
 * 기준으로 분기한다. 두 곳이 서로 다른 기준으로 판정하면 순위표와 스코어보드가 어긋난다.
 *
 * `revision`이 있지만 `state !== 'OFFICIAL'`(VOID 등)이면 레거시로 폴백하지 않고
 * null(결과 없음)을 반환한다 — 무효화된 결과가 오래된 레거시 스코어로 되살아나면 안 된다
 * (파일 상단 "레거시 폴백" 주석 참고).
 *
 * 이 폴백은 R3 §4-4단계(문서 §4, `TOURNAMENT_DETAIL_INCLUDE` 등 레거시 조인 제거)에서
 * 함께 제거되는 한시적 호환 읽기다 — 그 전까지는 레거시 테이블이 실사용처를 가진다
 * (docs/ops/legacy-game-result-r3-removal-inventory.md §3).
 */
export function resolveTournamentFixtureOfficialScore(
  game: { currentOfficialRevision: { state: string; score: Prisma.JsonValue } | null } | null | undefined,
  legacyScore: TournamentFixtureOfficialScore | null | undefined,
): TournamentFixtureOfficialScore | null {
  const revision = game?.currentOfficialRevision;
  if (revision) {
    return revision.state === 'OFFICIAL' ? parseTournamentFixtureOfficialScore(revision.score) : null;
  }
  return legacyScore ?? null;
}

/**
 * 픽스처의 `game` relation 하나를 받아 "결과 존재 여부"에 대응하는 판정 + 스코어/골
 * 조립을 한 번에 한다. `currentOfficialRevisionId`는 OFFICIAL로 전환될 때만 세팅되지만
 * VOID(결과 무효화) 이후에는 VOID 리비전을 가리키도록 다시 옮겨간다
 * (tournament-result-review.service.ts voidResult 참고) — `revision`이 존재하는 것
 * 자체가 "새 경로가 이 픽스처에 대해 명시적 답을 갖고 있다"는 뜻이므로, 그 답이
 * OFFICIAL이 아니면(VOID 등) 레거시로 폴백하지 않고 곧장 null(결과 없음)을 반환한다.
 *
 * R3 §4-3단계로 신규 경로가 기본이 됐지만, R3 §4-4단계(레거시 조인 제거)까지는 `revision`
 * 자체가 없을 때(예: `game` 자체가 아직 없거나 백필이 안 된 픽스처) `legacyResult`로
 * 폴백한다. 새 경로에 답이 있으면(OFFICIAL이든 VOID든) 무조건 새 경로가 이긴다 — 폴백은
 * "새 경로가 비어 있을 때"만이고, 새 경로 값이 이상해도(예: score 파싱 실패, 또는 VOID로
 * 무효화됨) 레거시로 덮어쓰지 않는다(조용한 데이터 오염 방지,
 * docs/ops/legacy-game-result-r3-removal-inventory.md §3/§4 참고).
 */
export function resolveTournamentFixtureOfficialResult(
  game: TournamentFixtureGameForResult,
  legacyResult?: TournamentFixtureLegacyResult,
): TournamentFixtureOfficialResult | null {
  const revision = game?.currentOfficialRevision;
  if (game && revision) {
    if (revision.state !== 'OFFICIAL') return null;
    const score = parseTournamentFixtureOfficialScore(revision.score);
    if (!score) return null;
    const sideKeyById = new Map(game.sides.map((side) => [side.id, side.sideKey] as const));
    const participantNameById = new Map(
      game.participants.map((participant) => [participant.id, participant.displayNameSnapshot] as const),
    );
    const participantSideIdById = new Map(
      game.participants.flatMap((participant) =>
        participant.sideId === undefined ? [] : [[participant.id, participant.sideId] as const],
      ),
    );
    const participantUserIdById = new Map(
      game.participants.map((participant) => [participant.id, participant.userId ?? null] as const),
    );
    const outcomeReason = (revision.outcomeReason ?? 'NORMAL') as 'NORMAL' | 'FORFEIT' | 'ABANDONED';
    const revisionGoals = parseTournamentFixtureRevisionGoals(revision.goalEvents);
    const goals =
      revisionGoals === null
        ? deriveTournamentFixtureOfficialGoals(
            game.events,
            sideKeyById,
            participantNameById,
            participantSideIdById,
            participantUserIdById,
          )
        : revisionGoals.map((event) => ({
            id: event.id,
            team:
              sideKeyById.get(
                resolveGoalDisplaySideId(
                  event.sideId,
                  event.participantId,
                  event.ownGoal,
                  participantSideIdById,
                ),
              ) === 'HOME'
                ? ('home' as const)
                : ('away' as const),
            playerId: event.participantId,
            playerName:
              event.participantId === null
                ? '선수 정보 없음'
                : (participantNameById.get(event.participantId) ?? '선수 정보 없음'),
            playerUserId: event.participantId === null ? null : (participantUserIdById.get(event.participantId) ?? null),
            minute: event.minute,
            ...(event.ownGoal ? { ownGoal: true } : {}),
          }));
    return {
      revisionId: revision.id,
      score,
      note: null,
      outcomeReason,
      officialAt: revision.officialAt,
      createdAt: revision.createdAt,
      updatedAt: revision.updatedAt,
      goals,
    };
  }
  return resolveLegacyTournamentFixtureOfficialResult(legacyResult);
}

function resolveLegacyTournamentFixtureOfficialResult(
  legacyResult: TournamentFixtureLegacyResult | undefined,
): TournamentFixtureOfficialResult | null {
  if (!legacyResult) return null;
  return {
    revisionId: legacyResult.id,
    score: {
      homeScore: legacyResult.homeScore,
      awayScore: legacyResult.awayScore,
      hasPenalty: legacyResult.hasPenalty,
      homePenaltyScore: legacyResult.homePenaltyScore,
      awayPenaltyScore: legacyResult.awayPenaltyScore,
    },
    note: legacyResult.note,
    // 레거시 결과 행은 outcomeReason 개념(V1GameOutcomeReason) 이전 데이터라 항상
    // 정상 종료로 취급한다 — 몰수/중단 개념 자체가 신규 경로(V1GameResultRevision)에서
    // 도입됐다.
    outcomeReason: 'NORMAL',
    officialAt: legacyResult.recordedAt,
    createdAt: legacyResult.createdAt,
    updatedAt: legacyResult.updatedAt,
    goals: legacyResult.goals.map((goal) => ({
      id: goal.id,
      team: goal.team,
      playerId: goal.playerId,
      // 레거시 `V1TournamentPlayer.id`(playerId)는 대회 등록 로스터 단위라 신규 경로의
      // 경기-scoped participant id보다는 안정적이지만, 그래도 userId(전역 계정 신원)는
      // 아니다 — 레거시 폴백에서는 항상 null.
      playerUserId: null,
      playerName: goal.playerName,
      minute: goal.minute,
    })),
  };
}

/**
 * `resolveTournamentFixtureOfficialResult`가 OFFICIAL 결과 유무만 판정할 때 쓰는 얕은
 * 버전. `revision` 자체가 없을 때만 레거시 결과 행 존재 여부로 폴백한다 — 팀 변경/삭제
 * 가드(tournament-bracket.service.ts updateFixture/deleteFixture)가 이 함수를 쓴다:
 * 레거시 결과만 있는 픽스처의 팀을 바꿀 수 있게 되면 안 되므로, 가드도 반드시 이 폴백을
 * 반영해야 한다. `revision`이 있지만 OFFICIAL이 아니면(VOID) "결과 없음"과 동일하게
 * false — 레거시 유무와 무관하다(위 resolveTournamentFixtureOfficialResult와 동일 기준).
 * R3 §4-4단계에서 두 번째 인자와 함께 제거된다.
 */
export function hasTournamentFixtureOfficialResult(
  game: { currentOfficialRevision: { state: string } | null } | null | undefined,
  legacyResult?: { id: string } | null,
): boolean {
  const revision = game?.currentOfficialRevision;
  if (revision) return revision.state === 'OFFICIAL';
  return Boolean(legacyResult);
}

/**
 * 스코어·골 없이 "언제 결과가 확정됐는지"만 필요한 소비처(reviews)가 쓰는 얕은 버전. 새
 * 경로 OFFICIAL 리비전의 `officialAt` 우선, `revision` 자체가 없으면 레거시
 * `result.recordedAt`으로 폴백한다. `revision`이 있지만 OFFICIAL이 아니면(VOID) null —
 * 레거시로 폴백하지 않는다. 우선순위 판정 기준은 `resolveTournamentFixtureOfficialResult()`/
 * `hasTournamentFixtureOfficialResult()`와 반드시 동일하게 유지한다 — 세 함수가 서로
 * 다른 기준으로 판정하면 리뷰 게이트가 스코어보드/가드와 어긋난다. R3 §4-4단계에서
 * 두 번째 인자와 함께 제거된다.
 */
export function resolveTournamentFixtureOfficialTimestamp(
  game: { currentOfficialRevision: { state: string; officialAt: Date | null } | null } | null | undefined,
  legacyRecordedAt: Date | null | undefined,
): Date | null {
  const revision = game?.currentOfficialRevision;
  if (revision) return revision.state === 'OFFICIAL' ? revision.officialAt : null;
  return legacyRecordedAt ?? null;
}

/**
 * V1GameEvent를 GOAL/reversesEventId만 좁혀 읽을 때 쓰는 Prisma where/select 모양 --
 * `where: { OR: [{ type: 'GOAL' }, { reversesEventId: { not: null } }] },
 * select: { id, type, sideId, participantId, clockMs, reversesEventId, payload }`.
 * `payload`는 골 이벤트 백필의 `minuteKnown: false` 표식을 읽기 위한 것으로,
 * 빠뜨리면 "분을 모르는 골"이 조용히 `0분`으로 표시된다.
 * Prisma의 `WhereInput`은 배열 필드(`OR`)가 mutable(`T[]`)이라 `as const`로 얼린 공용
 * 상수를 만들면 readonly 튜플이 되어 대입 자리마다 타입 에러가 난다 -- 그래서 상수로
 * 추출하지 않고, 이 모양 그대로 각 호출부(tournament-bracket.service.ts의 getBracket,
 * tournaments-read.query.ts의 TOURNAMENT_DETAIL_INCLUDE)에 인라인한다. 두 곳 모두
 * `deriveTournamentFixtureOfficialGoals()`가 기대하는 `TournamentFixtureGoalEventRow`
 * 필드 집합과 정확히 일치해야 한다.
 */
