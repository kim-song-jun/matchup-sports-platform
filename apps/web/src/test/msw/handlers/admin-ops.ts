import { http } from 'msw';
import { success } from './_utils';
import type { AdminOpsSummary, RecentPushFailure } from '@/types/admin-ops';
import { mockPayout } from '../../fixtures/admin';

const mockSummary: AdminOpsSummary = {
  matchesInProgress: 12,
  paymentsPending: 3,
  disputesOpen: 2,
  settlementsPending: 17,
  payoutsFailed: 1,
  pushFailures5m: 4,
};

/** Summary with pushFailures5m > 10 to trigger warning tone in UI tests (threshold is strict >). */
export const mockSummaryHighPushFailures: AdminOpsSummary = {
  ...mockSummary,
  pushFailures5m: 11,
};

const mockPushFailures: RecentPushFailure[] = [
  {
    id: 'wpf-1',
    endpointSuffix: 'abc123',
    userIdHash: 'a1b2c3d4',
    statusCode: 500,
    errorCode: 'InternalServerError',
    occurredAt: '2026-04-19T09:00:00.000Z',
    acknowledgedAt: null,
  },
  {
    id: 'wpf-2',
    endpointSuffix: 'def456',
    userIdHash: 'e5f6a7b8',
    statusCode: 410,
    errorCode: 'UnsubscribeExpired',
    occurredAt: '2026-04-19T09:01:00.000Z',
    acknowledgedAt: null,
  },
  {
    id: 'wpf-3',
    endpointSuffix: 'ghi789',
    userIdHash: 'c9d0e1f2',
    statusCode: 500,
    errorCode: null,
    occurredAt: '2026-04-19T09:02:00.000Z',
    acknowledgedAt: '2026-04-19T09:03:00.000Z',
  },
  {
    id: 'wpf-4',
    endpointSuffix: 'jkl012',
    userIdHash: 'a3b4c5d6',
    statusCode: 500,
    errorCode: 'ServiceUnavailable',
    occurredAt: '2026-04-19T09:03:30.000Z',
    acknowledgedAt: null,
  },
  {
    id: 'wpf-5',
    endpointSuffix: 'mno345',
    userIdHash: 'e7f8a9b0',
    statusCode: 429,
    errorCode: 'TooManyRequests',
    occurredAt: '2026-04-19T09:04:00.000Z',
    acknowledgedAt: null,
  },
];

export const adminOpsHandlers = [
  http.get('/api/v1/admin/ops/summary', () => {
    return success(mockSummary);
  }),

  http.get('/api/v1/admin/ops/recent-push-failures', () => {
    return success(mockPushFailures);
  }),

  http.post('/api/v1/admin/ops/push-failures/ack', () => {
    return success({ acknowledged: 4 });
  }),

  http.post('/api/v1/admin/payouts/:id/retry', ({ params }) => {
    return success({
      ...mockPayout,
      id: params.id as string,
      status: 'cancelled',
      failureReason: null,
      note: '재대기열 복원',
    });
  }),
];
