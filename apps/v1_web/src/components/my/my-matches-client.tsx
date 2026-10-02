'use client';

import { useSearchParams } from 'next/navigation';
import { useV1MyMatchesInfinite, useV1MyTeamMatchesInfinite } from '@/hooks/use-v1-api';
import { withFromPath } from '@/lib/session-storage';
import { personalMatchLifecycleLabel } from '@/lib/v1-status-labels';
import type { V1Match, V1MyTeamMatch } from '@/types/api';
import { MyMatchesPageView } from './my-page';
import type { MyMatch, MyMatchesViewModel, MyMatchStatus } from './my.types';

type MatchTypeFilter = MyMatchesViewModel['typeFilter'];

export function MyMatchesPageClient({ mode }: { mode: 'joined' | 'created' }) {
  const searchParams = useSearchParams();
  const typeFilter = parseTypeFilter(searchParams.get('type'));
  const personalEnabled = typeFilter !== 'team';
  const teamEnabled = typeFilter !== 'personal';
  const personalQuery = useV1MyMatchesInfinite(mode, { enabled: personalEnabled });
  const teamQuery = useV1MyTeamMatchesInfinite(mode === 'created' ? 'created' : 'applied', { enabled: teamEnabled });
  const listHref = matchListHref(mode, typeFilter);

  const personalMatches = personalQuery.data
    ? personalQuery.data.pages
      .flatMap((page) => page.items)
      .filter((item, index, items) => items.findIndex((other) => (other.matchId ?? other.id) === (item.matchId ?? item.id)) === index)
      .map((match) => toPersonalMatch(match, listHref))
    : [];
  const teamMatches = teamQuery.data
    ? teamQuery.data.pages
      .flatMap((page) => page.items)
      .filter((item, index, items) => items.findIndex((other) => other.teamMatchId === item.teamMatchId) === index)
      .map((match) => toTeamMatch(match, mode, listHref))
    : [];

  const matches = sortMatches(
    typeFilter === 'personal'
      ? personalMatches
      : typeFilter === 'team'
        ? teamMatches
        : [...personalMatches, ...teamMatches],
  );
  const sources = [
    ...(personalEnabled ? [{ label: '개인 매치', query: personalQuery }] : []),
    ...(teamEnabled ? [{ label: '팀 매치', query: teamQuery }] : []),
  ];
  const allFailed = sources.every(({ query }) => query.isError && !query.data);
  const failedSources = sources.filter(({ query }) => query.isError).map(({ label }) => label);
  const loading = matches.length === 0 && sources.some(({ query }) => query.isLoading) && !allFailed;
  const error = matches.length === 0 && allFailed;

  const retryFailedSources = () => {
    for (const { query } of sources) {
      if (query.isError) void query.refetch();
    }
  };

  const loadMore = () => {
    if (personalEnabled && personalQuery.hasNextPage && !personalQuery.isFetchingNextPage) {
      void personalQuery.fetchNextPage();
    }
    if (teamEnabled && teamQuery.hasNextPage && !teamQuery.isFetchingNextPage) {
      void teamQuery.fetchNextPage();
    }
  };

  const model: MyMatchesViewModel = {
    mode,
    typeFilter,
    filters: buildTypeFilters(mode),
    matches,
    summary: buildSummary(mode, matches),
    emptyState: buildEmptyState(mode, typeFilter),
    loading,
    error,
    onRetry: () => {
      for (const { query } of sources) void query.refetch();
    },
    partialError: !error && failedSources.length > 0
      ? {
          message: `${failedSources.join('·')} 목록을 불러오지 못했어요. 지금 보이는 목록이 전체가 아닐 수 있어요.`,
          onRetry: retryFailedSources,
        }
      : undefined,
    hasNext: sources.some(({ query }) => query.hasNextPage),
    loadMorePending: sources.some(({ query }) => query.isFetchingNextPage),
    loadMoreError: sources.some(({ query }) => query.isFetchNextPageError),
    onLoadMore: loadMore,
  };

  return <MyMatchesPageView model={model} />;
}

function parseTypeFilter(value: string | null): MatchTypeFilter {
  return value === 'personal' || value === 'team' ? value : 'all';
}

function matchListHref(mode: 'joined' | 'created', type: MatchTypeFilter) {
  const base = `/my/matches/${mode}`;
  return type === 'all' ? base : `${base}?type=${type}`;
}

function buildTypeFilters(mode: 'joined' | 'created'): MyMatchesViewModel['filters'] {
  return [
    { key: 'all', label: '전체', href: matchListHref(mode, 'all') },
    { key: 'personal', label: '개인 매치', href: matchListHref(mode, 'personal') },
    { key: 'team', label: '팀 매치', href: matchListHref(mode, 'team') },
  ];
}

function buildEmptyState(mode: 'joined' | 'created', type: MatchTypeFilter): MyMatchesViewModel['emptyState'] {
  if (type === 'team') {
    return mode === 'joined'
      ? {
          title: '신청·참여한 팀 매치가 없어요',
          sub: '소속 팀이 팀매치를 신청하거나 확정하면 여기에 표시돼요.',
          cta: '팀 매치 둘러보기',
          ctaHref: '/team-matches',
        }
      : {
          title: '만든 팀 매치가 없어요',
          sub: '직접 만든 팀매치의 모집 현황을 여기서 관리할 수 있어요.',
          cta: '팀 매치 만들기',
          ctaHref: withFromPath('/team-matches/new/team', '/my/matches/created?type=team'),
        };
  }

  if (type === 'personal') {
    return mode === 'joined'
      ? {
          title: '신청·참여한 개인 매치가 없어요',
          sub: '개인 매치를 신청하거나 참여하면 여기에 표시돼요.',
          cta: '개인 매치 둘러보기',
          ctaHref: '/matches',
        }
      : {
          title: '만든 개인 매치가 없어요',
          sub: '직접 만든 개인 매치의 모집 현황을 여기서 관리할 수 있어요.',
          cta: '개인 매치 만들기',
          ctaHref: withFromPath('/matches/new/sport', '/my/matches/created?type=personal'),
        };
  }

  return mode === 'joined'
    ? {
        title: '신청·참여한 매치가 없어요',
        sub: '개인 매치나 소속 팀의 팀매치에 참여하면 여기에 표시돼요.',
        cta: '매치 둘러보기',
        ctaHref: '/matches',
      }
    : {
        title: '만든 매치가 없어요',
        sub: '개인 또는 팀 매치를 만들면 여기에 표시돼요.',
        cta: '개인 매치 만들기',
        ctaHref: withFromPath('/matches/new/sport', '/my/matches/created'),
      };
}

function toPersonalMatch(match: V1Match, listHref: string): MyMatch {
  const status = toPersonalStatus(match);
  const id = match.matchId ?? match.id;
  const canReview = isReviewablePersonalMatch(match);
  // 목록 응답에는 canComplete 가 없다 — 호스트의 종료 확인 대기 상태로 같은 조건을 판단한다.
  const needsCompletion = getViewerState(match) === 'host' && (match.displayState ?? match.status) === 'completion_pending';

  return {
    id,
    kind: 'personal',
    kindLabel: '개인 매치',
    startsAt: match.startsAt,
    title: match.title,
    meta: `${formatDateTime(match.startsAt)} · ${match.place?.name ?? match.placeName ?? '장소 미정'}`,
    status,
    statusLabel: personalStatusLabel(status, match),
    note: buildPersonalNote(match, status),
    href: withFromPath(`/matches/${id}`, listHref),
    // 종료 확인이 필요한 호스트는 참여 여부를 체크하는 확정 명단 탭으로 바로 보낸다(매치 상세 CTA 와 같은 경로).
    manageHref: withFromPath(needsCompletion ? `/matches/${id}/applications?tab=approved` : `/matches/${id}/applications`, listHref),
    manageLabel: needsCompletion ? '참여 확인' : '참가 관리',
    reviewHref: canReview ? `/my/reviews/match/${id}` : undefined,
  };
}

function toTeamMatch(match: V1MyTeamMatch, mode: 'joined' | 'created', listHref: string): MyMatch {
  const display = match.displayState ?? match.status;
  const status = toTeamStatus(match);
  const completed = display === 'completed';
  const canReview = completed && (match.relation === 'approved' || Boolean(match.manageRoute));

  return {
    id: match.teamMatchId,
    kind: 'team',
    kindLabel: match.league ? '리그 팀 매치' : '팀 매치',
    contextLabel: match.teamName ? `${match.teamName} · ${teamRelationLabel(match.relation)}` : teamRelationLabel(match.relation),
    startsAt: match.startsAt,
    title: match.title,
    meta: `${formatDateTime(match.startsAt)} · ${match.sportName}`,
    status,
    statusLabel: teamStatusLabel(match, mode),
    note: buildTeamNote(match, mode),
    href: withFromPath(match.detailRoute, listHref),
    manageHref: mode === 'created' && match.manageRoute ? withFromPath(match.manageRoute, listHref) : undefined,
    manageLabel: '팀매치 관리',
    reviewHref: canReview ? `/my/reviews/team_match/${match.teamMatchId}` : undefined,
  };
}

function sortMatches(matches: MyMatch[]) {
  return [...matches].sort((a, b) => {
    const aEnded = a.status === 'ended';
    const bEnded = b.status === 'ended';
    if (aEnded !== bEnded) return aEnded ? 1 : -1;
    const aTime = new Date(a.startsAt).getTime();
    const bTime = new Date(b.startsAt).getTime();
    const safeATime = Number.isFinite(aTime) ? aTime : 0;
    const safeBTime = Number.isFinite(bTime) ? bTime : 0;
    return aEnded ? safeBTime - safeATime : safeATime - safeBTime;
  });
}

function buildSummary(mode: 'joined' | 'created', matches: MyMatch[]) {
  return [
    { label: '전체', value: matches.length, unit: '건' },
    { label: '개인 매치', value: matches.filter((item) => item.kind === 'personal').length, unit: '건' },
    { label: '팀 매치', value: matches.filter((item) => item.kind === 'team').length, unit: '건' },
    { label: mode === 'joined' ? '확정' : '진행 중', value: matches.filter((item) => ['approved', 'recruiting', 'scheduled', 'in_progress'].includes(item.status)).length, unit: '건' },
  ];
}

function getViewerState(match: V1Match) {
  return match.viewerState ?? match.viewer?.state ?? 'none';
}

function toPersonalStatus(match: V1Match): MyMatchStatus {
  const state = getViewerState(match);
  const display = match.displayState ?? match.status;
  if (display === 'on_hold') return 'on_hold';
  if (state === 'requested') return 'pending';
  if (display === 'scheduled' || display === 'in_progress') return display;
  if (display === 'completed' || display === 'expired' || display === 'closed' || display === 'cancelled') return 'ended';
  if (state === 'approved' || state === 'participant') return 'approved';
  return 'recruiting';
}

function toTeamStatus(match: V1MyTeamMatch): MyMatchStatus {
  const display = match.displayState ?? match.status;
  if (display === 'on_hold') return 'on_hold';
  if (match.relation === 'requested') return 'pending';
  if (match.relation === 'rejected' || match.relation === 'withdrawn') return 'ended';
  if (display === 'completed' || display === 'expired' || display === 'closed' || display === 'cancelled') return 'ended';
  if (display === 'matched' || match.relation === 'approved') return 'approved';
  return 'recruiting';
}

function isReviewablePersonalMatch(match: V1Match) {
  return (match.displayState ?? match.status) === 'completed' && match.viewer?.participantStatus !== 'no_show';
}

function personalStatusLabel(status: MyMatchStatus, match: V1Match) {
  if ((match.displayState ?? match.status) === 'completed') {
    return match.viewer?.participantStatus === 'no_show' ? '불참' : '참여 완료';
  }
  const lifecycle = personalMatchLifecycleLabel(match.displayState ?? match.status, getViewerState(match) === 'host');
  if (lifecycle && status !== 'pending') return lifecycle;
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'ended') return '종료';
  return '모집 중';
}

function teamStatusLabel(match: V1MyTeamMatch, mode: 'joined' | 'created') {
  const display = match.displayState ?? match.status;
  if (display === 'on_hold') return '보류';
  if (display === 'completed') return '경기 완료';
  if (display === 'cancelled') return '경기 취소';
  if (display === 'expired') return '기간 종료';
  if (match.relation === 'rejected') return '신청 거절';
  if (match.relation === 'withdrawn') return '신청 취소';
  if (match.relation === 'requested') return '우리 팀 신청 중';
  if (display === 'matched' || match.relation === 'approved') return '상대팀 확정';
  if (display === 'closed') return '모집 마감';
  return mode === 'created' ? '모집 중' : '우리 팀 매치';
}

function teamRelationLabel(relation: V1MyTeamMatch['relation']) {
  if (relation === 'created_by_me') return '내가 생성';
  if (relation === 'host_team') return '호스트 팀';
  if (relation === 'requested') return '우리 팀 신청';
  if (relation === 'approved') return '우리 팀 확정';
  if (relation === 'rejected') return '우리 팀 신청 거절';
  return '우리 팀 신청 취소';
}

function buildPersonalNote(match: V1Match, status: MyMatchStatus) {
  if ((match.displayState ?? match.status) === 'completed' && match.viewer?.participantStatus === 'no_show') return '불참으로 확인된 경기예요. 개인 경기 점수는 기록되지 않아요.';
  const display = match.displayState ?? match.status;
  if (status !== 'pending' && display === 'in_progress') return '경기가 진행 중이에요.';
  if (status !== 'pending' && display === 'completion_pending') {
    return getViewerState(match) === 'host' ? '경기가 끝났어요. 참가자가 실제로 참여했는지 확인해 주세요.' : '호스트가 참여 여부를 확인하고 있어요.';
  }
  if (status === 'pending') return '호스트가 신청을 검토 중이에요.';
  if (status === 'approved') return '참가가 확정됐어요. 장소와 시간을 확인해 보세요.';
  if (status === 'ended' && isReviewablePersonalMatch(match)) return '참여한 경기로 기록됐어요. 함께한 참가자에게 후기를 남길 수 있어요.';
  if (status === 'ended') return '경기가 종료됐거나 모집이 마감된 상태예요.';
  return `${match.participantCount ?? 0}/${match.capacity ?? 0}명이 참가 확정했어요.`;
}

function buildTeamNote(match: V1MyTeamMatch, mode: 'joined' | 'created') {
  const display = match.displayState ?? match.status;
  if (display === 'completed') return '완료된 팀 경기예요. 공식 출전 여부는 제출된 라인업과 경기 기록을 기준으로 해요.';
  if (display === 'cancelled') return '취소된 팀 경기예요.';
  if (match.relation === 'requested') return '우리 팀의 참가 신청을 호스트 팀이 검토하고 있어요.';
  if (match.relation === 'rejected') return '우리 팀의 참가 신청이 승인되지 않았어요.';
  if (match.relation === 'withdrawn') return '우리 팀이 참가 신청을 취소했어요.';
  if (display === 'matched' || match.relation === 'approved') return '상대 팀이 확정됐어요. 팀 상세에서 라인업과 경기 준비 상태를 확인하세요.';
  return mode === 'created' ? '상대 팀 신청과 모집 상태를 확인할 수 있어요.' : '소속 팀과 연결된 팀 경기예요.';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
