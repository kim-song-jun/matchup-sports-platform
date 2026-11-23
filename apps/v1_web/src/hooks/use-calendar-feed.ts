'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';

/* 폰 기본 캘린더(아이폰·구글) 구독 주소. docs/api/domains/calendar-feed.md */

export type CalendarFeed = {
  connected: boolean;
  /** https 주소 — 구글 캘린더 "URL로 추가"에 붙여 넣는다. */
  feedUrl: string | null;
  /** 같은 주소를 webcal:// 로 — 아이폰에서 누르면 구독 창이 바로 뜬다. */
  webcalUrl: string | null;
  createdAt: string | null;
};

const feedKey = ['v1', 'me', 'calendar-feed'] as const;

export function useCalendarFeed(enabled = true) {
  return useQuery({ queryKey: feedKey, queryFn: () => v1Get<CalendarFeed>('/me/calendar-feed'), enabled, retry: false });
}

function useFeedMutation(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<CalendarFeed>(path),
    onSuccess: (feed) => queryClient.setQueryData(feedKey, feed),
  });
}

export const useConnectCalendarFeed = () => useFeedMutation('/me/calendar-feed');
export const useRegenerateCalendarFeed = () => useFeedMutation('/me/calendar-feed/regenerate');
