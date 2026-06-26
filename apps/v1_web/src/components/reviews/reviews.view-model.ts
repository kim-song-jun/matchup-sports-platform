import type { ReviewsPageModel, ReviewsReceivedPageModel, ReviewsTab, ReviewSourcePageModel, ReviewTargetViewModel } from './reviews.types';
import type { V1ReviewDetail, V1ReviewListResponse, V1ReviewReceivedResponse, V1ReviewSourceResponse, V1ReviewSourceType, V1ReviewTarget } from '@/types/api';

export const REVIEW_TAG_OPTIONS = [
  { code: 'manner', label: '매너가 좋아요' },
  { code: 'teamwork', label: '팀워크가 좋아요' },
  { code: 'play_again', label: '또 같이 운동하고 싶어요' },
  { code: 'punctual', label: '시간 약속을 잘 지켜요' },
  { code: 'communication', label: '소통이 원활해요' },
  { code: 'considerate', label: '배려심이 있어요' },
];

export function toReviewsPageModel(data: V1ReviewListResponse | undefined, tab: ReviewsTab): ReviewsPageModel {
  const items = data?.items ?? [];
  const targetCount = items.reduce((sum, item) => sum + item.targetCount, 0);
  const reviewedCount = items.reduce((sum, item) => sum + item.reviewedCount, 0);
  const remainingCount = items.reduce((sum, item) => sum + item.remainingCount, 0);

  return {
    tab,
    stats: tab === 'pending'
      ? [
          { label: '경기', value: `${items.length}건` },
          { label: '대상', value: `${targetCount}명` },
          { label: '남은 리뷰', value: `${remainingCount}명` },
        ]
      : [
          { label: '작성 완료', value: `${reviewedCount || items.length}명` },
          { label: '기록', value: `${items.length}건` },
          { label: '진행', value: remainingCount > 0 ? `${remainingCount}명` : '완료' },
        ],
    cards: items.map((item) => ({
      ...item,
      href: `/my/reviews/${item.sourceType}/${item.sourceId}`,
      badgeLabel: item.state === 'done' ? '완료' : isTeamReviewSource(item.sourceType) ? '상대팀' : '작성 전',
      kindLabel: sourceTypeLabel(item.sourceType),
      meta: buildListMeta(item.completedAt, item.reviewedCount, item.targetCount, item.remainingCount),
      ctaLabel: item.state === 'done' ? '보기' : item.reviewedCount > 0 ? '이어서 작성' : '리뷰',
    })),
    emptyTitle: tab === 'pending' ? '작성할 리뷰가 없어요' : '작성된 리뷰가 없어요',
    emptySub: tab === 'pending' ? '종료된 경기에 리뷰할 상대가 생기면 여기에 나타나요.' : '보낸 리뷰는 경기별로 정리돼요.',
  };
}

export function toReviewSourcePageModel(data: V1ReviewSourceResponse): ReviewSourcePageModel {
  const reviewed = data.targets.filter((target) => target.alreadySubmitted || target.review).length;
  const total = data.targets.length;
  const remaining = Math.max(0, total - reviewed);

  return {
    ...data,
    sourceMeta: formatDateTime(data.source.completedAt),
    progressLabel: `작성 ${reviewed}명 · 남은 대상 ${remaining}명`,
    progressStats: [
      { label: '대상', value: `${total}명` },
      { label: '작성 완료', value: `${reviewed}명` },
      { label: '남은 리뷰', value: `${remaining}명` },
    ],
  };
}

export function toTargetViewModel(target: V1ReviewTarget): ReviewTargetViewModel {
  return {
    ...target,
    initials: initials(target.name),
    statusLabel: target.alreadySubmitted || target.review ? '작성됨' : target.locked ? '잠김' : '대기',
  };
}

export function toReviewsReceivedPageModel(data: V1ReviewReceivedResponse | undefined): ReviewsReceivedPageModel {
  const items = data?.items ?? [];
  const userReviews = items.filter((review) => review.targetType === 'user');
  const teamReviews = items.filter((review) => review.targetType === 'team');
  const tagCount = new Set(items.flatMap((review) => review.tags.map((tag) => tag.tagCode))).size;

  return {
    stats: [
      { label: '받은 리뷰', value: `${items.length}건` },
      { label: '평균', value: averageRating(items) },
      { label: '태그', value: `${tagCount}개` },
    ],
    userGroups: groupReceivedReviews(userReviews),
    teamGroups: groupReceivedReviews(teamReviews),
  };
}

export function sourceTypeLabel(sourceType: V1ReviewSourceType) {
  switch (sourceType) {
    case 'match':
      return '개인 매치';
    case 'team_match':
      return '팀매치';
    case 'tournament_fixture':
      return '대회 경기';
  }
}

export function formatDateTime(value: string | null) {
  if (!value) return '날짜 미정';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildListMeta(completedAt: string | null, reviewedCount: number, targetCount: number, remainingCount: number) {
  if (remainingCount <= 0) return `${reviewedCount}명에게 전송 완료`;
  return `${formatDateTime(completedAt)} · ${reviewedCount}/${targetCount} 완료`;
}

function groupReceivedReviews(items: V1ReviewDetail[]) {
  const groups = new Map<string, V1ReviewDetail[]>();
  for (const review of items) {
    const key = `${review.sourceType}:${review.sourceId}`;
    groups.set(key, [...(groups.get(key) ?? []), review]);
  }

  return Array.from(groups.entries()).map(([key, reviews]) => {
    const [sourceType, sourceId] = key.split(':') as [V1ReviewSourceType, string];
    const first = reviews[0];
    return {
      sourceType,
      sourceId,
      title: sourceTypeLabel(sourceType),
      meta: `${first ? formatDateTime(first.submittedAt) : '종료 일정'} · 받은 리뷰 ${reviews.length}건`,
      average: averageRating(reviews),
      reviews,
    };
  });
}

function averageRating(reviews: V1ReviewDetail[]) {
  if (reviews.length === 0) return '-';
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return average.toFixed(average % 1 === 0 ? 0 : 1);
}

function initials(name: string) {
  return name.trim().slice(0, 2) || '리뷰';
}

function isTeamReviewSource(sourceType: V1ReviewSourceType) {
  return sourceType === 'team_match' || sourceType === 'tournament_fixture';
}
