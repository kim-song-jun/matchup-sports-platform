import { NotificationType } from '@prisma/client';
import {
  notificationCategory,
  notificationLink,
  notificationCtaLabel,
  presentNotification,
} from './notification-presentation';

describe('notificationCategory', () => {
  it('returns payment for marketplace_payout_paid', () => {
    expect(notificationCategory(NotificationType.marketplace_payout_paid)).toBe('payment');
  });
});

describe('notificationLink', () => {
  it('returns /my/orders for marketplace_payout_paid', () => {
    expect(notificationLink(NotificationType.marketplace_payout_paid, null)).toBe('/my/orders');
  });

  it('respects explicit link override in data', () => {
    expect(
      notificationLink(NotificationType.marketplace_payout_paid, { link: '/settings/payouts' }),
    ).toBe('/settings/payouts');
  });
});

describe('notificationCtaLabel', () => {
  it('returns 정산 내역 보기 for marketplace_payout_paid', () => {
    expect(notificationCtaLabel(NotificationType.marketplace_payout_paid)).toBe('정산 내역 보기');
  });
});

describe('presentNotification', () => {
  it('produces non-null link and ctaLabel for marketplace_payout_paid', () => {
    const result = presentNotification({
      id: 'n1',
      type: NotificationType.marketplace_payout_paid,
      title: '정산 완료',
      body: '정산이 완료되었어요.',
      isRead: false,
      createdAt: new Date(),
      data: {},
    });

    expect(result.link).toBe('/my/orders');
    expect(result.ctaLabel).toBe('정산 내역 보기');
    expect(result.category).toBe('payment');
  });
});
