'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1ReceivedReviews, useV1ReceivedReviewSummary, useV1Reviews, useV1ReviewSource, useV1SubmitReview } from '@/hooks/use-v1-api';
import type { V1ReviewSourceType, V1ReviewTargetType } from '@/types/api';
import { ReviewSourcePageView, ReviewsPageView, ReviewsReceivedPageView, ReviewSubmitCompleteView } from './reviews-page';
import type { ReviewTargetDraft, ReviewsTab } from './reviews.types';
import { toReviewSourcePageModel, toReviewsPageModel, toReviewsReceivedPageModel } from './reviews.view-model';

export function ReviewsPageClient({ initialTab }: { initialTab: ReviewsTab }) {
  const [tab, setTab] = useState<ReviewsTab>(initialTab);
  const [period, setPeriod] = useState<string | null>(null);
  const reviewsQuery = useV1Reviews({ tab: tab === 'received' ? 'pending' : tab }, { enabled: tab !== 'received' });
  const receivedQuery = useV1ReceivedReviews(undefined, { enabled: tab === 'received' });
  const summaryQuery = useV1ReceivedReviewSummary('user', period ?? undefined, { enabled: tab === 'received' });
  const model = useMemo(() => toReviewsPageModel(reviewsQuery.data, tab), [reviewsQuery.data, tab]);
  const receivedModel = useMemo(() => toReviewsReceivedPageModel(receivedQuery.data), [receivedQuery.data]);
  const activeQuery = tab === 'received' ? receivedQuery : reviewsQuery;

  return (
    <ReviewsPageView
      errorMessage={activeQuery.error instanceof Error ? activeQuery.error.message : null}
      loading={activeQuery.isLoading}
      model={model}
      onPeriodChange={setPeriod}
      onRetry={() => void activeQuery.refetch()}
      onTabChange={setTab}
      period={period}
      receivedModel={receivedModel}
      summary={summaryQuery.data}
      summaryLoading={summaryQuery.isLoading}
    />
  );
}

export function ReviewSourcePageClient({
  complete,
  sourceId,
  sourceType,
}: {
  complete: boolean;
  sourceId: string;
  sourceType: V1ReviewSourceType;
}) {
  const router = useRouter();
  const query = useV1ReviewSource(sourceType, sourceId);
  const submit = useV1SubmitReview();
  const [drafts, setDrafts] = useState<Record<string, ReviewTargetDraft>>({});
  const [message, setMessage] = useState<string | null>(null);
  const model = useMemo(() => (query.data ? toReviewSourcePageModel(query.data) : null), [query.data]);

  useEffect(() => {
    if (!query.data) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const target of query.data.targets) {
        const key = targetKey(target.targetType, target.targetUserId, target.targetTeamId);
        if (next[key]) continue;
        next[key] = {
          rating: target.review?.rating ?? 4,
          tagCodes: target.review?.tags.map((tag) => tag.tagCode) ?? [],
        };
      }
      return next;
    });
  }, [query.data]);

  if (complete && model) {
    return <ReviewSubmitCompleteView model={model} onConfirm={() => router.replace('/my/reviews?tab=written')} />;
  }

  const setRating = (key: string, rating: number) => {
    setDrafts((current) => ({ ...current, [key]: { rating, tagCodes: current[key]?.tagCodes ?? [] } }));
  };

  const toggleTag = (key: string, tagCode: string) => {
    setDrafts((current) => {
      const draft = current[key] ?? { rating: 4, tagCodes: [] };
      const exists = draft.tagCodes.includes(tagCode);
      return {
        ...current,
        [key]: {
          ...draft,
          tagCodes: exists ? draft.tagCodes.filter((code) => code !== tagCode) : [...draft.tagCodes, tagCode],
        },
      };
    });
  };

  const submitAll = async () => {
    if (!query.data) return;
    setMessage(null);
    const targets = query.data.targets.filter((target) => !target.locked && !target.alreadySubmitted && !target.review);
    const readyTargets = targets.filter((target) => {
      const draft = drafts[targetKey(target.targetType, target.targetUserId, target.targetTeamId)];
      return draft && draft.tagCodes.length > 0;
    });

    if (readyTargets.length === 0) {
      setMessage('별점과 태그를 선택한 리뷰가 없어요.');
      return;
    }

    try {
      for (const target of readyTargets) {
        const key = targetKey(target.targetType, target.targetUserId, target.targetTeamId);
        const draft = drafts[key] ?? { rating: 4, tagCodes: [] };
        await submit.mutateAsync({
          sourceType,
          sourceId,
          targetType: target.targetType,
          targetUserId: target.targetUserId,
          targetTeamId: target.targetTeamId,
          rating: draft.rating,
          tagCodes: draft.tagCodes,
        });
      }
      router.replace(`/my/reviews/${sourceType}/${sourceId}?complete=1`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '리뷰 전송에 실패했어요. 다시 시도해 주세요.');
    }
  };

  return (
    <ReviewSourcePageView
      drafts={drafts}
      errorMessage={query.error instanceof Error ? query.error.message : null}
      loading={query.isLoading}
      message={message}
      model={model}
      onRetry={() => void query.refetch()}
      onSubmit={submitAll}
      onToggleTag={toggleTag}
      onUpdateRating={setRating}
      submitting={submit.isPending}
    />
  );
}

export function ReviewsReceivedPageClient() {
  const [period, setPeriod] = useState<string | null>(null);
  const query = useV1ReceivedReviews();
  const summaryQuery = useV1ReceivedReviewSummary('user', period ?? undefined);
  const model = useMemo(() => toReviewsReceivedPageModel(query.data), [query.data]);

  return (
    <ReviewsReceivedPageView
      errorMessage={query.error instanceof Error ? query.error.message : null}
      loading={query.isLoading}
      model={model}
      onRetry={() => void query.refetch()}
      summary={summaryQuery.data}
      summaryLoading={summaryQuery.isLoading}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}

function targetKey(targetType: V1ReviewTargetType, targetUserId: string | null, targetTeamId: string | null) {
  return targetType === 'team' ? `team:${targetTeamId ?? 'unknown'}` : `user:${targetUserId ?? 'unknown'}`;
}
