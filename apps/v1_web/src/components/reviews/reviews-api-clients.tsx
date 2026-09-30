'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1MyTeams, useV1ReceivedReviews, useV1ReceivedReviewSummary, useV1Reviews, useV1ReviewSource, useV1SubmitReview } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1ReviewSourceType } from '@/types/api';
import { ReviewSourcePageView, ReviewsPageView, ReviewSubmitCompleteView } from './reviews-page';
import type { ReviewMetricDraft, ReviewTargetDraft, ReviewsTab } from './reviews.types';
import { getReviewProgress, toReviewSourcePageModel, toReviewsPageModel, toReviewsReceivedPageModel } from './reviews.view-model';

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
  admin = false,
}: {
  admin?: boolean;
  complete: boolean;
  sourceId: string;
  sourceType: V1ReviewSourceType;
}) {
  const router = useRouter();
  const query = useV1ReviewSource(sourceType, sourceId);
  const submit = useV1SubmitReview();
  const [drafts, setDrafts] = useState<Record<string, ReviewTargetDraft>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const model = useMemo(() => (query.data ? toReviewSourcePageModel(query.data) : null), [query.data]);

  if (complete && model) {
    return <ReviewSubmitCompleteView model={model} onConfirm={() => router.replace('/my/reviews?tab=written')} />;
  }

  // 별은 비어 있는 채로 시작한다 -- 기본 점수가 없어야 누르지 않은 5점이 서버에 저장되지 않는다.
  const updateDraft = (key: string, update: (draft: ReviewTargetDraft) => ReviewTargetDraft) => {
    setDrafts((current) => ({ ...current, [key]: update(current[key] ?? { rating: null, tagCodes: [] }) }));
  };

  const setRating = (key: string, rating: number) => updateDraft(key, (draft) => ({ ...draft, rating }));

  const setMetricScore = (key: string, metric: keyof ReviewMetricDraft, score: number) => {
    updateDraft(key, (draft) => ({ ...draft, metricOverrides: { ...draft.metricOverrides, [metric]: score } }));
  };

  const toggleTag = (key: string, tagCode: string) => {
    updateDraft(key, (draft) => ({
      ...draft,
      tagCodes: draft.tagCodes.includes(tagCode) ? draft.tagCodes.filter((code) => code !== tagCode) : [...draft.tagCodes, tagCode],
    }));
  };

  const clearDraft = (key: string) => {
    setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([draftKey]) => draftKey !== key)));
  };

  const toggleOpen = (key: string) => setOpenKey((current) => (current === key ? null : key));

  const submitAll = async () => {
    if (!query.data) return;
    setMessage(null);
    const { ready, incomplete } = getReviewProgress(query.data.targets, drafts);

    if (incomplete.length > 0) {
      setMessage('별점과 태그를 모두 고르지 않은 리뷰가 있어요.');
      return;
    }
    if (ready.length === 0) {
      setMessage('별점과 태그를 선택한 리뷰가 없어요.');
      return;
    }

    try {
      for (const { target, rating, tagCodes, metricScores } of ready) {
        await submit.mutateAsync({
          sourceType,
          sourceId,
          targetType: target.targetType,
          targetUserId: target.targetUserId,
          targetTeamId: target.targetTeamId,
          rating,
          tagCodes,
          // 4항목 채점은 사람 대상에만 -- 팀 대상에 실으면 서버가 400 으로 거부한다.
          ...(metricScores ? { metricScores } : {}),
        });
      }
      if (admin) {
        await query.refetch();
        setMessage(null);
      } else router.replace(`/my/reviews/${sourceType}/${sourceId}?complete=1`);
    } catch (error) {
      setMessage(extractErrorMessage(error, '리뷰 전송에 실패했어요. 다시 시도해 주세요.'));
    }
  };

  return (
    <ReviewSourcePageView
      admin={admin}
      drafts={drafts}
      errorMessage={query.error instanceof Error ? query.error.message : null}
      loading={query.isLoading}
      message={message}
      model={model}
      onClearDraft={clearDraft}
      onRetry={() => void query.refetch()}
      onSubmit={submitAll}
      onToggleOpen={toggleOpen}
      onToggleTag={toggleTag}
      onUpdateMetricScore={setMetricScore}
      onUpdateRating={setRating}
      openKey={openKey}
      submitting={submit.isPending}
    />
  );
}
