import type {
  ReviewMetricDraft,
  ReviewsPageModel,
  ReviewsReceivedPageModel,
  ReviewsTab,
  ReviewSourcePageModel,
  ReviewTargetDraft,
  ReviewTargetViewModel,
} from './reviews.types';
import type { V1ReceivedReviewDetail, V1ReviewListResponse, V1ReviewReceivedResponse, V1ReviewSourceResponse, V1ReviewSourceType, V1ReviewTarget } from '@/types/api';
import { displayInitials } from '@/lib/display-initials';

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
  return { ...data, sourceMeta: formatDateTime(data.source.completedAt) };
}

type TargetIdentity = Pick<V1ReviewTarget, 'targetType' | 'targetUserId' | 'targetTeamId'>;

export function reviewTargetKey(target: TargetIdentity) {
  return target.targetType === 'team' ? `team:${target.targetTeamId ?? 'unknown'}` : `user:${target.targetUserId ?? 'unknown'}`;
}

/** 서버가 이미 받았거나 잠겨서 더는 쓸 수 없는 대상이 아닌, 지금 쓸 수 있는 대상. */
export function isReviewTargetPending(target: V1ReviewTarget) {
  return !target.locked && !target.alreadySubmitted && !target.review;
}

/** 사용자가 손댄 draft 가 없으면 서버에 저장된 후기(있다면)를 그대로 보여 준다. */
export function draftForTarget(target: V1ReviewTarget, drafts: Record<string, ReviewTargetDraft>): ReviewTargetDraft {
  return drafts[reviewTargetKey(target)] ?? {
    rating: target.review?.rating ?? null,
    tagCodes: target.review?.tags.map((tag) => tag.tagCode) ?? [],
  };
}

/** 서버 계약(별점 + 태그 1개 이상)에 비춘 입력 상태. 하나만 채운 것은 보낼 수 없는 부분 입력이다. */
export type ReviewDraftStatus = 'empty' | 'needsRating' | 'needsTags' | 'ready';

export function reviewDraftStatus(draft: Pick<ReviewTargetDraft, 'rating' | 'tagCodes'>): ReviewDraftStatus {
  const hasRating = draft.rating !== null;
  const hasTags = draft.tagCodes.length > 0;
  if (hasRating && hasTags) return 'ready';
  if (hasRating) return 'needsTags';
  return hasTags ? 'needsRating' : 'empty';
}

export type ReviewSubmission = {
  target: V1ReviewTarget;
  rating: number;
  tagCodes: string[];
  /** 사람 대상에만. 직접 바꾸지 않은 항목은 종합 별점을 따른다. */
  metricScores?: ReviewMetricDraft;
};

export type ReviewIncomplete = { target: V1ReviewTarget; missing: 'rating' | 'tags' };

export type ReviewProgress = {
  submitted: number;
  inProgress: number;
  remaining: number;
  ready: ReviewSubmission[];
  incomplete: ReviewIncomplete[];
};

/**
 * 보내기 버튼·현황 문구·제출이 모두 이 한 곳의 판정을 쓴다. 화면과 제출이 각자 계산하면
 * 화면은 "다 했다"인데 제출에서 조용히 빠지는 대상이 생긴다.
 */
export function getReviewProgress(targets: V1ReviewTarget[], drafts: Record<string, ReviewTargetDraft>): ReviewProgress {
  const progress: ReviewProgress = { submitted: 0, inProgress: 0, remaining: 0, ready: [], incomplete: [] };
  for (const target of targets) {
    if (target.alreadySubmitted || target.review) {
      progress.submitted += 1;
      continue;
    }
    if (!isReviewTargetPending(target)) continue;

    const draft = draftForTarget(target, drafts);
    const status = reviewDraftStatus(draft);
    if (status === 'empty') {
      progress.remaining += 1;
    } else if (status === 'ready' && draft.rating !== null) {
      progress.inProgress += 1;
      const overrides = draft.metricOverrides ?? {};
      progress.ready.push({
        target,
        rating: draft.rating,
        tagCodes: draft.tagCodes,
        ...(target.targetType === 'user'
          ? {
              metricScores: {
                skill: overrides.skill ?? draft.rating,
                manner: overrides.manner ?? draft.rating,
                punctuality: overrides.punctuality ?? draft.rating,
                safety: overrides.safety ?? draft.rating,
              },
            }
          : {}),
      });
    } else {
      progress.inProgress += 1;
      progress.incomplete.push({ target, missing: status === 'needsRating' ? 'rating' : 'tags' });
    }
  }
  return progress;
}

export function formatReviewProgress({ submitted, inProgress, remaining }: ReviewProgress) {
  return [submitted > 0 ? `작성 완료 ${submitted}명` : null, `작성 중 ${inProgress}명`, `남은 대상 ${remaining}명`]
    .filter(Boolean)
    .join(' · ');
}

/** 보내기 버튼 위 안내 — 덜 끝난 대상이 누구인지 이름으로 짚는다. */
export function incompleteHint(incomplete: ReviewIncomplete[]) {
  const [first] = incomplete;
  if (!first) return null;
  if (incomplete.length > 1) return `${first.target.name} 외 ${incomplete.length - 1}건의 별점·태그가 비어 있어요`;
  return first.missing === 'rating'
    ? `${first.target.name}의 별점을 골라 주세요`
    : `${first.target.name}의 태그를 하나 이상 골라 주세요`;
}

/** 작성 현황 카드의 보조 문장. */
export function incompleteNote(incomplete: ReviewIncomplete[]) {
  if (incomplete.length === 0) return null;
  const missing = new Set(incomplete.map((item) => item.missing));
  const what = missing.size > 1 ? '별점이나 태그가' : missing.has('rating') ? '별점이' : '태그가';
  return `${what} 빠진 ${incomplete.length}건은 아직 보낼 수 없어요`;
}

export function selectedTagLabels(tagCodes: string[]) {
  return REVIEW_TAG_OPTIONS.filter((tag) => tagCodes.includes(tag.code)).map((tag) => tag.label);
}

export function formatTagSummary(labels: string[]) {
  const [first] = labels;
  if (!first) return null;
  return labels.length === 1 ? first : `${first} 외 ${labels.length - 1}개`;
}

/**
 * @param showReviewerTeam 양 팀 모두의 멤버라 대상마다 작성자 팀이 달라지는 경우에만 true.
 *   그 외에는 헤더의 "OO 대표로 작성"이 이미 같은 정보를 보여주므로 카드에서는 생략한다.
 */
/**
 * `lockReason` 은 API 의 에러 코드값이라 그대로 그리면 화면에 `ALREADY_SUBMITTED` 가 노출된다.
 * 코드별로 보여줄 문구를 여기서 정하되, `null` 은 "문구를 띄우지 않는다"는 뜻이다.
 */
const LOCK_REASON_LABEL: Record<string, string | null> = {
  // 같은 카드의 '작성됨' 배지가 이미 같은 사실을 전달하므로 문구를 겹쳐 띄우지 않는다.
  ALREADY_SUBMITTED: null,
};

function lockReasonLabel(lockReason: string | null) {
  if (!lockReason) return null;
  // 아직 매핑하지 않은 코드는 삼키지 않고 그대로 보여준다 — 조용히 감추면 잠긴 이유를
  // 사용자도 우리도 알 수 없게 된다. 새 코드가 생기면 위 표에 문구를 추가하면 된다.
  return lockReason in LOCK_REASON_LABEL ? LOCK_REASON_LABEL[lockReason] : lockReason;
}

export function toTargetViewModel(target: V1ReviewTarget, showReviewerTeam = false): ReviewTargetViewModel {
  return {
    ...target,
    initials: displayInitials(target.name, { fallback: '리뷰', count: 2 }),
    statusLabel: target.alreadySubmitted || target.review ? '작성됨' : target.locked ? '잠김' : '대기',
    reviewerTeamLabel: showReviewerTeam && target.reviewerTeam ? `${target.reviewerTeam.name} 대표로 작성` : null,
    lockReasonLabel: lockReasonLabel(target.lockReason),
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
      { label: '참가자 평균', value: averageRating(items.filter((review) => review.sourceType !== 'platform_team_match')) },
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
    case 'platform_team_match':
      return '운영 평가 · 참가자 평점과 별도';
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

function groupReceivedReviews(items: V1ReceivedReviewDetail[]) {
  const groups = new Map<string, V1ReceivedReviewDetail[]>();
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
      // 어느 경기였는지를 제목으로 — 예전엔 "팀매치"처럼 종류만 나와서 맥락을 알 수 없었다.
      title: first?.source?.title ?? sourceTypeLabel(sourceType),
      meta: [
        sourceTypeLabel(sourceType),
        first?.submittedAt ? formatDateTime(first.submittedAt) : null,
        `받은 리뷰 ${reviews.length}건`,
      ].filter(Boolean).join(' · '),
      average: averageRating(reviews),
      reviews,
    };
  });
}

function averageRating(reviews: V1ReceivedReviewDetail[]) {
  if (reviews.length === 0) return '-';
  const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  return average.toFixed(average % 1 === 0 ? 0 : 1);
}

function isTeamReviewSource(sourceType: V1ReviewSourceType) {
  return sourceType === 'team_match' || sourceType === 'tournament_fixture';
}
