'use client';

import { useV1Matches } from '@/hooks/use-v1-api';
import type { V1Match } from '@/types/api';
import { MyMatchesPageView } from './my-page';
import type { MyMatch, MyMatchesViewModel, MyMatchStatus } from './my.types';
import { getMyMatchesModel } from './my.view-model';

export function MyMatchesPageClient({ mode }: { mode: 'joined' | 'created' }) {
  const query = useV1Matches({ limit: 50 });
  const fallback = getMyMatchesModel(mode);
  const items = query.data?.items ?? [];
  const filtered = items.filter((match) => (mode === 'created' ? getViewerState(match) === 'host' : isJoinedState(getViewerState(match))));
  const matches = filtered.map(toMyMatch);

  const model: MyMatchesViewModel = {
    ...fallback,
    matches: query.data ? matches : fallback.matches,
    summary: buildSummary(mode, query.data ? matches : fallback.matches),
    apiNotice: getApiNotice(query.isLoading, query.isError, Boolean(query.data), matches.length),
  };

  return <MyMatchesPageView model={model} />;
}

function getApiNotice(isLoading: boolean, isError: boolean, hasData: boolean, matchCount: number): MyMatchesViewModel['apiNotice'] {
  if (isLoading) {
    return {
      title: '내 매치를 불러오는 중입니다',
      body: '서버에서 내 참여/생성 상태를 확인하고 있습니다.',
      tone: 'info',
    };
  }

  if (isError) {
    return {
      title: '내 매치 API 연결에 실패했습니다',
      body: '현재 화면에는 샘플 항목이 표시됩니다. 새로고침 후에도 반복되면 다시 시도해 주세요.',
      tone: 'warning',
    };
  }

  if (hasData && matchCount === 0) {
    return {
      title: '표시할 내 매치가 없습니다',
      body: '신청하거나 생성한 매치가 생기면 이 화면에 표시됩니다.',
      tone: 'info',
    };
  }

  return undefined;
}

function toMyMatch(match: V1Match): MyMatch {
  const status = toMyStatus(match);
  const id = match.matchId ?? match.id;

  return {
    id,
    title: match.title,
    meta: `${formatDateTime(match.startsAt)} · ${match.place?.name ?? match.placeName ?? '장소 미정'}`,
    status,
    statusLabel: statusLabel(status),
    note: buildNote(match, status),
    href: `/matches/${id}`,
  };
}

function buildSummary(mode: 'joined' | 'created', matches: MyMatch[]) {
  return [
    { label: '전체', value: matches.length, unit: '건' },
    { label: mode === 'joined' ? '승인 대기' : '모집중', value: matches.filter((item) => item.status === 'pending' || item.status === 'recruiting').length, unit: '건' },
    { label: '확정', value: matches.filter((item) => item.status === 'approved').length, unit: '건' },
  ];
}

function getViewerState(match: V1Match) {
  return match.viewerState ?? match.viewer?.state ?? 'none';
}

function isJoinedState(state: string) {
  return state === 'requested' || state === 'approved' || state === 'participant';
}

function toMyStatus(match: V1Match): MyMatchStatus {
  const state = getViewerState(match);
  const display = match.displayState ?? match.status;
  if (state === 'requested') return 'pending';
  if (display === 'completed' || display === 'expired' || display === 'closed' || display === 'cancelled') return 'ended';
  if (state === 'approved' || state === 'participant') return 'approved';
  return 'recruiting';
}

function statusLabel(status: MyMatchStatus) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'ended') return '종료';
  return '모집중';
}

function buildNote(match: V1Match, status: MyMatchStatus) {
  if (status === 'pending') return '호스트가 신청을 검토 중입니다.';
  if (status === 'approved') return '참가가 확정되었습니다. 상세에서 장소와 시간을 확인하세요.';
  if (status === 'ended') return '종료되었거나 더 이상 모집하지 않는 매치입니다.';
  return `${match.participantCount ?? 0}/${match.capacity ?? 0}명이 참가 확정했어요.`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
