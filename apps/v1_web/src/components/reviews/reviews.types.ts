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
  /** 누구에게 쓴 리뷰인지(팀명 또는 닉네임). 대상이 없으면 null. */
  targetLabel: string | null;
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

export type ReviewTargetDraft = {
  rating: number;
  tagCodes: string[];
};

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
