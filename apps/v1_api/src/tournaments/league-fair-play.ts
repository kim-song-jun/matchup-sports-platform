/**
 * 페어플레이 벌점 — **낮을수록 상위**다.
 * `calculateCompetitionStandings`의 tie-break 5단계가 오름차순으로 비교한다.
 */
export interface FairPlayCards {
  yellow: number;
  /** 경고 누적 퇴장 */
  secondYellowRed: number;
  /** 직접 퇴장 */
  directRed: number;
}

const YELLOW_POINTS = 1;
const SECOND_YELLOW_RED_POINTS = 3;
const DIRECT_RED_POINTS = 4;

export function fairPlayPointsOf(cards: FairPlayCards): number {
  return (
    cards.yellow * YELLOW_POINTS +
    cards.secondYellowRed * SECOND_YELLOW_RED_POINTS +
    cards.directRed * DIRECT_RED_POINTS
  );
}

/**
 * `V1GameResultParticipant.cards`(Json)를 `FairPlayCards`로 변환한다.
 *
 * **데이터 모델 제약(추측 아님 — games.service.ts의 CARD 이벤트 집계 확인 결과)**:
 * 저장된 실제 구조는 `{ yellow: number, red: number }` 뿐이다 — "경고 누적 퇴장
 * (2번째 옐로)"과 "직접 퇴장"을 구분하는 필드가 데이터 모델 자체에 없다
 * (games.service.ts의 `V1GameEventType.CARD` 집계는 `payload.card`가 `'RED'`인지
 * 아닌지만 보고 `cards.red`/`cards.yellow`를 늘린다. 심판이 두 번째 옐로를 별도
 * RED 이벤트로 이어 기록하지 않는 한 "경고 누적 퇴장"은 애초에 red로 기록되지도
 * 않는다). 그래서 `red`는 전부 `directRed`(4점)로 계산하고 `secondYellowRed`는
 * 항상 0이다 — 실제로 경고 누적 퇴장이었던 건이 섞여 있으면 팀당 최대 1점씩
 * 과대산정될 수 있지만, 조용히 0점 처리하는 것보다는 이 근사가 tie-break 취지에
 * 더 가깝다(카드가 있는데 페어플레이 벌점이 0인 것이 원래 버그였다).
 */
export function parseFairPlayCards(value: unknown): FairPlayCards {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { yellow?: unknown }).yellow === 'number' &&
    typeof (value as { red?: unknown }).red === 'number'
  ) {
    const record = value as { yellow: number; red: number };
    return { yellow: record.yellow, secondYellowRed: 0, directRed: record.red };
  }
  return { yellow: 0, secondYellowRed: 0, directRed: 0 };
}
