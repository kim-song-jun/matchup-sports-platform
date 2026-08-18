/**
 * 리뷰 작성 가능 기간의 기본값(시간). 어드민이 값을 바꾸지 않았거나 설정 행이 없을 때 쓰인다.
 * 2026-08-18 이전에는 48시간 하드코딩이었고, 지금은 7일(168시간)이 기본이며
 * `/admin/settings/reviews` 에서 런타임에 바꿀 수 있다(V1ReviewPolicySettings).
 */
export const DEFAULT_REVIEW_WINDOW_HOURS = 168;

/** 설정으로 허용하는 범위 — 1시간 ~ 365일. DTO 검증과 서비스 클램프가 같은 값을 쓴다. */
export const MIN_REVIEW_WINDOW_HOURS = 1;
export const MAX_REVIEW_WINDOW_HOURS = 24 * 365;

/**
 * team_match/tournament_fixture 리뷰의 마감 판정 — 저장하지 않고 매 요청 시점에
 * 계산한다(D-6). anchor가 null이면(예: match — 완료 시각 배관 자체가 없음, 스펙 §1.2.2)
 * 마감을 판정할 근거가 없으므로 항상 false(무기한) — 이 헬퍼를 match 소스에는 호출하지 않는다.
 * 순수함수 — Date.now()도 DB도 내부에서 건드리지 않는다(now와 windowHours는 반드시 인자로 받는다).
 *
 * windowHours는 호출자가 ReviewPolicySettingsService에서 읽어 넘긴다. 매 요청 계산이라
 * 어드민이 기간을 늘리면 직전 정책으로 마감됐던 경기도 다시 열리고, 줄이면 즉시 닫힌다.
 */
export function reviewWindowClosed(
  anchor: Date | null,
  now: Date,
  windowHours: number = DEFAULT_REVIEW_WINDOW_HOURS,
): boolean {
  if (!anchor) return false;
  const elapsedMs = now.getTime() - anchor.getTime();
  return elapsedMs > windowHours * 60 * 60 * 1000;
}

/** 사용자에게 보여줄 기간 문구 — 24시간 배수면 "7일", 아니면 "36시간"처럼 쓴다. */
export function formatReviewWindow(windowHours: number): string {
  if (windowHours % 24 === 0) return `${windowHours / 24}일`;
  return `${windowHours}시간`;
}
