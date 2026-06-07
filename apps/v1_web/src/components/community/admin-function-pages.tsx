import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, PageHeader } from '@/components/v1-ui/primitives';
import { AdminErrorPanel } from './admin-error';
import { AdminFunctionLoading } from './admin-loading';
import type {
  AdminActionLinkModel,
  AdminFunctionPageModel,
  AdminFunctionRowModel,
  AdminFunctionSideItemModel,
  AdminFunctionStatModel,
} from './admin.types';

type FunctionViewProps = { readonly model: AdminFunctionPageModel; readonly onRetry?: () => void };

export function AdminMatchesPageView(props: FunctionViewProps) {
  return <AdminFunctionPage {...props} />;
}

export function AdminTeamMatchesPageView(props: FunctionViewProps) {
  return <AdminFunctionPage {...props} />;
}

export function AdminTeamsPageView(props: FunctionViewProps) {
  return <AdminFunctionPage {...props} />;
}

export function AdminReviewsPageView(props: FunctionViewProps) {
  return <AdminFunctionPage {...props} />;
}

export function AdminNotificationsPageView(props: FunctionViewProps) {
  return <AdminFunctionPage {...props} />;
}

function AdminFunctionPage({ model, onRetry }: FunctionViewProps) {
  return (
    <AppChrome title={model.title} desktopNav="admin" adminActiveTab={model.activeTab} bottomNav={false} showSearch={false} showNotifications wide>
      <div className="tm-admin-shell tm-admin-function-shell tm-admin-desktop-workbench" data-testid={model.testId}>
        <div className="tm-admin-domain">
          <PageHeader
            eyebrow={model.eyebrow}
            title={model.title}
            description={model.description}
            action={<AdminFunctionActions actions={model.primaryActions} />}
          />
          {model.state === 'error' ? <AdminErrorPanel message={model.errorMessage} onRetry={onRetry} /> : model.state === 'loading' ? (
            <AdminFunctionLoading model={model} />
          ) : (
            <>
              <section className="tm-admin-kpi-grid" aria-label={`${model.title} 요약`}>
                {model.stats.map((stat) => <AdminFunctionStat key={stat.id} stat={stat} />)}
              </section>
              <section className="tm-admin-function-layout">
                <Card className="tm-admin-function-table-card" pad={0}>
                  <div className="tm-admin-table-head">
                    <div>
                      <div className="tm-text-body-lg">{model.summaryLabel}</div>
                      <div className="tm-text-caption">{model.summaryDetail}</div>
                    </div>
                    {onRetry ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>새로고침</button> : null}
                  </div>
                  <AdminFunctionTable title={model.title} rows={model.rows} emptyTitle={model.emptyTitle} />
                </Card>
                <aside className="tm-admin-function-rail">
                  <AdminFunctionSide title={model.sideTitle} items={model.sideItems} />
                </aside>
              </section>
            </>
          )}
        </div>
      </div>
    </AppChrome>
  );
}

function AdminFunctionStat({ stat }: { readonly stat: AdminFunctionStatModel }) {
  return (
    <Card className="tm-admin-kpi-card" pad={16}>
      <div className="tm-metric-label">{stat.label}</div>
      <div className="tm-metric-value">{stat.value}</div>
      <div className="tm-metric-delta" data-tone={stat.tone}>{stat.sub}</div>
    </Card>
  );
}

function AdminFunctionActions({ actions }: { readonly actions: readonly AdminActionLinkModel[] }) {
  return <div className="tm-admin-function-actions">{actions.map((action) => <AdminFunctionAction key={action.href} action={action} />)}</div>;
}

function AdminFunctionTable({ title, rows, emptyTitle }: {
  readonly title: string;
  readonly rows: readonly AdminFunctionRowModel[];
  readonly emptyTitle: string;
}) {
  if (rows.length === 0) return <div className="tm-admin-empty">{emptyTitle}</div>;
  return (
    <div className="tm-admin-function-table" role="table" aria-label={`${title} 목록`}>
      <div className="tm-admin-function-table-row tm-admin-function-table-head" role="row">
        <span role="columnheader">업무</span>
        <span role="columnheader">상태</span>
        <span role="columnheader">정보</span>
        <span role="columnheader">작업</span>
      </div>
      {rows.map((row) => <AdminFunctionRow key={row.id} row={row} />)}
    </div>
  );
}

function AdminFunctionRow({ row }: { readonly row: AdminFunctionRowModel }) {
  return (
    <div className="tm-admin-function-table-row" role="row" data-tone={row.tone}>
      <span role="cell">
        <Link className="tm-admin-function-title-link" href={row.href}>{row.title}</Link>
      </span>
      <span role="cell"><span className="tm-admin-status-pill" data-status={row.tone === 'warning' ? 'warning' : 'ready'}>{row.statusLabel}</span></span>
      <span role="cell" className="tm-admin-function-meta">{row.meta}</span>
      <span role="cell" className="tm-admin-function-row-actions">
        {row.actions.map((action) => <AdminFunctionAction key={`${row.id}:${action.href}:${action.label}`} action={action} />)}
      </span>
    </div>
  );
}

function AdminFunctionSide({ title, items }: { readonly title: string; readonly items: readonly AdminFunctionSideItemModel[] }) {
  return (
    <Card className="tm-admin-authority-panel" pad={18}>
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-admin-audit-list">
        {items.map((item) => (
          <Link key={item.id} className="tm-admin-audit-row tm-pressable" href={item.href} data-tone={item.tone}>
            <span>{item.title}</span>
            <span>{item.body}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function AdminFunctionAction({ action }: { readonly action: AdminActionLinkModel }) {
  return (
    <Link
      aria-label={action.ariaLabel}
      className={`tm-btn tm-btn-sm ${action.tone === 'primary' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
      href={action.href}
    >
      {action.label}
    </Link>
  );
}
