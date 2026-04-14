import { http } from 'msw';
import { success, paged } from './_utils';
import { mockPayment, mockPreparedPayment } from '../../fixtures/payments';

export const paymentsHandlers = [
  http.get('/api/v1/payments/me', () => {
    return paged([mockPayment]);
  }),

  http.post('/api/v1/payments/prepare', () => {
    return success(mockPreparedPayment);
  }),

  http.post('/api/v1/payments/confirm', () => {
    return success({ ...mockPayment, status: 'completed' });
  }),

  http.post('/api/v1/payments/:id/refund', ({ params }) => {
    return success({ ...mockPayment, id: params.id as string, status: 'refunded' });
  }),

  http.post('/api/v1/payments/webhook', () => {
    return success({ received: true });
  }),
];
