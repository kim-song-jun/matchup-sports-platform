import { describe, expect, it } from 'vitest';
import type { Notification } from '@/types/api';
import {
  markAllNotificationsReadInList,
  markNotificationReadInList,
  normalizeNotification,
  resolveNotificationLink,
  upsertNotificationList,
} from '../notification-center';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    type: 'match_created',
    title: '매치 등록 완료',
    body: '새 매치를 등록했어요.',
    isRead: false,
    createdAt: '2026-04-08T10:00:00.000Z',
    data: { matchId: 'match-1' },
    category: 'match',
    link: '/matches/match-1',
    ctaLabel: '매치 보기',
    ...overrides,
  };
}

describe('notification-center helpers', () => {
  it('normalizes missing link from notification data', () => {
    const result = normalizeNotification({
      id: 'notification-1',
      type: 'payment_confirmed',
      title: '결제 완료',
      body: '결제가 완료되었습니다.',
      createdAt: '2026-04-08T10:00:00.000Z',
      data: { paymentId: 'payment-1' },
    });

    expect(result.link).toBe('/payments/payment-1');
    expect(result.category).toBe('payment');
    expect(result.isRead).toBe(false);
  });

  it('resolves match links from data payload', () => {
    expect(resolveNotificationLink({
      type: 'player_joined',
      link: null,
      data: { matchId: 'match-2' },
    })).toBe('/matches/match-2');
  });

  it('prepends and deduplicates incoming notifications', () => {
    const current = [
      makeNotification({
        id: 'notification-old',
        createdAt: '2026-04-08T09:00:00.000Z',
      }),
    ];

    const updated = upsertNotificationList(current, {
      id: 'notification-new',
      type: 'player_joined',
      title: '새 참가 신청',
      body: '새로운 참가 신청이 도착했어요.',
      createdAt: '2026-04-08T11:00:00.000Z',
      data: { matchId: 'match-9' },
    });

    expect(updated.map((item) => item.id)).toEqual(['notification-new', 'notification-old']);
    expect(updated[0].link).toBe('/matches/match-9');
  });

  it('marks a single notification as read', () => {
    const current = [
      makeNotification({ id: 'notification-1', isRead: false }),
      makeNotification({ id: 'notification-2', isRead: false, createdAt: '2026-04-08T09:00:00.000Z' }),
    ];

    const updated = markNotificationReadInList(current, 'notification-1');

    expect(updated?.map((item) => item.id)).toEqual(['notification-1', 'notification-2']);
    expect(updated?.find((item) => item.id === 'notification-1')?.isRead).toBe(true);
  });

  it('marks all notifications as read', () => {
    const updated = markAllNotificationsReadInList([
      makeNotification({ id: 'notification-1', isRead: false }),
      makeNotification({ id: 'notification-2', isRead: false }),
    ]);

    expect(updated?.map((item) => item.id)).toEqual(['notification-1', 'notification-2']);
    expect(updated?.every((item) => item.isRead)).toBe(true);
  });
});
