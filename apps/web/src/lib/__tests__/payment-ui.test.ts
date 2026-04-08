import { describe, expect, it } from 'vitest';
import type { Payment } from '@/types/api';
import { buildScheduledAt, getPaymentSource } from '../payment-ui';

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
