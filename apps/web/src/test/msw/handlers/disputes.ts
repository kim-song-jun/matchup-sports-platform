import { http } from 'msw';
import { success, cursorPaged } from './_utils';
import { mockDispute, mockTeamMatchDispute } from '../../fixtures/admin';

const mockDisputeEvent = {
  id: 'event-1',
  disputeId: mockDispute.id,
  actorUserId: 'user-2',
  actorRole: 'buyer' as const,
  message: '상품 상태가 설명과 다릅니다.',
  attachmentUrls: [],
  createdAt: '2024-01-10T11:00:00.000Z',
};

export const disputesHandlers = [
  // Buyer/seller — my disputes
  http.get('/api/v1/disputes/me', () => {
    return cursorPaged([mockDispute, mockTeamMatchDispute]);
  }),

  // Dispute detail
  http.get('/api/v1/disputes/:id', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      events: [mockDisputeEvent],
    });
  }),

  // Seller responds
  http.post('/api/v1/disputes/:id/respond', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'seller_responded',
      sellerRespondedAt: new Date().toISOString(),
    });
  }),

  // Add message (buyer or seller)
  http.post('/api/v1/disputes/:id/messages', ({ params }) => {
    return success({
      ...mockDisputeEvent,
      id: `event-${Date.now()}`,
      disputeId: params.id as string,
    });
  }),

  // Buyer withdraws
  http.post('/api/v1/disputes/:id/withdraw', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'withdrawn',
    });
  }),

  // Admin — list disputes
  http.get('/api/v1/admin/disputes', () => {
    return cursorPaged([mockDispute, mockTeamMatchDispute]);
  }),

  // Admin — dispute detail
  http.get('/api/v1/admin/disputes/:id', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      events: [mockDisputeEvent],
    });
  }),

  // Admin — mark reviewing
  http.post('/api/v1/admin/disputes/:id/review', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'admin_reviewing',
      adminReviewingAt: new Date().toISOString(),
    });
  }),

  // Admin — resolve dispute
  http.patch('/api/v1/admin/disputes/:id/resolve', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'resolved_release',
      resolvedAt: new Date().toISOString(),
    });
  }),
];
