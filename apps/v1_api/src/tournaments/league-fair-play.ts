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
