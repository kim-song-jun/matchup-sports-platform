import { afterEach, describe, expect, it } from 'vitest';
import type { Payment } from '@/types/api';
import {
  buildScheduledAt,
  getCheckoutPaymentMode,
  getPaymentSource,
  getPaymentStatusMeta,
  getRecordedPaymentMode,
} from '../payment-ui';

const originalClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

afterEach(() => {
  if (originalClientKey === undefined) {
    delete process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    return;
  }

  process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY = originalClientKey;
});

describe('buildScheduledAt', () => {
  it('normalizes ISO date strings and hh:mm:ss time strings into a valid local datetime', () => {
    expect(buildScheduledAt('2026-12-18T00:00:00.000Z', '20:00:00')).toBe('2026-12-18T20:00:00');
  });

  it('pads hh:mm inputs with seconds', () => {
    expect(buildScheduledAt('2026-12-18', '20:00')).toBe('2026-12-18T20:00:00');
  });

  it('returns null for malformed date inputs', () => {
    expect(buildScheduledAt('2026/12/18', '20:00')).toBeNull();
  });
});

describe('getPaymentSource', () => {
  it('builds a valid match schedule from normalized payment match fields', () => {
    const payment = {
      id: 'payment-1',
      amount: 12000,
      method: 'card',
      status: 'completed',
      orderId: 'order-1',
      paidAt: '2026-04-08T10:30:00',
      createdAt: '2026-04-08T10:20:00',
      sourceType: 'match',
      participant: {
        id: 'participant-1',
        status: 'confirmed',
        paymentStatus: 'paid',
        match: {
          id: 'match-1',
          title: '금요 풋살',
          sportType: 'futsal',
          matchDate: '2026-12-18T00:00:00.000Z',
          startTime: '20:00:00',
          venue: {
            id: 'venue-1',
            name: '노원 풋살장',
          },
        },
      },
    } satisfies Payment;

    const source = getPaymentSource(payment);

    expect(source.kind).toBe('match');
    expect(source.scheduledAt).toBe('2026-12-18T20:00:00');
    expect(source.venueName).toBe('노원 풋살장');
  });
});

describe('payment mode helpers', () => {
  it('uses mock checkout mode when toss client key is missing', () => {
    delete process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

    expect(getCheckoutPaymentMode().state).toBe('mock');
  });

  it('keeps checkout in mock mode even when a client key exists until a real widget flow is wired', () => {
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY = 'live-client-key';

    expect(getCheckoutPaymentMode().state).toBe('mock');
  });

  it('marks mock provider payments as mock even when a client key exists', () => {
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY = 'live-client-key';

    expect(getRecordedPaymentMode({ pgProvider: 'mock' }).state).toBe('mock');
  });

  it('marks legacy toss payments unavailable when client key is missing', () => {
    delete process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

    expect(getRecordedPaymentMode({ pgProvider: 'toss' }).state).toBe('unavailable');
  });

  it('treats records without provider metadata as unavailable instead of ready', () => {
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY = 'live-client-key';

    expect(getRecordedPaymentMode({ pgProvider: null }).state).toBe('unavailable');
  });

  it('uses explicit mock labels for mock payment statuses', () => {
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY = 'live-client-key';

    expect(getPaymentStatusMeta({ status: 'completed', pgProvider: 'mock' }).label).toBe('테스트 결제 완료');
    expect(getPaymentStatusMeta({ status: 'refunded', pgProvider: 'mock' }).label).toBe('테스트 환불 완료');
  });
});
