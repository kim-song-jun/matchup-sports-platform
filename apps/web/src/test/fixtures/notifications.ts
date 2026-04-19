import type { Notification, NotificationPreference } from '@/types/api';

export const mockNotification: Notification = {
  id: 'notif-1',
  type: 'player_joined',
  title: '새 참가 신청',
  body: '새로운 참가 신청이 도착했어요.',
  isRead: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  data: { matchId: 'match-1' },
  category: 'match',
  link: '/matches/match-1',
  ctaLabel: '매치 보기',
};

export const mockNotificationRead: Notification = {
  ...mockNotification,
  id: 'notif-2',
  isRead: true,
};

export const mockNotificationPreference: NotificationPreference = {
  id: 'pref-1',
  userId: 'user-1',
  matchEnabled: true,
  teamEnabled: true,
  chatEnabled: true,
  paymentEnabled: true,
  teamApplicationEnabled: true,
  matchCompletedEnabled: true,
  eloChangedEnabled: true,
  chatMessageEnabled: true,
  updatedAt: '2024-01-01T00:00:00.000Z',
};
