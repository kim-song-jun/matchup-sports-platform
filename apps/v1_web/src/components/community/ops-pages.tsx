'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { AppChrome, type V1OpsNavTab } from '@/components/v1-ui/shell';
import { Card, PageHeader } from '@/components/v1-ui/primitives';
import type {
  CursorPage,
  V1AdminMe,
  V1OpsAudit,
  V1OpsCaseEvent,
  V1OpsDispute,
  V1OpsOverview,
  V1OpsReport,
  V1PaymentOrder,
  V1SettlementBatch,
} from '@/types/api';

export function OpsFrame({
  title,
  active,
  children,
}: {
  readonly title: string;
  readonly active: V1OpsNavTab;
  readonly children: ReactNode;
}) {
  return (
    <AppChrome title={title} desktopNav="ops" opsActiveTab={active} bottomNav={false} showSearch={false} showNotifications={false} wide>
      <div className="tm-ops-shell tm-ops-open-design tm-operations-template" data-testid={`ops-${active}-open-design`}>
        <div className="tm-ops-domain">{children}</div>
      </div>
    </AppChrome>
  );
}

export function OpsAccessState({ state, message }: { readonly state: 'loading' | 'forbidden' | 'error'; readonly message?: string }) {
  const copy = state === 'loading'
    ? { title: '권한 확인 중', body: '운영 콘솔 권한을 확인하고 있습니다.' }
    : state === 'forbidden'
      ? { title: '접근 권한 없음', body: message ?? '활성 Teameet 관리자만 내부 운영 콘솔에 접근할 수 있습니다.' }
      : { title: '운영 콘솔 오류', body: message ?? '운영 권한 또는 네트워크 상태를 확인해 주세요.' };
  return (
    <OpsFrame title="내부 운영" active="overview">
      <Card className="tm-ops-state" pad={24}>
        <div className="tm-text-body-lg">{copy.title}</div>
        <p>{copy.body}</p>
      </Card>
    </OpsFrame>
  );
}

export function OpsOverviewPage({
  admin,
  overview,
  isLoading,
  errorMessage,
  onRetry,
}: {
  readonly admin: V1AdminMe;
  readonly overview?: V1OpsOverview;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly onRetry: () => void;
}) {
  return (
    <OpsFrame title="내부 운영" active="overview">
      <PageHeader
        eyebrow="운영 콘솔"
        title="상황판"
        description={`${admin.adminRole} · ${admin.status}`}
        action={<button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>새로고침</button>}
      />
      {errorMessage ? <OpsError message={errorMessage} /> : null}
      <section className="tm-ops-kpi-grid" aria-label="운영 큐 요약" aria-busy={isLoading}>
        <OpsKpi label="신고" value={overview?.queues.openReports ?? 0} tone="warning" />
        <OpsKpi label="분쟁" value={overview?.queues.activeDisputes ?? 0} tone="danger" />
        <OpsKpi label="결제 확인" value={overview?.queues.pendingPayments ?? 0} tone="warning" />
        <OpsKpi label="환불 요청" value={overview?.queues.refundRequests ?? 0} tone="warning" />
        <OpsKpi label="정산 검토" value={overview?.queues.settlementReviews ?? 0} tone="ready" />
        <OpsKpi label="지급 실패" value={overview?.queues.payoutFailures ?? 0} tone="danger" />
      </section>
      <Card className="tm-ops-panel" pad={0}>
        <OpsPanelHeader title="최근 이벤트" sub="케이스 처리 이력" />
        <OpsEventList events={overview?.recentEvents ?? []} />
      </Card>
    </OpsFrame>
  );
}

export function OpsReportsPage(props: {
  readonly page?: CursorPage<V1OpsReport>;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly actionState: OpsActionState;
  readonly mutationDisabledReason?: string;
  readonly onAction: (report: V1OpsReport, action: 'review' | 'resolve' | 'dismiss', reason: string) => void;
  readonly onRetry: () => void;
}) {
  const selected = props.page?.items[0] ?? null;
  return (
    <OpsQueueFrame active="reports" title="신고" description="신고 큐">
      <OpsQueueLayout
        title="신고 목록"
        rows={(props.page?.items ?? []).map((item) => ({
          id: item.reportId,
          title: `${targetLabel(item.targetType)} · ${item.reason}`,
          status: item.status,
          meta: item.description ?? item.targetId,
          amount: `우선순위 ${item.priority}`,
          tone: item.status === 'open' || item.status === 'reviewing' ? 'warning' : 'ready',
        }))}
        isLoading={props.isLoading}
        errorMessage={props.errorMessage}
        onRetry={props.onRetry}
        aside={selected ? (
          <OpsReasonActionPanel
            title="신고 처리"
            target={selected.reportId}
            actions={[
              { id: 'review', label: '검토 전환' },
              { id: 'resolve', label: '해결' },
              { id: 'dismiss', label: '기각' },
            ]}
            state={props.actionState}
            disabledReason={props.mutationDisabledReason}
            onSubmit={(action, reason) => props.onAction(selected, action as 'review' | 'resolve' | 'dismiss', reason)}
          />
        ) : <OpsEmptyAside />}
      />
    </OpsQueueFrame>
  );
}

export function OpsDisputesPage(props: {
  readonly page?: CursorPage<V1OpsDispute>;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly actionState: OpsActionState;
  readonly mutationDisabledReason?: string;
  readonly onAction: (dispute: V1OpsDispute, action: 'assign' | 'wait' | 'resolve' | 'reject', reason: string) => void;
  readonly onRetry: () => void;
}) {
  const selected = props.page?.items[0] ?? null;
  return (
    <OpsQueueFrame active="disputes" title="분쟁" description="분쟁 큐">
      <OpsQueueLayout
        title="분쟁 목록"
        rows={(props.page?.items ?? []).map((item) => ({
          id: item.disputeId,
          title: item.title,
          status: item.status,
          meta: item.description ?? `${targetLabel(item.targetType)} ${item.targetId}`,
          amount: item.amount ? money(item.amount, item.currency) : item.reason,
          tone: item.status === 'resolved' || item.status === 'rejected' ? 'ready' : 'danger',
        }))}
        isLoading={props.isLoading}
        errorMessage={props.errorMessage}
        onRetry={props.onRetry}
        aside={selected ? (
          <OpsReasonActionPanel
            title="분쟁 처리"
            target={selected.disputeId}
            actions={[
              { id: 'assign', label: '배정' },
              { id: 'wait', label: '자료 요청' },
              { id: 'resolve', label: '해결' },
              { id: 'reject', label: '반려' },
            ]}
            state={props.actionState}
            disabledReason={props.mutationDisabledReason}
            onSubmit={(action, reason) => props.onAction(selected, action as 'assign' | 'wait' | 'resolve' | 'reject', reason)}
          />
        ) : <OpsEmptyAside />}
      />
    </OpsQueueFrame>
  );
}

export function OpsPaymentsPage(props: {
  readonly page?: CursorPage<V1PaymentOrder>;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly refundState: OpsActionState;
  readonly mutationDisabledReason?: string;
  readonly onRefund: (payment: V1PaymentOrder, amount: number, reason: string) => void;
  readonly onRetry: () => void;
}) {
  const selected = props.page?.items[0] ?? null;
  return (
    <OpsQueueFrame active="payments" title="결제·환불" description="결제 승인과 환불 상태">
      <OpsQueueLayout
        title="결제 목록"
        rows={(props.page?.items ?? []).map((item) => ({
          id: item.paymentOrderId,
          title: item.orderName,
          status: item.status,
          meta: `${item.orderId} · ${targetLabel(item.sourceType)}`,
          amount: money(item.amount, item.currency),
          tone: item.status === 'failed' || item.refunds.some((refund) => refund.status === 'failed') ? 'danger' : item.status === 'pending' ? 'warning' : 'ready',
        }))}
        isLoading={props.isLoading}
        errorMessage={props.errorMessage}
        onRetry={props.onRetry}
        aside={selected ? <OpsRefundPanel payment={selected} state={props.refundState} disabledReason={props.mutationDisabledReason} onRefund={props.onRefund} /> : <OpsEmptyAside />}
      />
    </OpsQueueFrame>
  );
}

export function OpsSettlementsPage(props: {
  readonly page?: CursorPage<V1SettlementBatch>;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly actionState: OpsActionState;
  readonly payoutState: OpsActionState;
  readonly mutationDisabledReason?: string;
  readonly onAction: (settlement: V1SettlementBatch, action: 'review' | 'approve' | 'hold' | 'fail', reason: string) => void;
  readonly onPayout: (settlement: V1SettlementBatch, reason: string) => void;
  readonly onRetry: () => void;
}) {
  const selected = props.page?.items[0] ?? null;
  return (
    <OpsQueueFrame active="settlements" title="정산·지급" description="정산 검토와 지급대행 상태">
      <OpsQueueLayout
        title="정산 목록"
        rows={(props.page?.items ?? []).map((item) => {
          const failedPayout = item.payoutAttempts.find((attempt) => attempt.status === 'failed');
          return {
            id: item.settlementBatchId,
            title: item.batchKey,
            status: item.status,
            meta: failedPayout?.failureCode ?? `${item.itemCount}건 · 미지급 ${money(item.pendingAmount, item.currency)}`,
            amount: money(item.totalAmount, item.currency),
            tone: item.status === 'failed' || failedPayout ? 'danger' : item.status === 'approved' ? 'ready' : 'warning',
          };
        })}
        isLoading={props.isLoading}
        errorMessage={props.errorMessage}
        onRetry={props.onRetry}
        aside={selected ? (
          <OpsSettlementPanel
            settlement={selected}
            actionState={props.actionState}
            payoutState={props.payoutState}
            disabledReason={props.mutationDisabledReason}
            onAction={props.onAction}
            onPayout={props.onPayout}
          />
        ) : <OpsEmptyAside />}
      />
    </OpsQueueFrame>
  );
}

export function OpsAuditPage(props: {
  readonly audit?: V1OpsAudit;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly onRetry: () => void;
}) {
  return (
    <OpsQueueFrame active="audit" title="감사 이력" description="운영 액션과 케이스 이벤트">
      <section className="tm-ops-audit-grid" aria-busy={props.isLoading}>
        <Card className="tm-ops-panel" pad={0}>
          <OpsPanelHeader title="액션 로그" sub={`${props.audit?.actionLogs.length ?? 0}건`} onRetry={props.onRetry} />
          {props.errorMessage ? <OpsError message={props.errorMessage} /> : null}
          <div className="tm-ops-event-list">
            {(props.audit?.actionLogs ?? []).map((log) => (
              <div key={log.actionLogId} className="tm-ops-event-row">
                <strong>{log.actionType}</strong>
                <span>{log.targetType} · {log.reason ?? '사유 없음'}</span>
                <time>{shortDate(log.createdAt)}</time>
              </div>
            ))}
          </div>
        </Card>
        <Card className="tm-ops-panel" pad={0}>
          <OpsPanelHeader title="케이스 이벤트" sub={`${props.audit?.caseEvents.length ?? 0}건`} />
          <OpsEventList events={props.audit?.caseEvents ?? []} />
        </Card>
      </section>
    </OpsQueueFrame>
  );
}

export type OpsActionState = {
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly errorMessage?: string;
  readonly successMessage?: string;
};

function OpsQueueFrame({ active, title, description, children }: {
  readonly active: V1OpsNavTab;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <OpsFrame title={title} active={active}>
      <PageHeader eyebrow="운영 콘솔" title={title} description={description} />
      {children}
    </OpsFrame>
  );
}

function OpsQueueLayout(props: {
  readonly title: string;
  readonly rows: OpsRow[];
  readonly aside: ReactNode;
  readonly isLoading: boolean;
  readonly errorMessage?: string;
  readonly onRetry: () => void;
}) {
  return (
    <section className="tm-ops-queue-layout">
      <Card className="tm-ops-panel" pad={0}>
        <OpsPanelHeader title={props.title} sub={props.isLoading ? 'loading' : `${props.rows.length}건`} onRetry={props.onRetry} />
        {props.errorMessage ? <OpsError message={props.errorMessage} /> : <OpsTable rows={props.rows} isLoading={props.isLoading} />}
      </Card>
      <aside className="tm-ops-side-panel">{props.aside}</aside>
    </section>
  );
}

type OpsRow = {
  id: string;
  title: string;
  status: string;
  meta: string;
  amount: string;
  tone: 'ready' | 'warning' | 'danger';
};

function OpsTable({ rows, isLoading }: { readonly rows: readonly OpsRow[]; readonly isLoading: boolean }) {
  if (isLoading) {
    return <div className="tm-ops-empty" role="status">데이터 로딩 중</div>;
  }
  if (rows.length === 0) return <div className="tm-ops-empty">표시할 항목이 없습니다.</div>;
  return (
    <div className="tm-ops-table" role="table" aria-label="운영 큐">
      <div className="tm-ops-table-row tm-ops-table-head" role="row">
        <span role="columnheader">대상</span>
        <span role="columnheader">상태</span>
        <span role="columnheader">메타</span>
        <span role="columnheader">금액/우선순위</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="tm-ops-table-row" role="row" data-tone={row.tone}>
          <span role="cell"><strong>{row.title}</strong></span>
          <span role="cell"><span className="tm-ops-status-pill" data-tone={row.tone}>{statusLabel(row.status)}</span></span>
          <span role="cell">{row.meta}</span>
          <span role="cell" className="tab-num">{row.amount}</span>
        </div>
      ))}
    </div>
  );
}

function OpsKpi({ label, value, tone }: { readonly label: string; readonly value: number; readonly tone: 'ready' | 'warning' | 'danger' }) {
  return (
    <Card className="tm-ops-kpi" pad={16} style={{ minWidth: 0 }}>
      <span>{label}</span>
      <strong className="tab-num">{value.toLocaleString('ko-KR')}</strong>
      <em data-tone={tone}>{toneLabel(tone)}</em>
    </Card>
  );
}

function OpsPanelHeader({ title, sub, onRetry }: { readonly title: string; readonly sub: string; readonly onRetry?: () => void }) {
  return (
    <div className="tm-ops-panel-head">
      <div>
        <div className="tm-text-body-lg">{title}</div>
        <div className="tm-text-caption">{sub}</div>
      </div>
      {onRetry ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>새로고침</button> : null}
    </div>
  );
}

function OpsReasonActionPanel(props: {
  readonly title: string;
  readonly target: string;
  readonly actions: readonly { id: string; label: string }[];
  readonly state: OpsActionState;
  readonly disabledReason?: string;
  readonly onSubmit: (action: string, reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const blocked = Boolean(props.disabledReason);
  return (
    <Card className="tm-ops-panel tm-ops-action-panel" pad={18}>
      <div className="tm-text-body-lg">{props.title}</div>
      <div className="tm-text-caption">{props.target}</div>
      <textarea aria-label={`${props.title} 사유`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="처리 사유" />
      <div className="tm-ops-action-row">
        {props.actions.map((action) => (
          <button
            key={action.id}
            className="tm-btn tm-btn-sm tm-btn-neutral"
            type="button"
            disabled={blocked || props.state.isPending || reason.trim().length === 0}
            onClick={() => props.onSubmit(action.id, reason.trim())}
          >
            {props.state.isPending ? '처리 중' : action.label}
          </button>
        ))}
      </div>
      {props.disabledReason ? <div className="tm-ops-action-feedback" data-tone="warning">{props.disabledReason}</div> : null}
      <OpsActionFeedback state={props.state} />
    </Card>
  );
}

function OpsRefundPanel(props: {
  readonly payment: V1PaymentOrder;
  readonly state: OpsActionState;
  readonly disabledReason?: string;
  readonly onRefund: (payment: V1PaymentOrder, amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState(String(props.payment.amount));
  const [reason, setReason] = useState('');
  return (
    <Card className="tm-ops-panel tm-ops-action-panel" pad={18}>
      <div className="tm-text-body-lg">환불 처리</div>
      <div className="tm-text-caption">{props.payment.orderId} · {props.payment.status}</div>
      <input aria-label="환불 금액" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} />
      <textarea aria-label="환불 사유" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="환불 사유" />
      <button
        className="tm-btn tm-btn-sm tm-btn-primary"
        type="button"
        disabled={Boolean(props.disabledReason) || props.state.isPending || reason.trim().length === 0 || Number(amount) <= 0}
        onClick={() => props.onRefund(props.payment, Number(amount), reason.trim())}
      >
        {props.state.isPending ? '처리 중' : '환불 요청'}
      </button>
      {props.disabledReason ? <div className="tm-ops-action-feedback" data-tone="warning">{props.disabledReason}</div> : null}
      <OpsActionFeedback state={props.state} />
    </Card>
  );
}

function OpsSettlementPanel(props: {
  readonly settlement: V1SettlementBatch;
  readonly actionState: OpsActionState;
  readonly payoutState: OpsActionState;
  readonly disabledReason?: string;
  readonly onAction: (settlement: V1SettlementBatch, action: 'review' | 'approve' | 'hold' | 'fail', reason: string) => void;
  readonly onPayout: (settlement: V1SettlementBatch, reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const blocked = Boolean(props.disabledReason);
  return (
    <Card className="tm-ops-panel tm-ops-action-panel" pad={18}>
      <div className="tm-text-body-lg">정산 처리</div>
      <div className="tm-text-caption">{props.settlement.batchKey} · {props.settlement.status}</div>
      <textarea aria-label="정산 처리 사유" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="처리 사유" />
      <div className="tm-ops-action-row">
        {(['review', 'approve', 'hold', 'fail'] as const).map((action) => (
          <button
            key={action}
            className="tm-btn tm-btn-sm tm-btn-neutral"
            type="button"
            disabled={blocked || props.actionState.isPending || reason.trim().length === 0}
            onClick={() => props.onAction(props.settlement, action, reason.trim())}
          >
            {actionLabel(action)}
          </button>
        ))}
      </div>
      <button
        className="tm-btn tm-btn-sm tm-btn-primary"
        type="button"
        disabled={blocked || props.payoutState.isPending || reason.trim().length === 0 || props.settlement.status !== 'approved'}
        onClick={() => props.onPayout(props.settlement, reason.trim())}
      >
        {props.payoutState.isPending ? '요청 중' : '지급 요청'}
      </button>
      {props.disabledReason ? <div className="tm-ops-action-feedback" data-tone="warning">{props.disabledReason}</div> : null}
      <OpsActionFeedback state={props.actionState.errorMessage ? props.actionState : props.payoutState.errorMessage ? props.payoutState : props.actionState.isSuccess ? props.actionState : props.payoutState} />
    </Card>
  );
}

function OpsEventList({ events }: { readonly events: readonly V1OpsCaseEvent[] }) {
  if (events.length === 0) return <div className="tm-ops-empty">이벤트가 없습니다.</div>;
  return (
    <div className="tm-ops-event-list">
      {events.map((event) => (
        <div key={event.caseEventId} className="tm-ops-event-row">
          <strong>{event.eventType}</strong>
          <span>{event.reason ?? `${event.fromStatus ?? '-'} -> ${event.toStatus ?? '-'}`}</span>
          <time>{shortDate(event.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

function OpsActionFeedback({ state }: { readonly state: OpsActionState }) {
  if (state.errorMessage) return <div className="tm-ops-action-feedback" data-tone="danger">{state.errorMessage}</div>;
  if (state.isSuccess) return <div className="tm-ops-action-feedback" data-tone="ready">{state.successMessage ?? '처리 결과가 반영되었습니다.'}</div>;
  return null;
}

function OpsError({ message }: { readonly message: string }) {
  return <div className="tm-ops-error" role="alert">{message}</div>;
}

function OpsEmptyAside() {
  return (
    <Card className="tm-ops-panel" pad={18}>
      <div className="tm-text-body-lg">선택 항목 없음</div>
      <div className="tm-text-caption">처리 가능한 큐 항목이 없습니다.</div>
    </Card>
  );
}

function toneLabel(tone: 'ready' | 'warning' | 'danger') {
  if (tone === 'ready') return '정상';
  if (tone === 'warning') return '확인';
  return '주의';
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    open: '접수',
    reviewing: '검토 중',
    reviewed: '검토 완료',
    resolved: '해결',
    rejected: '기각',
    dismissed: '기각',
    assigned: '배정됨',
    pending: '대기',
    approved: '승인',
    failed: '실패',
    cancelled: '취소',
    refunded: '환불',
    completed: '완료',
    processing: '처리 중',
  };
  return map[status] ?? status;
}

function actionLabel(action: 'review' | 'approve' | 'hold' | 'fail') {
  if (action === 'review') return '검토';
  if (action === 'approve') return '승인';
  if (action === 'hold') return '보류';
  return '실패 처리';
}

function targetLabel(targetType: string) {
  if (targetType === 'match') return '개인 매치';
  if (targetType === 'team_match') return '팀매치';
  if (targetType === 'payment_order') return '결제';
  return targetType;
}

function money(amount: number, currency: string) {
  if (currency === 'KRW') return `${amount.toLocaleString('ko-KR')}원`;
  return `${amount.toLocaleString('ko-KR')} ${currency}`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
