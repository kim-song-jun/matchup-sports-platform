export const REVIEW_WINDOW_HOURS = 48;

/**
 * team_match/tournament_fixture 리뷰의 48시간 마감 판정 — 저장하지 않고 매 요청 시점에
 * 계산한다(D-6). anchor가 null이면(예: match — 완료 시각 배관 자체가 없음, 스펙 §1.2.2)
 * 마감을 판정할 근거가 없으므로 항상 false(무기한) — 이 헬퍼를 match 소스에는 호출하지 않는다.
 * 순수함수 — Date.now()를 내부에서 부르지 않는다(now는 반드시 인자로 받는다, 테스트 가능성).
 */
export function reviewWindowClosed(anchor: Date | null, now: Date): boolean {
  if (!anchor) return false;
  const elapsedMs = now.getTime() - anchor.getTime();
  return elapsedMs > REVIEW_WINDOW_HOURS * 60 * 60 * 1000;
}
