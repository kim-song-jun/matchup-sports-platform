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
 * 한 경기·한 선수의 `{ yellow, red }`를 경고·경고 누적 퇴장·직접 퇴장으로 나눈다. 출전정지(`card-suspension.ts`)와
 * 페어플레이가 같이 쓴다.
 *
 * 저장 모양은 `{ yellow, red }` 뿐이라 "이 레드가 두 번째 옐로 때문"이라는 표시가 없다. 운영 콘솔은 두 번째 옐로를
 * 기록하면 레드도 따로 한 장 더 기록한다(MD-QA #81). 옐로 2장을 받은 선수는 그 경기에서 직접 레드를 또 받을 수
 * 없으므로, 레드 한 장마다 옐로 2장을 "레드로 바뀐 경고"로 본다(MD-QA #174). 옐로 1장 뒤 직접 레드는 둘 다 남는다.
 */
export function classifyGameCards(cards: { yellow: number; red: number }): FairPlayCards {
  const secondYellowRed = Math.max(0, Math.min(cards.red, Math.floor(cards.yellow / 2)));
  return {
    yellow: cards.yellow - secondYellowRed * 2,
    secondYellowRed,
    directRed: cards.red - secondYellowRed,
  };
}

/**
 * `V1GameResultParticipant.cards`(Json)를 `FairPlayCards`로 변환한다. 모양이 다르면 0으로 본다.
 * 퇴장 구분은 `classifyGameCards` 규칙을 따른다.
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
    return classifyGameCards(record);
  }
  return { yellow: 0, secondYellowRed: 0, directRed: 0 };
}
