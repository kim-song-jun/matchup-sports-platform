'use client';

import { useCallback, useEffect, useState } from 'react';
import { useV1ChatRooms, useV1Home } from '@/hooks/use-v1-api';
import { v1Post } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import type { V1ResolveLocationResponse } from '@/types/api';
import { PendingTournamentReviewModal } from '@/components/tournaments/pending-review-modal';
import { HomePageView } from './home-page';
import { toHomeChatRooms, toHomeModel, withoutHomeContent } from './home-client-model';
import type { HomeViewModel } from './home.types';
import { getHomeViewModel } from './home.view-model';

export function HomePageClient() {
  useEffect(() => {
    trackEvent('home_view', {});
  }, []);

  const query = useV1Home();
  const isAuthenticated = query.data?.viewer?.authenticated === true;
  const chatRooms = useV1ChatRooms({ enabled: isAuthenticated });
  const {
    weather,
    permission: weatherPermission,
    refreshing: weatherRefreshing,
    refresh: refreshWeather,
  } = useCurrentLocationWeather();
  const fallback = getHomeViewModel();
  const chatUnreadCount = chatRooms.data?.items.reduce((sum, room) => sum + room.unreadCount, 0) ?? 0;
  const chatStatus: HomeViewModel['chatStatus'] = !isAuthenticated ? 'ready' : chatRooms.isPending ? 'loading' : chatRooms.isError ? 'error' : 'ready';
  const chatRoomSummaries = chatRooms.data?.items ? toHomeChatRooms(chatRooms.data.items) : [];
  const nonDataFallback = withoutHomeContent(fallback);

  if (query.isError) {
    return (
      <>
        <PendingTournamentReviewModal />
        <HomePageView
          model={{
            ...nonDataFallback,
            network: true,
            hasNewNotification: false,
            chatUnreadCount,
            chatStatus,
            chatRooms: chatRoomSummaries,
            weather: weather ?? fallback.weather,
            weatherPermission,
            weatherRefreshing,
            refreshWeather,
            retry: () => void query.refetch(),
          }}
        />
      </>
    );
  }

  return (
    <>
      <PendingTournamentReviewModal />
      <HomePageView
        model={
          query.data
            ? {
                ...toHomeModel(query.data, fallback, () => void query.refetch(), chatUnreadCount, weather),
                chatStatus,
                chatRooms: chatRoomSummaries,
                weatherPermission,
                weatherRefreshing,
                refreshWeather,
              }
            : { ...nonDataFallback, chatUnreadCount, chatStatus, chatRooms: chatRoomSummaries, weather: weather ?? fallback.weather, weatherPermission, weatherRefreshing, refreshWeather }
        }
      />
    </>
  );
}

function useCurrentLocationWeather() {
  const [weather, setWeather] = useState<HomeViewModel['weather'] | null>(null);
  const [permission, setPermission] = useState<NonNullable<HomeViewModel['weatherPermission']>>('checking');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      return;
    }

    if (!navigator.permissions?.query) {
      setPermission('prompt');
      return;
    }

    let active = true;
    let status: PermissionStatus | null = null;
    const syncPermission = () => {
      if (!active || !status) return;
      setPermission(status.state);
      if (status.state === 'denied') setWeather(null);
    };

    void navigator.permissions.query({ name: 'geolocation' }).then((nextStatus) => {
      if (!active) return;
      status = nextStatus;
      syncPermission();
      status.addEventListener('change', syncPermission);
    }).catch(() => {
      if (active) setPermission('prompt');
    });

    return () => {
      active = false;
      status?.removeEventListener('change', syncPermission);
    };
  }, []);

  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported');
      return () => undefined;
    }

    let cancelled = false;

    setRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setPermission('granted');
        try {
          const { latitude, longitude } = position.coords;
          const params = new URLSearchParams({
            latitude: latitude.toFixed(2),
            longitude: longitude.toFixed(2),
            current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
            wind_speed_unit: 'ms',
            timezone: 'auto',
          });
          const [weatherResult, regionResult] = await Promise.allSettled([
            fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`),
            v1Post<V1ResolveLocationResponse>('/master/regions/resolve-location', {
              latitude,
              longitude,
              locationConsentAccepted: true,
            }),
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
      (error) => {
        if (!cancelled) {
          if (error.code === error.PERMISSION_DENIED) {
            setPermission('denied');
            setWeather(null);
          }
          setRefreshing(false);
        }
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 8000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    weather: weather ?? getIdleWeather(permission),
    permission,
    refreshing,
    refresh: () => void refresh(),
  };
}

function getIdleWeather(permission: NonNullable<HomeViewModel['weatherPermission']>): HomeViewModel['weather'] {
  if (permission === 'denied') return { city: '내 위치', temp: '-', cond: '위치 사용이 꺼져 있어요', wind: '-' };
  if (permission === 'unsupported') return { city: '내 위치', temp: '-', cond: '위치 기능을 지원하지 않아요', wind: '-' };
  if (permission === 'granted') return { city: '내 위치', temp: '-', cond: '날씨를 확인해 주세요', wind: '-' };
  return { city: '내 위치', temp: '-', cond: '위치 확인이 필요해요', wind: '-' };
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
