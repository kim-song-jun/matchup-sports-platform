'use client';

import { useCallback, useEffect, useState } from 'react';
import { useV1ChatRooms, useV1Home } from '@/hooks/use-v1-api';
import { v1Post } from '@/lib/api-client';
import type { V1ChatRoom, V1Home, V1HomeRecommendation, V1HomeShortcut, V1Match, V1Notice, V1Popup, V1ResolveLocationResponse } from '@/types/api';
import { HomePageView } from './home-page';
import type { HomeChatRoom, HomeMatchCard, HomeNotice, HomePopup, HomeQuickAction, HomeStats, HomeViewModel } from './home.types';
import { getHomeViewModel } from './home.view-model';

export function HomePageClient() {
  const query = useV1Home();
  const chatRooms = useV1ChatRooms();
  const { weather, refreshing: weatherRefreshing, refresh: refreshWeather } = useCurrentLocationWeather();
  const fallback = getHomeViewModel();
  const chatUnreadCount = chatRooms.data?.items.reduce((sum, room) => sum + room.unreadCount, 0) ?? 0;
  const chatStatus: HomeViewModel['chatStatus'] = chatRooms.isPending ? 'loading' : chatRooms.isError ? 'error' : 'ready';
  const chatRoomSummaries = chatRooms.data?.items ? toHomeChatRooms(chatRooms.data.items) : [];
  const nonDataFallback = withoutHomeContent(fallback);

  if (query.isError) {
    return (
      <HomePageView
        model={{
          ...nonDataFallback,
          network: true,
          hasNewNotification: false,
          chatUnreadCount,
          chatStatus,
          chatRooms: chatRoomSummaries,
          weather: weather ?? fallback.weather,
          weatherRefreshing,
          refreshWeather,
          retry: () => void query.refetch(),
        }}
      />
    );
  }

  return (
    <HomePageView
      model={
        query.data
          ? {
              ...toHomeModel(query.data, fallback, () => void query.refetch(), chatUnreadCount, weather),
              chatStatus,
              chatRooms: chatRoomSummaries,
              weatherRefreshing,
              refreshWeather,
            }
          : { ...nonDataFallback, chatUnreadCount, chatStatus, chatRooms: chatRoomSummaries, weather: weather ?? fallback.weather, weatherRefreshing, refreshWeather }
      }
    />
  );
}

function withoutHomeContent(model: HomeViewModel): HomeViewModel {
  return {
    ...model,
    featuredMatch: null,
    recommendedMatches: [],
    popup: null,
    notices: [],
  };
}

function toHomeModel(
  home: V1Home,
  fallback: HomeViewModel,
  retry: () => void,
  chatUnreadCount: number,
  weather: HomeViewModel['weather'] | null,
): HomeViewModel {
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
    weather: weather ?? fallback.weather,
    popup: normalizePopup(home.popup),
    notices: normalizeNotices(home),
  };
}

function toHomeChatRooms(rooms: V1ChatRoom[]): HomeChatRoom[] {
  return [...rooms]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return messageTime(b) - messageTime(a);
    })
    .slice(0, 3)
    .map((room) => ({
      id: room.roomId,
      title: room.title,
      typeLabel: room.roomType === 'match' ? '개인매치' : room.roomType === 'team' ? '팀' : '팀매치',
      lastMessage: room.lastMessage?.contentPreview ?? '아직 메시지가 없어요',
      time: formatRelative(room.lastMessage?.sentAt),
      unreadCount: room.unreadCount,
      href: `/chat/${room.roomId}`,
    }));
}

function messageTime(room: V1ChatRoom) {
  const sentAt = room.lastMessage?.sentAt;
  if (!sentAt) return 0;
  const date = new Date(sentAt);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatRelative(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function normalizeStats(home: V1Home, fallback: HomeViewModel): HomeStats {
  const summary = home.summary;
  if (!summary) return fallback.stats;

  const monthlyMatches = summary.monthlyMatches ?? 0;
  const mannerScore = summary.mannerScore;

  return {
    ...fallback.stats,
    monthlyActivity: monthlyMatches,
    monthlyActivitySub: summary.pendingLabel ?? '신청·참가 합산',
    mannerScore: mannerScore === null ? '-' : mannerScore.toFixed(1),
    mannerScoreSub: trustStateLabel(summary.trustState),
    joined: monthlyMatches,
    trustState: trustStateLabel(summary.trustState),
    pending: summary.pendingLabel ?? '대기 없음',
  };
}

function normalizeFeaturedMatch(home: V1Home, recommendedMatches: HomeMatchCard[], fallback: HomeViewModel): HomeMatchCard | null {
  if (!home.featuredMatch) return recommendedMatches[0] ?? null;

  const recommended =
    recommendedMatches.find((match) => match.id === home.featuredMatch?.matchId) ??
    recommendedMatches[0] ??
    fallback.featuredMatch;

  if (!recommended) return null;

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
    : [];
}

function normalizePopup(popup: V1Popup | null | undefined): HomePopup | null {
  if (!popup) return null;

  return {
    id: popup.popupId,
    title: popup.title,
    body: popup.body,
    trailing: popup.publishedAt ? formatDate(popup.publishedAt) : '팝업',
    linkUrl: popup.linkUrl,
    linkLabel: popup.linkLabel,
  };
}

function normalizeNotices(home: V1Home) {
  const notices = Array.isArray(home.notices) ? home.notices : [];
  if (notices.length) return notices.map(toHomeNotice);
  return [];
}

function normalizeShortcuts(shortcuts: V1HomeShortcut[] | undefined, fallback: HomeQuickAction[]) {
  if (!shortcuts?.length) return fallback;

  const fallbackKeys: V1HomeShortcut['key'][] = ['matches', 'team_matches', 'teams', 'my_team'];

  return fallback.map((action, index) => {
    const shortcutKey = action.key ?? fallbackKeys[index] ?? shortcutKeyFromLabel(action.label);
    const shortcut = shortcuts.find((item) => item.key === shortcutKey);
    if (!shortcut) return action;

    return {
      ...action,
      href: shortcut.enabled && shortcut.route ? shortcut.route : undefined,
      disabled: !shortcut.enabled || !shortcut.route,
      sub: shortcut.enabled ? action.sub : disabledReasonLabel(shortcut.disabledReason),
    };
  });
}

function useCurrentLocationWeather() {
  const [weather, setWeather] = useState<HomeViewModel['weather'] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setWeather((current) => current ?? { city: '현재 위치', temp: '-', cond: '위치 권한 필요', wind: '-' });
      return () => undefined;
    }

    let cancelled = false;

    setRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const params = new URLSearchParams({
            latitude: latitude.toFixed(4),
            longitude: longitude.toFixed(4),
            current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
            wind_speed_unit: 'ms',
            timezone: 'auto',
          });
          const [weatherResult, regionResult] = await Promise.allSettled([
            fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`),
            v1Post<V1ResolveLocationResponse>('/master/regions/resolve-location', { latitude, longitude }),
          ]);
          if (weatherResult.status !== 'fulfilled' || !weatherResult.value.ok) {
            const status = weatherResult.status === 'fulfilled' ? weatherResult.value.status : 'unknown';
            throw new Error(`Weather request failed: ${status}`);
          }
          const body = (await weatherResult.value.json()) as OpenMeteoCurrentWeatherResponse;
          const current = body.current;
          if (!current) throw new Error('Weather response missing current conditions');
          const region = regionResult.status === 'fulfilled' ? formatWeatherRegionName(regionResult.value.region) : null;

          if (!cancelled) {
            setWeather({
              city: region ?? '현재 위치',
              temp: Math.round(current.temperature_2m),
              cond: weatherCodeLabel(current.weather_code),
              wind: roundOne(current.wind_speed_10m),
              feelsLike: Math.round(current.apparent_temperature),
              icon: weatherCodeIcon(current.weather_code),
              status: region ? '현재 위치 기준' : '현재 위치 기준 · 지역 확인 전',
            });
          }
        } catch {
          if (!cancelled) {
            setWeather((current) => current ?? { city: '현재 위치', temp: '-', cond: '날씨를 불러오지 못했어요', wind: '-' });
          }
        } finally {
          if (!cancelled) setRefreshing(false);
        }
      },
      () => {
        if (!cancelled) {
          setWeather((current) => current ?? { city: '현재 위치', temp: '-', cond: '위치 권한 필요', wind: '-' });
          setRefreshing(false);
        }
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 8000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { weather, refreshing, refresh: () => void refresh() };
}

type OpenMeteoCurrentWeatherResponse = {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
};

function formatWeatherRegionName(region: V1ResolveLocationResponse['region']) {
  if (!region) return null;
  const parent = region.parent?.name?.trim();
  const name = region.name?.trim();
  if (parent && name && parent !== name) return `${parent} ${name}`;
  return name || parent || null;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function weatherCodeLabel(code: number) {
  if (code === 0) return '맑음';
  if ([1, 2].includes(code)) return '대체로 맑음';
  if (code === 3) return '흐림';
  if ([45, 48].includes(code)) return '안개';
  if ([51, 53, 55, 56, 57].includes(code)) return '이슬비';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '비';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '눈';
  if ([95, 96, 99].includes(code)) return '뇌우';
  return '날씨 정보 없음';
}

function weatherCodeIcon(code: number): NonNullable<HomeViewModel['weather']['icon']> {
  if (code === 0) return 'sun';
  if ([1, 2].includes(code)) return 'cloud-sun';
  if (code === 3) return 'cloud';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return 'cloud';
}

function toHomeRecommendation(match: V1HomeRecommendation, fallback: HomeMatchCard | null): HomeMatchCard {
  const base = fallback ?? emptyMatchCard();
  return {
    ...base,
    id: match.matchId,
    sportLabel: match.sportName,
    title: match.title,
    venue: match.regionName ?? base.venue,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    currentParticipants: match.participantCount ?? base.currentParticipants,
    maxParticipants: match.capacity ?? base.maxParticipants,
    actionLabel: '승인제 신청',
  };
}

function toHomeMatch(match: V1Match, fallback: HomeMatchCard | null): HomeMatchCard {
  const capacity = parseCapacity(match.capacityText);

  return {
    ...(fallback ?? emptyMatchCard()),
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

function emptyMatchCard(): HomeMatchCard {
  return {
    id: '',
    sport: 'match',
    sportLabel: '',
    title: '',
    venue: '',
    date: '',
    time: '',
    currentParticipants: 0,
    maxParticipants: 1,
    actionLabel: '',
    imageUrl: '/mock/generated/team-huddle.webp',
  };
}

function toHomeNotice(notice: V1Notice): HomeNotice {
  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    title: notice.title,
    summary: notice.category ?? notice.audience ?? '공지',
    trailing: formatDate(notice.publishedAt),
    body: notice.body?.trim() || undefined,
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
  if (reason === 'joined_team_required') return '팀에 가입한 뒤 이용할 수 있어요';
  return '현재 이용할 수 없어요';
}

function trustStateLabel(value: string) {
  if (value === 'verified') return '인증 완료';
  if (value === 'estimated') return '누적 중';
  return '-';
}
