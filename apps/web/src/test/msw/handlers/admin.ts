import { http } from 'msw';
import { success, paged, cursorPaged } from './_utils';
import { mockLesson } from '../../fixtures/lessons';
import { mockTeam1 } from '../../fixtures/teams';
import { mockVenue } from '../../fixtures/venues';
import { mockPayment } from '../../fixtures/payments';
import { mockAdminStats, mockSettlement, mockDispute, mockPayout, mockEligibleSettlement } from '../../fixtures/admin';
import { mockOrder } from '../../fixtures/marketplace';

export const adminHandlers = [
  http.get('/api/v1/admin/stats', () => {
    return success(mockAdminStats);
  }),

  http.get('/api/v1/admin/statistics', () => {
    return success({
      periodLabel: '2024년 1월',
      matchTrend: [{ month: '2024-01', count: 50 }],
      revenueTrend: [{ month: '2024-01', revenue: 500000 }],
      sportDistribution: [{ sport: 'soccer', count: 30 }],
      topVenues: [],
      userGrowth: { totalUsers: 1000, thisMonth: 50, lastMonth: 40, growthRate: 25, activeUsers: 800, teamCount: 150 },
    });
  }),

  http.get('/api/v1/admin/users', () => {
    return paged([]);
  }),

  http.get('/api/v1/admin/users/:id', ({ params }) => {
    return success({ id: params.id as string, nickname: '테스트유저', email: 'test@example.com', role: 'user', status: 'active' });
  }),

  http.post('/api/v1/admin/users/:id/warn', ({ params }) => {
    return success({ userId: params.id as string, warned: true });
  }),

  http.patch('/api/v1/admin/users/:id/status', ({ params }) => {
    return success({ userId: params.id as string, status: 'suspended' });
  }),

  http.get('/api/v1/admin/matches', () => {
    return paged([]);
  }),

  http.patch('/api/v1/admin/matches/:id/status', ({ params }) => {
    return success({ id: params.id as string, status: 'cancelled' });
  }),

  http.get('/api/v1/admin/reviews', () => {
    return success([]);
  }),

  http.get('/api/v1/admin/mercenary', () => {
    return paged([]);
  }),

  http.delete('/api/v1/admin/mercenary/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),

  http.get('/api/v1/admin/lessons', () => {
    return paged([mockLesson]);
  }),

  http.post('/api/v1/admin/lessons', () => {
    return success(mockLesson);
  }),

  http.patch('/api/v1/admin/lessons/:id/status', ({ params }) => {
    return success({ id: params.id as string, status: 'cancelled' });
  }),

  http.get('/api/v1/admin/teams', () => {
    return paged([mockTeam1]);
  }),

  http.get('/api/v1/admin/teams/:id', ({ params }) => {
    return success({ ...mockTeam1, id: params.id as string });
  }),

  http.post('/api/v1/admin/teams', () => {
    return success(mockTeam1);
  }),

  http.get('/api/v1/admin/venues', () => {
    return paged([mockVenue]);
  }),

  http.get('/api/v1/admin/venues/:id', ({ params }) => {
    return success({ ...mockVenue, id: params.id as string });
  }),

  http.post('/api/v1/admin/venues', () => {
    return success(mockVenue);
  }),

  http.patch('/api/v1/admin/venues/:id', ({ params }) => {
    return success({ ...mockVenue, id: params.id as string });
  }),

  http.delete('/api/v1/admin/venues/:id', ({ params }) => {
    return success({ id: params.id as string });
  }),

  // GET /admin/payments returns paginated shape (Phase 3 change)
  http.get('/api/v1/admin/payments', () => {
    return success({ items: [mockPayment], nextCursor: null });
  }),

  // Settlements
  http.get('/api/v1/admin/settlements', () => {
    return paged([mockSettlement]);
  }),

  http.get('/api/v1/admin/settlements/summary', () => {
    return success({
      total: 500000,
      commission: 50000,
      pending: 200000,
      refunded: 0,
      processedCount: 8,
      pendingCount: 3,
      refundedCount: 0,
      failedCount: 0,
    });
  }),

  http.patch('/api/v1/admin/settlements/:id/process', ({ params }) => {
    return success({ ...mockSettlement, id: params.id as string, status: 'completed' });
  }),

  // Disputes — NOTE: POST /admin/disputes and PATCH /admin/disputes/:id/status REMOVED (Task 70 §2.2).
  // These endpoints are handled by disputesHandlers in disputes.ts.
  // admin.ts only owns the force-release and payout handlers below.

  // Admin force-release order (ops tool for auto-release retry)
  http.post('/api/v1/admin/orders/:id/force-release', ({ params }) => {
    return success({ ...mockOrder, id: params.id as string, status: 'auto_released' });
  }),

  // Payouts
  http.get('/api/v1/admin/payouts', () => {
    return cursorPaged([mockPayout]);
  }),

  http.get('/api/v1/admin/payouts/eligible', () => {
    return success([mockEligibleSettlement]);
  }),

  http.post('/api/v1/admin/payouts/batch', () => {
    return success({ batchId: 'batch-uuid-001', payouts: [mockPayout], totalNet: mockPayout.netAmount });
  }),

  http.patch('/api/v1/admin/payouts/:id/mark-paid', ({ params }) => {
    return success({ ...mockPayout, id: params.id as string, status: 'paid', processedAt: new Date().toISOString() });
  }),

  http.patch('/api/v1/admin/payouts/:id/mark-failed', ({ params }) => {
    return success({ ...mockPayout, id: params.id as string, status: 'failed', failureReason: '은행 거절' });
  }),
];
