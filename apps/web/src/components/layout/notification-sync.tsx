'use client';

import { useEffect } from 'react';
import { useNotifications } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';

export function NotificationSync() {
  const { isAuthenticated } = useAuthStore();
  const setNotifications = useNotificationStore((state) => state.setNotifications);
  const { data } = useNotifications();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!data) return;

    setNotifications(
      data.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      })),
    );
  }, [data, isAuthenticated, setNotifications]);

  return null;
}
