'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1MyTeams, useV1ReceivedReviews, useV1ReceivedReviewSummary, useV1Reviews, useV1ReviewSource, useV1SubmitReview } from '@/hooks/use-v1-api';
import type { V1ReviewSourceType, V1ReviewTargetType } from '@/types/api';
import { ReviewSourcePageView, ReviewsPageView, ReviewsReceivedPageView, ReviewSubmitCompleteView } from './reviews-page';
import { DEFAULT_REVIEW_RATING, type ReviewMetricDraft, type ReviewTargetDraft, type ReviewsTab } from './reviews.types';
import { toReviewSourcePageModel, toReviewsPageModel, toReviewsReceivedPageModel } from './reviews.view-model';

export function ReviewsPageClient({ initialTab }: { initialTab: ReviewsTab }) {
  const [tab, setTab] = useState<ReviewsTab>(initialTab);
  const [period, setPeriod] = useState<string | null>(null);
  const [teamPeriod, setTeamPeriod] = useState<string | null>(null);
  const reviewsQuery = useV1Reviews({ tab: tab === 'received' ? 'pending' : tab }, { enabled: tab !== 'received' });
  const receivedQuery = useV1ReceivedReviews(undefined, { enabled: tab === 'received' });
  const summaryQuery = useV1ReceivedReviewSummary('user', period ?? undefined, { enabled: tab === 'received' });
  const teamsQuery = useV1MyTeams();
  const hasManagedTeam = (teamsQuery.data?.items ?? []).some((team) => team.canManage);
  const teamSummaryQuery = useV1ReceivedReviewSummary('team', teamPeriod ?? undefined, { enabled: tab === 'received' && hasManagedTeam });
  const model = useMemo(() => toReviewsPageModel(reviewsQuery.data, tab), [reviewsQuery.data, tab]);
  const receivedModel = useMemo(() => toReviewsReceivedPageModel(receivedQuery.data), [receivedQuery.data]);
  const activeQuery = tab === 'received' ? receivedQuery : reviewsQuery;

  return (
    <ReviewsPageView
      errorMessage={activeQuery.error instanceof Error ? activeQuery.error.message : null}
      hasManagedTeam={hasManagedTeam}
      loading={activeQuery.isLoading}
      model={model}
      onPeriodChange={setPeriod}
      onRetry={() => void activeQuery.refetch()}
      onTabChange={setTab}
      onTeamPeriodChange={setTeamPeriod}
      period={period}
      receivedModel={receivedModel}
      summary={summaryQuery.data}
      summaryLoading={summaryQuery.isLoading}
      teamPeriod={teamPeriod}
      teamSummary={teamSummaryQuery.data}
      teamSummaryLoading={teamSummaryQuery.isLoading}
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
        const baseRating = target.review?.rating ?? DEFAULT_REVIEW_RATING;
        next[key] = {
          rating: baseRating,
          tagCodes: target.review?.tags.map((tag) => tag.tagCode) ?? [],
          // 4항목은 사람 대상에만. 기본값은 종합 별점 -- 세부를 안 만져도 제출이 막히지 않는다.
          ...(target.targetType === 'user'
            ? { metricScores: { skill: baseRating, manner: baseRating, punctuality: baseRating, safety: baseRating } }
            : {}),
        };
      }
      return next;
    });
  }, [query.data]);

  if (complete && model) {
    return <ReviewSubmitCompleteView model={model} onConfirm={() => router.replace('/my/reviews?tab=written')} />;
  }

  const setRating = (key: string, rating: number) => {
    setDrafts((current) => {
      const draft = current[key];
      return {
        ...current,
        [key]: {
          rating,
          tagCodes: draft?.tagCodes ?? [],
          // 세부 항목을 아직 안 만졌으면(전부 이전 종합값과 동일) 종합 별점을 따라간다 --
          // 만진 뒤에는 사용자의 세부 판단을 종합 별점이 덮어쓰지 않는다.
          ...(draft?.metricScores
            ? {
                metricScores: Object.values(draft.metricScores).every((score) => score === draft.rating)
                  ? { skill: rating, manner: rating, punctuality: rating, safety: rating }
                  : draft.metricScores,
              }
            : {}),
        },
      };
    });
  };

  const setMetricScore = (key: string, metric: keyof ReviewMetricDraft, score: number) => {
    setDrafts((current) => {
      const draft = current[key];
      if (!draft?.metricScores) return current;
      return { ...current, [key]: { ...draft, metricScores: { ...draft.metricScores, [metric]: score } } };
    });
  };

  const toggleTag = (key: string, tagCode: string) => {
    setDrafts((current) => {
      const draft = current[key] ?? { rating: DEFAULT_REVIEW_RATING, tagCodes: [] };
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
        const draft = drafts[key] ?? { rating: DEFAULT_REVIEW_RATING, tagCodes: [] };
        await submit.mutateAsync({
          sourceType,
          sourceId,
          targetType: target.targetType,
          targetUserId: target.targetUserId,
          targetTeamId: target.targetTeamId,
          rating: draft.rating,
          tagCodes: draft.tagCodes,
          // 4항목 채점은 사람 대상에만 -- 팀 대상에 실으면 서버가 400 으로 거부한다.
          ...(target.targetType === 'user' && draft.metricScores ? { metricScores: draft.metricScores } : {}),
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
      onUpdateMetricScore={setMetricScore}
      onUpdateRating={setRating}
      submitting={submit.isPending}
    />
  );
}

export function ReviewsReceivedPageClient() {
  const [period, setPeriod] = useState<string | null>(null);
  const [teamPeriod, setTeamPeriod] = useState<string | null>(null);
  const query = useV1ReceivedReviews();
  const summaryQuery = useV1ReceivedReviewSummary('user', period ?? undefined);
  const teamsQuery = useV1MyTeams();
  const hasManagedTeam = (teamsQuery.data?.items ?? []).some((team) => team.canManage);
  const teamSummaryQuery = useV1ReceivedReviewSummary('team', teamPeriod ?? undefined, { enabled: hasManagedTeam });
  const model = useMemo(() => toReviewsReceivedPageModel(query.data), [query.data]);

  return (
    <ReviewsReceivedPageView
      errorMessage={query.error instanceof Error ? query.error.message : null}
      hasManagedTeam={hasManagedTeam}
      loading={query.isLoading}
      model={model}
      onPeriodChange={setPeriod}
      onRetry={() => void query.refetch()}
      onTeamPeriodChange={setTeamPeriod}
      period={period}
      summary={summaryQuery.data}
      summaryLoading={summaryQuery.isLoading}
      teamPeriod={teamPeriod}
      teamSummary={teamSummaryQuery.data}
      teamSummaryLoading={teamSummaryQuery.isLoading}
    />
  );
}

function targetKey(targetType: V1ReviewTargetType, targetUserId: string | null, targetTeamId: string | null) {
  return targetType === 'team' ? `team:${targetTeamId ?? 'unknown'}` : `user:${targetUserId ?? 'unknown'}`;
}
