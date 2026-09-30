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
  /** null = 아직 별을 고르지 않음. 기본 점수가 없어서 눌러야만 값이 생긴다. */
  rating: number | null;
  tagCodes: string[];
  /** 사람 대상에서 사용자가 직접 바꾼 세부 항목만. 없는 항목은 제출할 때 종합 별점을 따른다. */
  metricOverrides?: Partial<ReviewMetricDraft>;
};

export const REVIEW_METRIC_FIELDS = [
  { key: 'skill', label: '실력' },
  { key: 'manner', label: '매너' },
  { key: 'punctuality', label: '시간약속' },
  { key: 'safety', label: '안전' },
] as const;

export type ReviewSourcePageModel = V1ReviewSourceResponse & {
  sourceMeta: string;
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
