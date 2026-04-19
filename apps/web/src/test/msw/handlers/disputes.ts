import { http } from 'msw';
import { success, cursorPaged } from './_utils';
import { mockDispute, mockTeamMatchDispute } from '../../fixtures/admin';

// Inline event mock — shape matches DisputeEvent (DisputeMessage serialized with body→message alias).
const mockDisputeEvent = {
  id: 'event-1',
  disputeId: mockDispute.id,
  actorUserId: 'user-2',
  actorRole: 'buyer' as const,
  message: '상품 상태가 설명과 다릅니다.',
  attachmentUrls: [] as string[],
  createdAt: '2024-01-10T11:00:00.000Z',
};

export const disputesHandlers = [
  // Buyer/seller — my disputes
  http.get('/api/v1/disputes/me', () => {
    return cursorPaged([mockDispute, mockTeamMatchDispute]);
  }),

  // Dispute detail — includes buyer/seller relations + events
  http.get('/api/v1/disputes/:id', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      events: [mockDisputeEvent],
    });
  }),

  // Seller responds — status transitions filed → seller_responded
  http.post('/api/v1/disputes/:id/respond', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'seller_responded',
      events: [mockDisputeEvent],
    });
  }),

  // Add message (buyer or seller) — returns the new DisputeEvent
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
      resolution: '구매자 자발 철회',
      resolvedAt: new Date().toISOString(),
      events: [],
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

  // Admin — mark reviewing (filed → admin_reviewing)
  http.post('/api/v1/admin/disputes/:id/review', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'admin_reviewing',
      events: [],
    });
  }),

  // Admin — resolve dispute
  http.patch('/api/v1/admin/disputes/:id/resolve', ({ params }) => {
    return success({
      ...mockDispute,
      id: params.id as string,
      status: 'resolved_release',
      resolution: '판매자 주장 인정',
      resolvedAt: new Date().toISOString(),
      resolvedByAdminId: 'admin-1',
      events: [],
    });
  }),
];
