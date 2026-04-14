'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  markAllNotificationsReadInList,
  markNotificationReadInList,
  unreadNotificationCount,
} from '@/lib/notification-center';
import type { Notification, NotificationPreference } from '@/types/api';
import { extractData, extractCollection } from './shared';
import { queryKeys } from './query-keys';

// ── Notifications ──
export function useNotifications(isRead?: boolean) {
  const { isAuthenticated } = useAuthStore();
  return useQuery<Notification[]>({
    queryKey: queryKeys.notifications.list(isRead),
    queryFn: async () => {
      const params = isRead !== undefined ? { isRead: String(isRead) } : undefined;
      const res = await api.get('/notifications', { params });
      return extractCollection<Notification>(res);
    },
    enabled: isAuthenticated,
    // Backfill notifications if a realtime event is missed during socket handshakes.
    refetchInterval: isAuthenticated ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useUnreadCount() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<{ count: number }>({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: async () => {
      const res = await api.get('/notifications/unread-count');
      return extractData<{ count: number }>(res);
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchInterval: isAuthenticated ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/notifications/${id}/read`);
      return extractData<Notification>(res);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });

      const previousAll = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(undefined));
      const previousUnread = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false));
      const previousUnreadCount = queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount);

      const nextAll = markNotificationReadInList(previousAll, id);
      const nextUnread = markNotificationReadInList(previousUnread, id)?.filter((notification) => !notification.isRead);
      const countSource = nextAll ?? nextUnread;

      queryClient.setQueryData(queryKeys.notifications.list(undefined), nextAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), nextUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, {
        count: countSource
          ? unreadNotificationCount(countSource)
          : Math.max(0, (previousUnreadCount?.count ?? 0) - 1),
      });

      return {
        previousAll,
        previousUnread,
        previousUnreadCount,
      };
    },
    onError: (_error, _id, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(queryKeys.notifications.list(undefined), context.previousAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), context.previousUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, context.previousUnreadCount);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.patch('/notifications/read-all');
      return extractData<{ count: number }>(res);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });

      const previousAll = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(undefined));
      const previousUnread = queryClient.getQueryData<Notification[]>(queryKeys.notifications.list(false));
      const previousUnreadCount = queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount);

      queryClient.setQueryData(
        queryKeys.notifications.list(undefined),
        markAllNotificationsReadInList(previousAll),
      );
      queryClient.setQueryData(queryKeys.notifications.list(false), []);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, { count: 0 });

      return {
        previousAll,
        previousUnread,
        previousUnreadCount,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(queryKeys.notifications.list(undefined), context.previousAll);
      queryClient.setQueryData(queryKeys.notifications.list(false), context.previousUnread);
      queryClient.setQueryData(queryKeys.notifications.unreadCount, context.previousUnreadCount);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all, refetchType: 'inactive' });
    },
  });
}

// ── Notification Preferences ──
export function useNotificationPreferences() {
  const { isAuthenticated } = useAuthStore();
  return useQuery<NotificationPreference>({
    queryKey: queryKeys.notifications.preferences,
    queryFn: async () => {
      const res = await api.get('/notifications/preferences');
      return extractData<NotificationPreference>(res);
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Pick<NotificationPreference, 'matchEnabled' | 'teamEnabled' | 'chatEnabled' | 'paymentEnabled'>>) => {
      const res = await api.patch('/notifications/preferences', data);
      return extractData<NotificationPreference>(res);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.preferences });
      const previous = queryClient.getQueryData<NotificationPreference>(queryKeys.notifications.preferences);
      if (previous) {
        queryClient.setQueryData(queryKeys.notifications.preferences, { ...previous, ...updates });
      }
      return { previous };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.preferences, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences });
    },
  });
}
