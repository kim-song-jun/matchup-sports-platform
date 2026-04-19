'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AdminOpsSummary, RecentPushFailure, AckPushFailuresResponse } from '@/types/admin-ops';
import type { Payout } from '@/types/payout';
import { extractData } from './shared';
import { extractErrorMessage } from '@/lib/utils';

// ── Query keys (local — not in global queryKeys to keep admin-ops self-contained) ──

const ADMIN_OPS_SUMMARY_KEY = ['admin-ops-summary'] as const;
const ADMIN_PUSH_FAILURES_KEY = ['admin-recent-push-failures'] as const;

// ── GET /admin/ops/summary ──

/**
 * Polls the admin ops KPI summary every 30 seconds.
 * Returns: matchesInProgress, paymentsPending, disputesOpen, settlementsPending,
 *          payoutsFailed, pushFailures5m — all numbers.
 */
export function useAdminOpsSummary() {
  return useQuery<AdminOpsSummary, Error>({
    queryKey: ADMIN_OPS_SUMMARY_KEY,
    queryFn: async () => {
      try {
        const res = await api.get('/admin/ops/summary');
        return extractData<AdminOpsSummary>(res);
      } catch (err) {
        throw new Error(extractErrorMessage(err, '운영 요약 정보를 불러오지 못했어요'));
      }
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ── GET /admin/ops/recent-push-failures ──

/**
 * Fetches the most recent web push failure log entries.
 * Endpoint returns PII-redacted rows (endpointSuffix 6-char, userIdHash sha256 8-char).
 */
export function useRecentPushFailures(limit = 20) {
  return useQuery<RecentPushFailure[], Error>({
    queryKey: [...ADMIN_PUSH_FAILURES_KEY, limit],
    queryFn: async () => {
      try {
        const res = await api.get('/admin/ops/recent-push-failures', { params: { limit } });
        return extractData<RecentPushFailure[]>(res);
      } catch (err) {
        throw new Error(extractErrorMessage(err, '푸시 실패 로그를 불러오지 못했어요'));
      }
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ── POST /admin/ops/push-failures/ack ──

/**
 * Marks the current failure window as acknowledged by the operator.
 * Prevents duplicate alerts from firing within the same 5-minute window.
 * On success: invalidates summary + push-failures queries.
 */
export function useAckPushFailures() {
  const queryClient = useQueryClient();
  return useMutation<AckPushFailuresResponse, Error, { ids?: string[] } | undefined>({
    mutationFn: async (body) => {
      try {
        const res = await api.post('/admin/ops/push-failures/ack', body ?? {});
        return extractData<AckPushFailuresResponse>(res);
      } catch (err) {
        throw new Error(extractErrorMessage(err, '실패 로그 확인 처리에 실패했어요'));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_OPS_SUMMARY_KEY });
      void queryClient.invalidateQueries({ queryKey: ADMIN_PUSH_FAILURES_KEY });
    },
  });
}

// ── POST /admin/payouts/:id/retry ──

/**
 * Retries a failed payout by restoring its linked settlements to payoutId=null
 * and marking the payout as cancelled, returning it to the eligible queue.
 * On success: invalidates admin-payouts + admin-ops-summary queries.
 */
export function useRetryPayout() {
  const queryClient = useQueryClient();
  return useMutation<Payout, Error, string>({
    mutationFn: async (payoutId: string) => {
      try {
        const res = await api.post(`/admin/payouts/${payoutId}/retry`);
        return extractData<Payout>(res);
      } catch (err) {
        throw new Error(extractErrorMessage(err, 'payout 재시도에 실패했어요'));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
      void queryClient.invalidateQueries({ queryKey: ADMIN_OPS_SUMMARY_KEY });
    },
  });
}
