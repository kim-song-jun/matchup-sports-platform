'use client';

import { useV1MyMatches } from '@/hooks/use-v1-api';
import type { V1Match } from '@/types/api';
import { MyMatchesPageView } from './my-page';
import type { MyMatch, MyMatchesViewModel, MyMatchStatus } from './my.types';

export function MyMatchesPageClient({ mode }: { mode: 'joined' | 'created' }) {
  const query = useV1MyMatches({ mode, limit: 50 });
  // Only show real data. Mock fallback matches must never appear in place of real data.
  const matches = query.data ? query.data.items.map(toMyMatch) : [];

  const model: MyMatchesViewModel = {
    mode,
    title: mode === 'joined' ? '참여한 매치' : '내가 만든 매치',
    matches,
    summary: buildSummary(mode, matches),
    apiNotice: getApiNotice(query.isLoading, query.isError),
  };

  return <MyMatchesPageView model={model} />;
}

function getApiNotice(isLoading: boolean, isError: boolean): MyMatchesViewModel['apiNotice'] {
  if (isLoading) {
    return {
      title: '내 매치를 불러오고 있어요',
      body: '잠깐만 기다려 주세요.',
      tone: 'info',
    };
  }

  if (isError) {
    return {
      title: '매치 목록을 불러오지 못했어요',
      body: '잠시 후 다시 시도해 주세요. 계속되면 새로고침해 보세요.',
      tone: 'warning',
    };
  }

  return undefined;
}

function toMyMatch(match: V1Match): MyMatch {
  const status = toMyStatus(match);
  const id = match.matchId ?? match.id;
  const canReview = isReviewableMatch(match);

  return {
    id,
    title: match.title,
    meta: `${formatDateTime(match.startsAt)} · ${match.place?.name ?? match.placeName ?? '장소 미정'}`,
    status,
    statusLabel: statusLabel(status),
    note: buildNote(match, status),
    href: `/matches/${id}`,
    reviewHref: canReview ? `/my/reviews/match/${id}` : undefined,
  };
}

function buildSummary(mode: 'joined' | 'created', matches: MyMatch[]) {
  return [
    { label: '전체', value: matches.length, unit: '건' },
    { label: mode === 'joined' ? '승인 대기' : '모집 중', value: matches.filter((item) => item.status === 'pending' || item.status === 'recruiting').length, unit: '건' },
    { label: '확정', value: matches.filter((item) => item.status === 'approved').length, unit: '건' },
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
  return (match.displayState ?? match.status) === 'completed';
}

function statusLabel(status: MyMatchStatus) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'ended') return '종료';
  return '모집 중';
}

function buildNote(match: V1Match, status: MyMatchStatus) {
  if (status === 'pending') return '호스트가 신청을 검토 중이에요.';
  if (status === 'approved') return '참가가 확정됐어요. 장소와 시간을 확인해 보세요.';
  if (status === 'ended' && isReviewableMatch(match)) return '상대 평가와 리뷰를 남길 수 있어요.';
  if (status === 'ended') return '경기가 종료됐거나 모집이 마감된 상태예요.';
  return `${match.participantCount ?? 0}/${match.capacity ?? 0}명이 참가 확정했어요.`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
