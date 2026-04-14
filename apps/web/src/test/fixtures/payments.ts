import type { Payment, PreparedPayment } from '@/types/api';

export const mockPayment: Payment = {
  id: 'pay-1',
  amount: 10000,
  method: 'card',
  status: 'completed',
  orderId: 'order-match-1',
  paymentKey: 'toss-key-1',
  paidAt: '2024-01-05T10:00:00.000Z',
  createdAt: '2024-01-05T09:00:00.000Z',
  sourceType: 'match',
  sourceName: '주말 풋살 경기',
};

export const mockPreparedPayment: PreparedPayment = {
  paymentId: 'pay-prep-1',
  orderId: 'order-match-prep-1',
  amount: 10000,
};
