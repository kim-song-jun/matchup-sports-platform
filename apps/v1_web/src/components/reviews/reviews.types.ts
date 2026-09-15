import type {
  V1ReceivedReviewDetail,
  V1ReviewListItem,
  V1ReviewSourceResponse,
  V1ReviewSourceType,
  V1ReviewTarget,
} from '@/types/api';

export type ReviewsTab = 'pending' | 'written' | 'received';

export type ReviewStat = {
  label: string;
  value: string;
};

export type ReviewListCardModel = V1ReviewListItem & {
  href: string;
  badgeLabel: string;
  kindLabel: string;
  meta: string;
  ctaLabel: string;
};

export type ReviewsPageModel = {
  tab: ReviewsTab;
  stats: ReviewStat[];
  cards: ReviewListCardModel[];
  emptyTitle: string;
  emptySub: string;
};

export type ReviewMetricDraft = { skill: number; manner: number; punctuality: number; safety: number };

export type ReviewTargetDraft = {
  rating: number;
  tagCodes: string[];
  /** 사람 대상에만 존재. 기본값은 종합 별점과 같게 시작해 제출 마찰을 늘리지 않는다. */
  metricScores?: ReviewMetricDraft;
};

export const REVIEW_METRIC_FIELDS = [
  { key: 'skill', label: '실력' },
  { key: 'manner', label: '매너' },
  { key: 'punctuality', label: '시간약속' },
  { key: 'safety', label: '안전' },
] as const;

export type ReviewSourcePageModel = V1ReviewSourceResponse & {
  sourceMeta: string;
  progressLabel: string;
  progressStats: ReviewStat[];
};

export type ReviewTargetViewModel = V1ReviewTarget & {
  initials: string;
  statusLabel: string;
  /** 양 팀 겸직이라 대상마다 작성자 팀이 다를 때만 채워진다. */
  reviewerTeamLabel: string | null;
  /** lockReason 을 사용자 문구로 옮긴 값. 배지와 중복되는 코드는 null 이라 표시하지 않는다. */
  lockReasonLabel: string | null;
};

export type ReceivedReviewGroup = {
  sourceType: V1ReviewSourceType;
  sourceId: string;
  title: string;
  meta: string;
  average: string;
  reviews: V1ReceivedReviewDetail[];
};

export type ReviewsReceivedPageModel = {
  stats: ReviewStat[];
  /** 제도 전/후를 나누지 않는다 — "이전 리뷰" 섹션은 2026-08-18에 제거했다. */
  userGroups: ReceivedReviewGroup[];
  teamGroups: ReceivedReviewGroup[];
};

/**
 * 아직 손대지 않은 리뷰 대상의 별점 초기값. 한때 이 값이 4로 **네 군데에 각각** 적혀
 * 있었다(초기 draft 생성 · 태그 토글 · 제출 · 렌더 fallback) — 한 곳만 고치면 화면에
 * 보이는 별과 실제로 전송되는 별이 갈린다. 값을 바꿀 일이 생기면 여기 한 곳만 고친다.
 */
export const DEFAULT_REVIEW_RATING = 5;
