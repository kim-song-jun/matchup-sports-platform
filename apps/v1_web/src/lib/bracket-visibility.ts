/**
 * 대진표 공개 여부 판정 — 서버 `isBracketPublished()`(apps/v1_api/src/tournaments/
 * tournament-detail.presenter.ts)와 같은 규칙을 프론트에서도 쓰기 위한 단일 소스.
 *
 * 예약 공개는 스케줄러 없이 조회 시점에 판정하므로, 예약 시각이 지나도 DB의
 * `bracketPublishedAt` 은 null 로 남는다. 프론트가 `bracketPublishedAt` 만 보면
 * 이미 공개된 대진표를 계속 "예약됨"으로 표시하고 공개 버튼도 노출하게 된다.
 */
export function isBracketPublished(
  publishedAt: string | null | undefined,
  scheduledAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (publishedAt) return true;
  if (!scheduledAt) return false;
  const scheduled = new Date(scheduledAt).getTime();
  return Number.isFinite(scheduled) && scheduled <= now.getTime();
}
