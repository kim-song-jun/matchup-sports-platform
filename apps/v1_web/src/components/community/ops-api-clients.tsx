'use client';

import type { ReactElement } from 'react';
import {
  useV1AdminMe,
  useV1OpsAudit,
  useV1OpsDisputeAction,
  useV1OpsDisputes,
  useV1OpsOverview,
  useV1OpsPayments,
  useV1OpsRefundPayment,
  useV1OpsReportAction,
  useV1OpsReports,
  useV1OpsRequestPayout,
  useV1OpsSettlementAction,
  useV1OpsSettlements,
} from '@/hooks/use-v1-api';
import type { V1AdminMe, V1OpsDispute, V1OpsReport, V1PaymentOrder, V1SettlementBatch } from '@/types/api';
import {
  OpsAccessState,
  OpsAuditPage,
  OpsDisputesPage,
  OpsOverviewPage,
  OpsPaymentsPage,
  OpsReportsPage,
  OpsSettlementsPage,
  type OpsActionState,
} from './ops-pages';

type GuardProps = {
  readonly children: (admin: V1AdminMe) => ReactElement;
};

export function OpsOverviewPageClient() {
  return (
    <OpsAccessBoundary>
      {(admin) => <OpsOverviewWithAdmin admin={admin} />}
    </OpsAccessBoundary>
  );
}

export function OpsReportsPageClient() {
  return (
    <OpsAccessBoundary>
      {(admin) => <OpsReportsWithAdmin admin={admin} />}
    </OpsAccessBoundary>
  );
}

export function OpsDisputesPageClient() {
  return (
    <OpsAccessBoundary>
      {(admin) => <OpsDisputesWithAdmin admin={admin} />}
    </OpsAccessBoundary>
  );
}

export function OpsPaymentsPageClient() {
  return (
    <OpsAccessBoundary>
      {(admin) => <OpsPaymentsWithAdmin admin={admin} />}
    </OpsAccessBoundary>
  );
}

export function OpsSettlementsPageClient() {
  return (
    <OpsAccessBoundary>
      {(admin) => <OpsSettlementsWithAdmin admin={admin} />}
    </OpsAccessBoundary>
  );
}

export function OpsAuditPageClient() {
  return (
    <OpsAccessBoundary>
      {() => <OpsAuditWithAdmin />}
    </OpsAccessBoundary>
  );
}

function OpsAccessBoundary({ children }: GuardProps) {
  const admin = useV1AdminMe({ retry: false });
  if (admin.isPending) return <OpsAccessState state="loading" />;
  if (admin.isError) return <OpsAccessState state="forbidden" message={errorMessage(admin.error)} />;
  if (!admin.data || admin.data.status !== 'active') return <OpsAccessState state="forbidden" />;
  return children(admin.data);
}

function OpsOverviewWithAdmin({ admin }: { readonly admin: V1AdminMe }) {
  const overview = useV1OpsOverview();
  return (
    <OpsOverviewPage
      admin={admin}
      overview={overview.data}
      isLoading={overview.isPending}
      errorMessage={overview.isError ? errorMessage(overview.error) : undefined}
      onRetry={() => void overview.refetch()}
    />
  );
}

function OpsReportsWithAdmin({ admin }: { readonly admin: V1AdminMe }) {
  const reports = useV1OpsReports({ limit: 30 });
  const selectedId = reports.data?.items[0]?.reportId ?? '';
  const action = useV1OpsReportAction(selectedId);
  const mutationDisabledReason = supportMutationDisabledReason(admin);
  return (
    <OpsReportsPage
      page={reports.data}
      isLoading={reports.isPending}
      errorMessage={reports.isError ? errorMessage(reports.error) : undefined}
      actionState={opsMutationState(action, '신고 처리 결과가 반영되었습니다.')}
      mutationDisabledReason={mutationDisabledReason}
      onRetry={() => void reports.refetch()}
      onAction={(report: V1OpsReport, actionId, reason) => {
        if (mutationDisabledReason) return;
        if (report.reportId) action.mutate({ action: actionId, reason });
      }}
    />
  );
}

function OpsDisputesWithAdmin({ admin }: { readonly admin: V1AdminMe }) {
  const disputes = useV1OpsDisputes({ limit: 30 });
  const selectedId = disputes.data?.items[0]?.disputeId ?? '';
  const action = useV1OpsDisputeAction(selectedId);
  const mutationDisabledReason = supportMutationDisabledReason(admin);
  return (
    <OpsDisputesPage
      page={disputes.data}
      isLoading={disputes.isPending}
      errorMessage={disputes.isError ? errorMessage(disputes.error) : undefined}
      actionState={opsMutationState(action, '분쟁 처리 결과가 반영되었습니다.')}
      mutationDisabledReason={mutationDisabledReason}
      onRetry={() => void disputes.refetch()}
      onAction={(dispute: V1OpsDispute, actionId, reason) => {
        if (mutationDisabledReason) return;
        if (dispute.disputeId) action.mutate({ action: actionId, reason });
      }}
    />
  );
}

function OpsPaymentsWithAdmin({ admin }: { readonly admin: V1AdminMe }) {
  const payments = useV1OpsPayments({ limit: 30 });
  const selectedId = payments.data?.items[0]?.paymentOrderId ?? '';
  const refund = useV1OpsRefundPayment(selectedId);
  const mutationDisabledReason = supportMutationDisabledReason(admin);
  return (
    <OpsPaymentsPage
      page={payments.data}
      isLoading={payments.isPending}
      errorMessage={payments.isError ? errorMessage(payments.error) : undefined}
      refundState={opsMutationState(refund, '환불 결과가 반영되었습니다.', refund.data?.providerError?.message)}
      mutationDisabledReason={mutationDisabledReason}
      onRetry={() => void payments.refetch()}
      onRefund={(payment: V1PaymentOrder, amount, reason) => {
        if (mutationDisabledReason) return;
        if (payment.paymentOrderId) refund.mutate({ amount, reason });
      }}
    />
  );
}

function OpsSettlementsWithAdmin({ admin }: { readonly admin: V1AdminMe }) {
  const settlements = useV1OpsSettlements({ limit: 30 });
  const selectedId = settlements.data?.items[0]?.settlementBatchId ?? '';
  const action = useV1OpsSettlementAction(selectedId);
  const payout = useV1OpsRequestPayout(selectedId);
  const mutationDisabledReason = supportMutationDisabledReason(admin);
  return (
    <OpsSettlementsPage
      page={settlements.data}
      isLoading={settlements.isPending}
      errorMessage={settlements.isError ? errorMessage(settlements.error) : undefined}
      actionState={opsMutationState(action, '정산 상태가 반영되었습니다.')}
      payoutState={opsMutationState(payout, '지급 요청 결과가 반영되었습니다.', payout.data?.providerError?.message)}
      mutationDisabledReason={mutationDisabledReason}
      onRetry={() => void settlements.refetch()}
      onAction={(settlement: V1SettlementBatch, actionId, reason) => {
        if (mutationDisabledReason) return;
        if (settlement.settlementBatchId) action.mutate({ action: actionId, reason });
      }}
      onPayout={(settlement: V1SettlementBatch, reason) => {
        if (mutationDisabledReason) return;
        if (settlement.settlementBatchId) payout.mutate({ reason });
      }}
    />
  );
}

function OpsAuditWithAdmin() {
  const audit = useV1OpsAudit({ limit: 30 });
  return (
    <OpsAuditPage
      audit={audit.data}
      isLoading={audit.isPending}
      errorMessage={audit.isError ? errorMessage(audit.error) : undefined}
      onRetry={() => void audit.refetch()}
    />
  );
}

export function opsMutationState(
  mutation: { isPending: boolean; isSuccess: boolean; error: unknown },
  successMessage: string,
  providerErrorMessage?: string,
): OpsActionState {
  const failureMessage = providerErrorMessage ?? (mutation.error ? errorMessage(mutation.error) : undefined);
  return {
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess && !failureMessage,
    errorMessage: failureMessage,
    successMessage,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed';
}

function supportMutationDisabledReason(admin: V1AdminMe) {
  return admin.adminRole === 'support' ? 'support 관리자는 큐와 감사 이력을 읽을 수 있지만 보호된 운영 액션은 owner 또는 ops 관리자만 처리할 수 있습니다.' : undefined;
}
