import { http } from 'msw';
import { success, paged } from './_utils';
import { mockListing, mockOrder } from '../../fixtures/marketplace';

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

  http.post('/api/v1/marketplace/listings/:id/order', ({ params }) => {
    return success({ ...mockOrder, listingId: params.id as string });
  }),
];
