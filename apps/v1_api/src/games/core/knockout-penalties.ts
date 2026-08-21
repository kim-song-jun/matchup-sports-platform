import { ConflictException } from '@nestjs/common';
import type { GameScore } from '../games.types';

/*
 * 이 파일만 `games/core` 안에서 `@nestjs/common`을 import한다. 다른 core 파일들은
 * `GameContractError`를 던지지만 여기서는 의도적으로 **plain `ConflictException`**을
 * 쓴다: `game-contract.ts`의 에러 코드 union은 닫혀 있고, `GameContractError` →
 * HTTP 변환이 호출부별 로컬 try/catch로 흩어져 있어서
 * (`toGameHttpException` 호출 지점마다 따로) 새 코드를 그 union에 넣으면 변환을
 * 빠뜨린 레인에서 500이 나갈 위험이 생긴다. 이 가드가 옮겨 온 세 예외는 원래부터
 * `ConflictException`(409)이었고, 문구·상태코드를 바이트 단위로 보존하는 것이
 * 이 리팩터의 제약이다.
 *
 * 같은 이유로 `games/core/index.ts` 배럴에는 **넣지 않는다** — 넣으면 배럴을
 * import하는 모든 기존 consumer가 조용히 Nest 의존성을 얻는다. 필요한 레인이
 * 이 경로를 직접 import한다.
 */

/**
 * 승부차기 가드가 한 픽스처에 대해 필요로 하는 사실 전부. DB 접근은
 * `src/tournaments/knockout-fixture.ts`의 read 함수들이 담당하고, 여기 두
 * 순수 함수는 그 결과만 받는다 — 그래야 판정 규칙을 DB 없이 단위 검증할 수
 * 있고, 같은 규칙을 서로 다른 트랜잭션 레인(정본 `end`/복구/정정/재제출)에서
 * 복제 없이 재사용할 수 있다.
 *
 * 두 사실이 따로 필요한 이유는 서로 다른 것을 뜻하기 때문이다:
 *  - `isKnockoutFixture` — 조별리그가 아닌 phase인가. "승부차기를 기록해도
 *    되는가"의 기준이다(조별리그 무승부는 정상 결과이므로 승부차기를 받으면
 *    `calculateCompetitionStandings`가 승패로 읽을 여지가 생긴다).
 *  - `hasAdvancementEdges` — 이 픽스처에서 다음 라운드로 가는 진출 엣지가
 *    있는가. "무승부로 확정하면 브래킷이 멈추는가"의 기준이다.
 *    `GameResultBracketProjectionService`는 phase를 **아예 보지 않고** 엣지만
 *    본다(`edges.length === 0`이면 그대로 return).
 */
export type KnockoutFixtureFacts = {
  readonly isKnockoutFixture: boolean;
  readonly hasAdvancementEdges: boolean;
};

/**
 * 승부차기 한 건의 저장 형태. `GameScore['penalties']`에서 **파생**시켜서, 키가 하나
 * 늘 때(선축이 그랬다) 이 모듈의 시그니처들이 자동으로 따라오게 한다 — 같은 모양을
 * 여러 곳에 손으로 적어 두면 새 키가 조용히 중간 레인에서 떨어진다.
 */
export type StoredPenalties = NonNullable<GameScore['penalties']>;

/**
 * 승부차기 점수를 받아도 되는 상황인지 검증하고, 통과하면 그 점수를 실은
 * `GameScore`를 돌려준다. 두 조건은 여기서만 강제된다(비동기 브래킷
 * 프로젝션은 이미 저장된 리비전만 보므로 잘못된 입력을 저장 **전에** 거부할
 * 수 없다):
 *  - 결선 phase 픽스처여야 한다(`V1TournamentGroup.phase !== 'group'` —
 *    phase 컬럼이며 `V1TournamentFixture.round`가 아니다. `round`는 한글/영문이
 *    섞인 표시용 라벨이라 판별 기준으로 쓰면 함정이다.
 *    `readIsKnockoutFixture` 참조). 조별리그 무승부는 무승부로 남아야 한다 —
 *    거기에 "승부차기 승자"를 기록하면 무엇이든 `score.penalties`를 순위
 *    계산에 쓰는 순간 `calculateCompetitionStandings`가 오염된다.
 *  - 정규시간이 실제로 동점이어야 한다. 이미 승자가 난 결과에 붙은 승부차기
 *    점수는 의미가 없고(현실 축구도 90분에 승자가 나면 승부차기를 하지
 *    않는다) `score.penalties`에 영구히 읽히지 않는 죽은 상태로 남는다 —
 *    이 레포의 기술부채 0 규칙이 받아들이지 말라고 하는 바로 그 상태다.
 *
 * 두 `TOURNAMENT_PENALTY_NOT_ALLOWED` 분기의 **문구는 서로 다르다**. 운영자가
 * "조별리그라서 안 됨"과 "이미 승자가 나서 안 됨" 중 무엇을 고쳐야 하는지
 * 알아야 하므로 한 문구로 합치지 않는다.
 *
 * 진출 엣지(`facts.hasAdvancementEdges`)는 이 술어에 **넣지 않는다.** 넣으면
 * `isKnockoutFixture`가 false인 두 상황 — (a) 진짜 조별리그(`phase === 'group'`)
 * 와 (b) `groupId`가 없어 보수적으로 false가 된 픽스처 — 가 한 boolean으로
 * 뭉쳐 있는 탓에 (a)에서도 승부차기가 새로 허용되고, 그러면 위 순위 계약이
 * 깨진다. 엣지를 근거로 쓰는 확장은 `assertBracketResolvable` 쪽에만 있다.
 *
 * **알려진 한계(의도적으로 남긴다).** 그래서 `!isKnockoutFixture &&
 * hasAdvancementEdges`인 픽스처는 무승부도(아래 `assertBracketResolvable`),
 * 승부차기도(여기) 거부된다 — 어떤 입력도 받지 않는 상태다. 이는 입력 오류가
 * 아니라 **대진 설정 오류**(진출 엣지가 걸린 픽스처가 조에 배정되지 않았거나
 * 조별 phase에 있다)이므로, `assertBracketResolvable`이 그 경우에만 설정을
 * 지목하는 별도 문구를 돌려준다 — 불가능한 입력을 지시하지 않기 위해서다.
 * 이 조합을 입력으로 풀려면 (a)/(b)를 구분하는 세 번째 사실이 필요하고, 그건
 * `end` 레인의 기존 거부 동작(groupless + 엣지 없음 → NOT_ALLOWED)까지
 * 건드리는 별도 변경이다. 오늘 이 조합은 프로덕션에서 도달 불가하다:
 * `v1_tournament_fixture_advancement_edges`에 행을 만드는 쓰기 경로가
 * 코드베이스에 없다(테스트와 직접 INSERT뿐).
 *
 * 검증과 폴딩(`{ ...score, penalties }`)을 한 함수에 둔 것은 의도적이다 —
 * 이렇게 하면 "가드를 통과하지 않고 penalties를 score에 붙이는" 호출 경로가
 * 애초에 만들어질 수 없다.
 */
export function assertPenaltiesNotAllowed(
  score: GameScore,
  penalties: StoredPenalties,
  facts: KnockoutFixtureFacts,
): GameScore {
  if (!facts.isKnockoutFixture) {
    throw new ConflictException({
      code: 'TOURNAMENT_PENALTY_NOT_ALLOWED',
      message: 'Penalty shootouts can only be recorded for knockout-phase fixtures',
    });
  }
  if (score.home !== score.away) {
    throw new ConflictException({
      code: 'TOURNAMENT_PENALTY_NOT_ALLOWED',
      message: 'Penalty shootouts are only recorded when regulation time ends level',
    });
  }
  return { ...score, penalties };
}

/**
 * 이 입력에 대해 픽스처 사실(`KnockoutFixtureFacts`)을 **읽을 필요가 있는가.**
 *
 * `penalties`가 없고 정규시간에 승자가 났으면 아래 두 가드는 어떤 fact 값에도
 * 관계없이 통과한다(`assertBracketResolvable`은 `score.home !== score.away`에서
 * 즉시 return하고, `assertPenaltiesNotAllowed`는 penalties가 있을 때만 불린다).
 * 즉 그 경우 사실 조회는 결과를 바꾸지 않는 순수 비용이다.
 *
 * 이 술어가 별도로 존재하는 이유: 가드들은 게임 행을 `FOR UPDATE`로 잠근
 * 트랜잭션 안에서 호출되므로 질의 왕복이 곧 잠금 보유 시간이고, 리팩터 전
 * `end` 레인은 `score.home === score.away &&` 단축 평가로 **이 경우 질의를 아예
 * 하지 않았다.** 그 동작을 보존하면서도 판정 규칙을 호출부에 복제하지 않으려면
 * 술어가 이 모듈에 있어야 한다.
 */
export function needsKnockoutFixtureFacts(
  score: GameScore,
  penalties: StoredPenalties | undefined,
): boolean {
  return penalties !== undefined || score.home === score.away;
}

/**
 * 무승부가 그대로 확정되면 브래킷이 멈추는(= 승자를 반드시 만들어야 하는)
 * 픽스처인가. `assertBracketResolvable`의 술어이면서, 정정 레인이 "base의
 * 승부차기를 승계해야 하는가"를 판단할 때 쓰는 **같은** 술어다 —
 * 조별리그처럼 무승부가 정상인 픽스처에 승부차기를 승계하면
 * `assertPenaltiesNotAllowed`가 그 정정을 거부해 버리므로, 두 판단이 갈리면
 * 정상 흐름이 막힌다. 그래서 술어를 복제하지 않고 이 함수 하나만 쓴다.
 */
export function requiresDecisiveResult(facts: KnockoutFixtureFacts): boolean {
  return facts.isKnockoutFixture || facts.hasAdvancementEdges;
}

/**
 * 이 결과로 브래킷이 승자를 판정할 수 있는지 검증한다. 판정 불가능한 결과를
 * 커맨드 자리에서 거부하는 것이 이 함수의 존재 이유다.
 *
 * 역방향 가드(운영 콘솔 종료 흐름 개편): **결선 무승부인데 승부차기가 없는**
 * 결과도 여기서 막는다. 예전엔 그대로 통과시켜 리비전이 SUBMITTED로 저장됐고,
 * 그 뒤 비동기 브래킷 프로젝션이 `resolveWinnerSide`에서
 * `BRACKET_RESULT_DRAW_UNSUPPORTED`를 던져 6회 재시도 끝에 outbox 잡이 조용히
 * POISONED로 남았다 — 운영자는 "경기 종료 성공"만 보고 다음 라운드 대진이
 * 영영 비어 있는 것을 나중에야 알게 된다. 실패를 비동기 잡이 아니라 커맨드
 * 자리에서 돌려주면 운영자가 그 자리에서 승부차기를 입력해 복구할 수 있다.
 * (조별리그 무승부는 정상 결과이므로 knockout일 때만 막는다.)
 *
 * 이 가드는 `resultRecoveryDeriveAndSubmit`(이미 ENDED인데 리비전이 0건인
 * 게임을 복구하는 경로)에도 그대로 적용된다 — 일부러 분기하지 않았다. 그
 * 경로로 무승부 결선 리비전을 만들면 똑같이 브래킷이 POISONED가 되므로,
 * "조용히 만들어 두기"보다 거부하는 쪽이 맞다. 대신 그 경로에도 빠져나갈 문을
 * 열어 둔다: `GameResultRecoveryDto.penalties`로 `end`와 같은 형태의 승부차기
 * 점수를 실을 수 있다. 이 문이 없으면 결선 무승부 레거시 게임(GOAL 이벤트가
 * 없어 0-0으로 산출되는 백필 이전 데이터 포함)은 복구가 영구히 막힌다 — 결과
 * 교정 흐름은 리비전이 1건 이상이어야 시작할 수 있어 대안이 되지 못한다.
 * 그래서 메시지도 특정 커맨드를 지목하지 않는다.
 *
 * ## 술어가 `isKnockoutFixture ∨ hasAdvancementEdges`인 이유
 *
 * POISONED의 실제 조건은 knockout phase가 아니라 **진출 엣지**다
 * (`GameResultBracketProjectionService.project`는
 * `tournamentFixtureId === null`이나 `edges.length === 0`이면 그냥 return하고,
 * 그 뒤 `resolveWinnerSide`가 승자를 못 찾으면 throw한다). 두 기준은 양방향으로
 * 어긋난다:
 *  - 결선이지만 outgoing 엣지가 없는 픽스처(결승·3/4위전)는 무승부여도
 *    POISONED가 되지 않는다. 그런데 기존 `end` 동작은 여기서도 무승부를
 *    거부해 왔다 — 그 정책을 그대로 보존해야 하므로 `isKnockoutFixture` 항이
 *    필요하다.
 *  - `groupId`가 없어 `readIsKnockoutFixture`가 보수적으로 false를 주는
 *    픽스처인데 엣지는 걸려 있는 경우는 현행 코드가 무승부를 통과시키고 그
 *    결과가 정확히 POISONED다 — 그래서 `hasAdvancementEdges` 항이 필요하다
 *    (이 조합만이 이 가드의 의도된 확장이다).
 *
 * 승부차기 점수가 **동점**인 경우도 승자가 없으므로 여기서 막는다. 이 분기에
 * 도달하는 경로는 정정/재제출 레인의 **승계**다: 그 레인의 폼은 평평한
 * `{home, away}`만 보내므로 서버가 base 리비전에 저장된 승부차기를
 * `readStoredPenalties`로 읽어 승계하는데, 그 저장값이 동점이면(레거시 데이터)
 * 승자가 없다. `end` 레인에서는 `extractEndPenalties`가 422
 * `TOURNAMENT_PENALTY_INVALID`로 먼저 걸러 도달하지 않는다.
 *
 * 문구는 두 갈래다. `isKnockoutFixture`인 경우에만 `applyPenalties`의 원문을
 * 바이트 동일하게 쓴다("승부차기 결과를 입력해주세요") — 그 경우엔 실제로
 * 승부차기를 실으면 통과하므로 지시가 실행 가능하다. 엣지만으로 걸린 경우는
 * `assertPenaltiesNotAllowed`가 승부차기를 거부하므로 같은 지시를 하면
 * **불가능한 행동을 지시하는 것**이 된다 — 그 경우엔 원인인 대진 설정을 지목한다
 * (그 조합의 무승부는 이 변경 전에는 아무 예외도 던지지 않았으므로 보존해야 할
 * 기존 문구가 없다).
 */
export function assertBracketResolvable(score: GameScore, facts: KnockoutFixtureFacts): void {
  if (score.home !== score.away) {
    return;
  }
  if (score.penalties !== undefined && score.penalties.home !== score.penalties.away) {
    return;
  }
  if (!requiresDecisiveResult(facts)) {
    return;
  }
  if (facts.isKnockoutFixture) {
    throw new ConflictException({
      code: 'TOURNAMENT_PENALTY_REQUIRED',
      message: '결선 경기는 무승부로 끝낼 수 없어요. 승부차기 결과를 입력해주세요.',
    });
  }
  if (facts.hasAdvancementEdges) {
    throw new ConflictException({
      code: 'TOURNAMENT_PENALTY_REQUIRED',
      message:
        '이 경기 결과로 다음 라운드 진출 팀이 정해지는데 무승부여서 확정할 수 없어요. 대회 대진 설정(조 배정·라운드)을 확인해주세요.',
    });
  }
}

/**
 * 이미 저장된 리비전 `score`에서 승부차기 점수를 **관용적으로** 읽는다. 정정·
 * 재제출 폼은 평평한 `{home, away}`만 보내므로(`result-edit-modal.tsx`의
 * `onConfirm`, 그리고 `V1GameResultScoreInput` 타입 자체에 penalties 필드가
 * 없다) 서버가 base 리비전의 값을 승계해야 한다 — 승계하지 않으면 승부차기로
 * 결정된 결선 경기는 **어떤 정정도** `TOURNAMENT_PENALTY_REQUIRED`로 거부되고,
 * 폼에 승부차기 입력란이 없으므로 그 지시를 만족시킬 방법이 아예 없다(정정이
 * 필요한 바로 그 화면이 영구히 막힌다).
 *
 * `extractEndPenalties`(422를 던지는 입력 검증)와 달리 **throw하지 않는다.**
 * 여기 들어오는 값은 사용자 입력이 아니라 **이미 DB에 있는 값**이라, 형태가
 * 깨져 있다고 해서 운영자의 정정 요청을 422로 되돌리는 것은 원인을 오도한다.
 * 읽을 수 없으면 "승계할 승부차기 없음"으로 처리하고, 그 결과가 해결 불가한
 * 무승부라면 `assertBracketResolvable`이 판정한다.
 *
 * 동점(`home === away`)은 **걸러내지 않고 그대로 돌려준다.** 그래야 저장값이
 * 동점인 레거시 리비전이 `assertBracketResolvable`의 동점 분기에 도달해
 * "브래킷을 해결할 수 없다"는 정확한 이유로 거부된다 — 여기서 undefined로
 * 뭉개면 "승부차기가 없다"는 다른 이유로 거부되어 원인이 흐려진다.
 *
 * 중첩 백필 형태(`{ regulation: {...} }`)는 보지 않는다:
 * `parse-official-score.ts`의 docblock대로 `penalties`는 평평한 프로듀서만
 * 쓴다(`GamesService.deriveTournamentRevision`, 이 서비스).
 */
export function readStoredPenalties(storedScore: unknown): StoredPenalties | undefined {
  if (typeof storedScore !== 'object' || storedScore === null || Array.isArray(storedScore)) {
    return undefined;
  }
  const raw = (storedScore as { penalties?: unknown }).penalties;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const { home, away } = raw as { home?: unknown; away?: unknown };
  if (
    typeof home !== 'number' ||
    !Number.isInteger(home) ||
    home < 0 ||
    typeof away !== 'number' ||
    !Number.isInteger(away) ||
    away < 0
  ) {
    return undefined;
  }
  // 선축도 함께 승계한다 — 빠뜨리면 **정정 한 번에 "누가 먼저 찼는지"가 영구히
  // 사라진다**(정정 폼에는 선축 입력란이 없으므로 되살릴 수단도 없다).
  //
  // 점수와 달리 선축은 없어도 승계를 막지 않는다: 이 필드가 생기기 전 리비전에는
  // 아예 없고, 저장 컬럼은 느슨한 JSON 이라 'HOME'/'AWAY'가 아닌 값이 들어 있을 수도
  // 있다. 그 경우 승부차기 점수까지 버리면 결선 정정이 통째로 막히므로 선축만
  // 떨어뜨린다.
  const firstKickSideKey = (raw as { firstKickSideKey?: unknown }).firstKickSideKey;
  const side: { firstKickSideKey?: 'HOME' | 'AWAY' } =
    firstKickSideKey === 'HOME' || firstKickSideKey === 'AWAY' ? { firstKickSideKey } : {};

  // 킥 수도 선축과 **같은 이유로** 승계한다: 정정 폼에는 승부차기 입력란이 아예 없어
  // (2026-08-18 실측, 폼 필드 186개 중 승부차기 필드 0개) 여기서 떨어뜨리면 되살릴
  // 수단이 없다. 둘은 항상 함께 있거나 함께 없다 — 한쪽만 살리면 어느 팀이 몇 번
  // 찼는지 모르는 채로 "킥 수를 안다"고 착각한 판정이 돌아간다.
  const rawTakenHome = (raw as { takenHome?: unknown }).takenHome;
  const rawTakenAway = (raw as { takenAway?: unknown }).takenAway;
  const countsValid =
    typeof rawTakenHome === 'number' &&
    Number.isInteger(rawTakenHome) &&
    rawTakenHome >= 0 &&
    typeof rawTakenAway === 'number' &&
    Number.isInteger(rawTakenAway) &&
    rawTakenAway >= 0 &&
    home <= rawTakenHome &&
    away <= rawTakenAway;
  const counts = countsValid ? { takenHome: rawTakenHome, takenAway: rawTakenAway } : {};

  // 우회 표식은 **감사 기록**이라 정정을 건너뛰어도 살아남아야 한다. 정정 폼은 승부차기를
  // 바꾸지 못하므로(입력란 없음) "규칙과 다른 결론으로 닫았다"는 사실은 그대로 유효하다.
  // 여기서 떨어뜨리면 정정 한 번에 우회와 정상 종료가 기록상 구분되지 않게 된다.
  const override =
    (raw as { operatorOverride?: unknown }).operatorOverride === true
      ? { operatorOverride: true as const }
      : {};

  return { home, away, ...side, ...counts, ...override };
}
