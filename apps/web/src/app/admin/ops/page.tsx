'use client';

import { AlertTriangle } from 'lucide-react';
import { ErrorState } from '@/components/ui/error-state';
import { KpiCard } from '@/components/admin/kpi-card';
import { PushFailureTable } from '@/components/admin/push-failure-table';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';
import {
  useAdminOpsSummary,
  useRecentPushFailures,
  useAckPushFailures,
} from '@/hooks/use-api';

// Task doc C7: threshold is 10 — warn when count >= 10 (inclusive)
const PUSH_WARN_THRESHOLD = 10;

function PushKpiCard({ value, isLoading }: { value: number; isLoading: boolean }) {
  const isWarning = value >= PUSH_WARN_THRESHOLD;
  return (
    <KpiCard
      label="최근 5분 푸시 실패"
      value={value}
      isLoading={isLoading}
      tone={isWarning ? 'warning' : 'default'}
      icon={isWarning ? <AlertTriangle size={18} aria-label="임계치 초과 경고" /> : undefined}
    />
  );
}

export default function AdminOpsPage() {
  const { toast } = useToast();

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useAdminOpsSummary();

  const {
    data: pushFailures,
    isLoading: pushLoading,
  } = useRecentPushFailures(20);

  const ackMutation = useAckPushFailures();

  const handleAck = () => {
    ackMutation.mutate(undefined, {
      onSuccess: () => {
        toast('success', '실패 로그를 확인 처리했어요');
      },
      onError: (err) => {
        toast('error', extractErrorMessage(err, '확인 처리에 실패했어요. 다시 시도해주세요.'));
      },
    });
  };

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">운영 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          30초마다 자동 갱신됩니다
        </p>
      </div>

      {summaryError ? (
        <ErrorState message="운영 지표를 불러오지 못했어요" onRetry={() => void refetchSummary()} />
      ) : (
        <section aria-label="운영 지표 요약">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
            {/* Row 1 */}
            <KpiCard
              label="진행 중 매치"
              value={summary?.matchesInProgress ?? 0}
              href="/admin/matches?status=ongoing"
              isLoading={summaryLoading}
            />
            <KpiCard
              label="대기 결제 (24h)"
              value={summary?.paymentsPending ?? 0}
              isLoading={summaryLoading}
            />
            <KpiCard
              label="열린 분쟁"
              value={summary?.disputesOpen ?? 0}
              href="/admin/disputes?status=admin_reviewing"
              isLoading={summaryLoading}
            />

            {/* Row 2 */}
            <KpiCard
              label="정산 대기"
              value={summary?.settlementsPending ?? 0}
              href="/admin/payouts?status=held"
              isLoading={summaryLoading}
            />
            <KpiCard
              label="실패 payout"
              value={summary?.payoutsFailed ?? 0}
              href="/admin/payouts?status=failed"
              isLoading={summaryLoading}
            />
            <PushKpiCard
              value={summary?.pushFailures5m ?? 0}
              isLoading={summaryLoading}
            />
          </div>
        </section>
      )}

      {/* Recent push failures table */}
      <PushFailureTable
        rows={pushFailures ?? []}
        isLoading={pushLoading}
        onAck={handleAck}
        isAcking={ackMutation.isPending}
      />
    </div>
  );
}
