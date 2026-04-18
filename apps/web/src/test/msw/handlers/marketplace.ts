import { http } from 'msw';
import { success, paged, cursorPaged } from './_utils';
import { mockListing, mockOrder, mockOrderShipped, mockOrderDelivered } from '../../fixtures/marketplace';
import { mockDispute } from '../../fixtures/admin';

export const marketplaceHandlers = [
  http.get('/api/v1/marketplace/listings', () => {
    return paged([mockListing]);
  }),

  http.post('/api/v1/marketplace/listings', () => {
    return success(mockListing);
  }),

  http.get('/api/v1/marketplace/listings/:id', ({ params }) => {
    return success({ ...mockListing, id: params.id as string });
  }),

  http.patch('/api/v1/marketplace/listings/:id', ({ params }) => {
    return success({ ...mockListing, id: params.id as string });
  }),

  http.delete('/api/v1/marketplace/listings/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),

  http.post('/api/v1/marketplace/listings/:id/order', ({ params }) => {
    return success({ ...mockOrder, listingId: params.id as string });
  }),

  // Order lifecycle
  http.get('/api/v1/marketplace/orders/me', () => {
    return cursorPaged([mockOrder, mockOrderShipped, mockOrderDelivered]);
  }),

  http.get('/api/v1/marketplace/orders/:id', ({ params }) => {
    return success({ ...mockOrder, id: params.id as string });
  }),

  http.post('/api/v1/marketplace/orders/:id/ship', ({ params }) => {
    return success({ ...mockOrderShipped, id: params.id as string });
  }),

  http.post('/api/v1/marketplace/orders/:id/deliver', ({ params }) => {
    return success({ ...mockOrderDelivered, id: params.id as string });
  }),

  http.post('/api/v1/marketplace/orders/:id/confirm-receipt', ({ params }) => {
    return success({ ...mockOrder, id: params.id as string, status: 'completed' });
  }),

  http.post('/api/v1/marketplace/orders/:id/dispute', ({ params }) => {
    return success({ ...mockDispute, orderId: params.id as string });
  }),

  // PG confirm (existing — keep for compat)
  http.post('/api/v1/marketplace/orders/:id/confirm', ({ params }) => {
    return success({ ...mockOrder, id: params.id as string, status: 'paid' });
  }),
];
