'use client';

import { useV1ChatRooms, useV1Home } from '@/hooks/use-v1-api';
import type { V1Home, V1HomeRecommendation, V1HomeShortcut, V1Match, V1Notice } from '@/types/api';
import { HomePageView } from './home-page';
import type { HomeMatchCard, HomeNotice, HomeQuickAction, HomeStats, HomeViewModel } from './home.types';
import { getHomeViewModel } from './home.view-model';

export function HomePageClient() {
  const query = useV1Home();
  const chatRooms = useV1ChatRooms();
  const fallback = getHomeViewModel();
  const chatUnreadCount = chatRooms.data?.items.reduce((sum, room) => sum + room.unreadCount, 0) ?? 0;

  if (query.isError) {
    return (
      <HomePageView
        model={{
          ...fallback,
          network: true,
          hasNewNotification: false,
          chatUnreadCount,
          retry: () => void query.refetch(),
        }}
      />
    );
  }

  return <HomePageView model={query.data ? toHomeModel(query.data, fallback, () => void query.refetch(), chatUnreadCount) : { ...fallback, chatUnreadCount }} />;
}

function toHomeModel(home: V1Home, fallback: HomeViewModel, retry: () => void, chatUnreadCount: number): HomeViewModel {
  const recommendedMatches = normalizeMatches(home, fallback);
  const unreadCount = home.notifications?.unreadCount ?? 0;
  const viewerName = home.viewer?.authenticated ? home.viewer.displayName : null;

  return {
    ...fallback,
    viewerName,
    signedOut: !home.viewer?.authenticated,
    network: false,
    retry,
    hasNewNotification: unreadCount > 0,
    chatUnreadCount,
    stats: normalizeStats(home, fallback),
    featuredMatch: normalizeFeaturedMatch(home, recommendedMatches, fallback),
    recommendedMatches,
    quickActions: normalizeShortcuts(home.shortcuts, fallback.quickActions),
    notices: normalizeNotices(home, fallback),
  };
}

function normalizeStats(home: V1Home, fallback: HomeViewModel): HomeStats {
  const summary = home.summary;
  if (!summary) return fallback.stats;

  const monthlyMatches = summary.monthlyMatches ?? 0;
  const mannerScore = summary.mannerScore;

  return {
    ...fallback.stats,
    monthlyActivity: monthlyMatches,
    monthlyActivitySub: summary.pendingLabel ?? '신청과 참가 기준으로 집계',
    mannerScore: mannerScore === null ? '-' : mannerScore.toFixed(1),
    mannerScoreSub: trustStateLabel(summary.trustState),
    joined: monthlyMatches,
    trustState: trustStateLabel(summary.trustState),
    pending: summary.pendingLabel ?? '대기 없음',
  };
}

function normalizeFeaturedMatch(home: V1Home, recommendedMatches: HomeMatchCard[], fallback: HomeViewModel): HomeMatchCard {
  const recommended =
    recommendedMatches.find((match) => match.id === home.featuredMatch?.matchId) ??
    recommendedMatches[0] ??
    fallback.featuredMatch;

  if (!home.featuredMatch) return recommended;

  return {
    ...recommended,
    id: home.featuredMatch.matchId,
    title: home.featuredMatch.title,
    currentParticipants: home.featuredMatch.participantCount,
    maxParticipants: home.featuredMatch.capacity,
    reason: home.featuredMatch.reason,
  };
}

function normalizeMatches(home: V1Home, fallback: HomeViewModel) {
  const legacyMatches = Array.isArray(home.recommendedMatches) ? home.recommendedMatches : [];
  if (legacyMatches.length) {
    return legacyMatches.map((match, index) => toHomeMatch(match, fallback.recommendedMatches[index] ?? fallback.featuredMatch));
  }

  const recommendations = Array.isArray(home.recommendations) ? home.recommendations : [];
  return recommendations.length
    ? recommendations.map((match, index) => toHomeRecommendation(match, fallback.recommendedMatches[index] ?? fallback.featuredMatch))
    : fallback.recommendedMatches;
}

function normalizeNotices(home: V1Home, fallback: HomeViewModel) {
  const notices = Array.isArray(home.notices) ? home.notices : [];
  if (notices.length) return notices.map(toHomeNotice);
  if (home.notice) {
    return [
      {
        id: home.notice.noticeId,
        title: home.notice.title,
        summary: home.notice.pinned ? '고정 공지' : '공지',
        trailing: '공지',
      },
    ];
  }

  return fallback.notices;
}

function normalizeShortcuts(shortcuts: V1HomeShortcut[] | undefined, fallback: HomeQuickAction[]) {
  if (!shortcuts?.length) return fallback;

  return fallback.map((action) => {
    const shortcut = shortcuts.find((item) => item.key === shortcutKeyFromLabel(action.label));
    if (!shortcut) return action;

    return {
      ...action,
      href: shortcut.enabled && shortcut.route ? shortcut.route : undefined,
      disabled: !shortcut.enabled || !shortcut.route,
      sub: shortcut.enabled ? action.sub : disabledReasonLabel(shortcut.disabledReason),
    };
  });
}

function toHomeRecommendation(match: V1HomeRecommendation, fallback: HomeMatchCard): HomeMatchCard {
  return {
    ...fallback,
    id: match.matchId,
    sportLabel: match.sportName,
    title: match.title,
    venue: match.regionName ?? fallback.venue,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    currentParticipants: match.participantCount ?? fallback.currentParticipants,
    maxParticipants: match.capacity ?? fallback.maxParticipants,
    actionLabel: '승인제 신청',
  };
}

function toHomeMatch(match: V1Match, fallback: HomeMatchCard): HomeMatchCard {
  const capacity = parseCapacity(match.capacityText);

  return {
    ...fallback,
    id: match.id,
    sportLabel: match.sportName,
    title: match.title,
    venue: match.placeName,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    currentParticipants: capacity.current,
    maxParticipants: capacity.capacity,
    actionLabel: '승인제 신청',
  };
}

function toHomeNotice(notice: V1Notice): HomeNotice {
  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    title: notice.title,
    summary: notice.body ?? notice.category ?? notice.audience ?? '공지',
    trailing: formatDate(notice.publishedAt),
  };
}

function parseCapacity(text: string) {
  const [current, capacity] = text.match(/\d+/g)?.map(Number) ?? [];
  return {
    current: current ?? 0,
    capacity: capacity ?? Math.max(current ?? 0, 1),
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shortcutKeyFromLabel(label: string): V1HomeShortcut['key'] {
  if (label === '팀매치') return 'team_matches';
  if (label === '팀') return 'teams';
  if (label === '나의 팀') return 'my_team';
  return 'matches';
}

function disabledReasonLabel(reason: string | null) {
  if (reason === 'joined_team_required') return '가입 팀 필요';
  return '준비 중';
}

function trustStateLabel(value: string) {
  if (value === 'verified') return '검증됨';
  if (value === 'estimated') return '추정';
  if (value === 'sample') return '샘플';
  return '신뢰 정보 없음';
}
