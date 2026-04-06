import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  type: 'match' | 'team' | 'chat' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

interface NotificationState {
  notifications: NotificationItem[];
  getUnreadCount: () => number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // Notifications are served via useNotifications() / useUnreadCount() React Query hooks.
  // This store acts as a realtime event buffer (populated by useNotificationSocket).
  notifications: [],

  getUnreadCount: () => {
    return get().notifications.filter(n => !n.isRead && n.type !== 'chat').length;
  },

  markAsRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }));
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, isRead: true })),
    }));
  },
}));
