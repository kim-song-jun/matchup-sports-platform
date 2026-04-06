import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '../notification-store';
import type { NotificationItem } from '../notification-store';

const makeNotification = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: `notif-${Math.random().toString(36).slice(2, 7)}`,
  type: 'match',
  title: '매치 알림',
  body: '매치가 시작됩니다',
  isRead: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('NotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] });
  });

  it('starts with empty notifications', () => {
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('adds notification via setState', () => {
    const n = makeNotification({ id: 'n1', title: '새 알림' });
    useNotificationStore.setState({ notifications: [n] });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0].title).toBe('새 알림');
  });

  describe('getUnreadCount', () => {
    it('returns 0 when no notifications', () => {
      expect(useNotificationStore.getState().getUnreadCount()).toBe(0);
    });

    it('counts only unread non-chat notifications', () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: 'n1', isRead: false, type: 'match' }),
          makeNotification({ id: 'n2', isRead: false, type: 'team' }),
          makeNotification({ id: 'n3', isRead: true, type: 'match' }),
          makeNotification({ id: 'n4', isRead: false, type: 'chat' }), // chat 제외
        ],
      });
      expect(useNotificationStore.getState().getUnreadCount()).toBe(2);
    });

    it('excludes chat type notifications from count', () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: 'n1', isRead: false, type: 'chat' }),
          makeNotification({ id: 'n2', isRead: false, type: 'chat' }),
        ],
      });
      expect(useNotificationStore.getState().getUnreadCount()).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('marks a single notification as read', () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: 'n1', isRead: false }),
          makeNotification({ id: 'n2', isRead: false }),
        ],
      });

      useNotificationStore.getState().markAsRead('n1');

      const { notifications } = useNotificationStore.getState();
      expect(notifications.find(n => n.id === 'n1')?.isRead).toBe(true);
      expect(notifications.find(n => n.id === 'n2')?.isRead).toBe(false);
    });

    it('does nothing for non-existent id', () => {
      const n = makeNotification({ id: 'n1', isRead: false });
      useNotificationStore.setState({ notifications: [n] });
      useNotificationStore.getState().markAsRead('nonexistent');
      expect(useNotificationStore.getState().notifications[0].isRead).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('marks all notifications as read', () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: 'n1', isRead: false }),
          makeNotification({ id: 'n2', isRead: false }),
          makeNotification({ id: 'n3', isRead: false }),
        ],
      });

      useNotificationStore.getState().markAllAsRead();

      const { notifications } = useNotificationStore.getState();
      expect(notifications.every(n => n.isRead)).toBe(true);
    });

    it('unread count becomes 0 after markAllAsRead', () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: 'n1', isRead: false, type: 'match' }),
          makeNotification({ id: 'n2', isRead: false, type: 'system' }),
        ],
      });

      useNotificationStore.getState().markAllAsRead();
      expect(useNotificationStore.getState().getUnreadCount()).toBe(0);
    });
  });
});
