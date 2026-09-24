'use client';

import { useV1MyMatchesInfinite } from '@/hooks/use-v1-api';
import { withFromPath } from '@/lib/session-storage';
import type { V1Match } from '@/types/api';
import { MyMatchesPageView } from './my-page';
import type { MyMatch, MyMatchesViewModel, MyMatchStatus } from './my.types';

export function MyMatchesPageClient({ mode }: { mode: 'joined' | 'created' }) {
  const query = useV1MyMatchesInfinite(mode);
  // Only show real data. Mock fallback matches must never appear in place of real data.
  const matches = query.data ? query.data.pages.flatMap((page) => page.items).filter((item, index, items) => items.findIndex((other) => (other.matchId ?? other.id) === (item.matchId ?? item.id)) === index).map((match) => toMyMatch(match, mode)) : [];

  const model: MyMatchesViewModel = {
    mode,
    matches,
    summary: buildSummary(mode, matches),
    loading: query.isLoading,
    error: query.isError && !query.data,
    onRetry: () => void query.refetch(),
    hasNext: query.hasNextPage,
    loadMorePending: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    onLoadMore: () => { if (!query.isFetching) void query.fetchNextPage(); },
  };

  return <MyMatchesPageView model={model} />;
}


function toMyMatch(match: V1Match, mode: 'joined' | 'created'): MyMatch {
  const status = toMyStatus(match);
  const id = match.matchId ?? match.id;
  const canReview = isReviewableMatch(match);

  return {
    id,
    title: match.title,
    meta: `${formatDateTime(match.startsAt)} · ${match.place?.name ?? match.placeName ?? '장소 미정'}`,
    status,
    statusLabel: statusLabel(status, match),
    note: buildNote(match, status),
    // 뒤로가기가 이 목록으로 돌아오도록 출처를 함께 넘긴다(matches-client.tsx가 `?from=`을 읽는다).
    href: withFromPath(`/matches/${id}`, `/my/matches/${mode}`),
    // href 는 쿼리를 달고 있어 경로를 이어 붙일 수 없다 — 관리 경로는 따로 만든다.
    manageHref: `/matches/${id}/applications`,
    reviewHref: canReview ? `/my/reviews/match/${id}` : undefined,
  };
}

function buildSummary(mode: 'joined' | 'created', matches: MyMatch[]) {
  return [
    { label: '전체', value: matches.length, unit: '건' },
    { label: mode === 'joined' ? '승인 대기' : '모집 중', value: matches.filter((item) => item.status === 'pending' || item.status === 'recruiting').length, unit: '건' },
    { label: mode === 'joined' ? '참가 확정' : '완료', value: matches.filter((item) => item.status === 'approved' || item.statusLabel === '참여 완료').length, unit: '건' },
  ];
}

function getViewerState(match: V1Match) {
  return match.viewerState ?? match.viewer?.state ?? 'none';
}

function toMyStatus(match: V1Match): MyMatchStatus {
  const state = getViewerState(match);
  const display = match.displayState ?? match.status;
  if (state === 'requested') return 'pending';
  if (display === 'completed' || display === 'expired' || display === 'closed' || display === 'cancelled') return 'ended';
  if (state === 'approved' || state === 'participant') return 'approved';
  return 'recruiting';
}

function isReviewableMatch(match: V1Match) {
  return (match.displayState ?? match.status) === 'completed' && match.viewer?.participantStatus !== 'no_show';
}

function statusLabel(status: MyMatchStatus, match: V1Match) {
  if ((match.displayState ?? match.status) === 'completed') {
    return match.viewer?.participantStatus === 'no_show' ? '불참' : '참여 완료';
  }
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'ended') return '종료';
  return '모집 중';
}

function buildNote(match: V1Match, status: MyMatchStatus) {
  if ((match.displayState ?? match.status) === 'completed' && match.viewer?.participantStatus === 'no_show') return '불참으로 확인된 경기예요. 개인 경기 점수는 기록되지 않아요.';
  if (status === 'pending') return '호스트가 신청을 검토 중이에요.';
  if (status === 'approved') return '참가가 확정됐어요. 장소와 시간을 확인해 보세요.';
  if (status === 'ended' && isReviewableMatch(match)) return '참여한 경기로 기록됐어요. 함께한 참가자에게 후기를 남길 수 있어요.';
  if (status === 'ended') return '경기가 종료됐거나 모집이 마감된 상태예요.';
  return `${match.participantCount ?? 0}/${match.capacity ?? 0}명이 참가 확정했어요.`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
