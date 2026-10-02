import type { V1ReviewHighlight } from '@/types/api';

/** "함께 뛴 팀들이 '매너가 좋아요'를 가장 많이 꼽았어요 (68%)" — the team card and the profile say it the same way. */
export function ReviewHighlightLine({ subject, highlight }: { subject: string; highlight: V1ReviewHighlight }) {
  return (
    <span className="tm-review-highlight">
      {subject} <strong className="tm-review-highlight-tag">‘{highlight.label}’</strong>를 가장 많이 꼽았어요{' '}
      <span className="tm-review-highlight-rate tab-num">({Math.round(highlight.rate * 100)}%)</span>
    </span>
  );
}
