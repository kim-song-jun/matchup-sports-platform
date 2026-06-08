import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, PageHeader } from '@/components/v1-ui/primitives';
import { AdminActivityTable } from './admin-activity-table';
import { AdminErrorPanel } from './admin-error';
import { AdminActivityLoading, AdminDashboardLoading } from './admin-loading';
import type {
  AdminActivityModel,
  AdminActionLinkModel,
  AdminDashboardModel,
  AdminMetricModel,
  AdminQueueItemModel,
  AdminTeamModel,
  AdminWorkItemModel,
} from './admin.types';

type DashboardViewProps = { readonly model: AdminDashboardModel; readonly onRetry?: () => void };
type ActivityViewProps = { readonly model: AdminActivityModel; readonly onRetry?: () => void };

export function AdminDashboardPageView({ model, onRetry }: DashboardViewProps) {
  return (
    <AdminFrame title="운영 ERP" active="admin" testId="admin-open-design" className="tm-admin-open-design tm-admin-desktop-workbench tm-operations-template">
      <AdminDomainShell showStrip={model.state !== 'error'}>
        <PageHeader
          eyebrow="업무 현황"
          title="운영 워크스페이스"
          description="오늘 처리할 신청, 모집, 리뷰, 알림을 우선순위대로 정리했습니다."
          action={<AdminActionLink action={{ label: '업무 이력', href: '/admin/audit', tone: 'neutral' }} />}
        />
        {model.state === 'error' ? <AdminErrorPanel message={model.errorMessage} onRetry={onRetry} /> : model.state === 'loading' ? (
          <AdminDashboardLoading operatorName={model.operatorName} />
        ) : (
          <>
            <section className="tm-admin-kpi-grid" aria-label="업무 요약">
              {model.metrics.map((metric) => <AdminMetric key={metric.id} metric={metric} />)}
            </section>
            <AdminServiceActionBar actions={model.primaryActions} communication={model.communication} />
            <section className="tm-admin-workspace">
              <div className="tm-admin-main-column">
                <AdminSection title="오늘 처리할 업무" sub="가입 요청, 운영 알림, 미작성 리뷰를 서비스 업무 흐름으로 묶었습니다.">
                  <AdminQueue items={model.queue} emptyTitle="지금 바로 처리할 업무가 없습니다." />
                </AdminSection>
                <div className="tm-admin-operations-grid">
                <AdminSection title="개인 매치 현황" sub="내가 만든 매치의 모집 상태와 수정 경로입니다.">
                    <AdminWorkList items={model.personalMatches} emptyTitle="내가 만든 매치가 없습니다." />
                  </AdminSection>
                <AdminSection title="팀매치 현황" sub="내 팀이 주최하거나 신청한 팀매치 흐름입니다.">
                    <AdminWorkList items={model.teamMatches} emptyTitle="팀매치 운영 내역이 없습니다." />
                  </AdminSection>
                </div>
                <AdminSection title="팀 현황" sub="팀장/운영진 권한이 있는 팀만 표시합니다.">
                  <AdminTeamGrid teams={model.teams} />
                </AdminSection>
              </div>
            </section>
          </>
        )}
      </AdminDomainShell>
    </AdminFrame>
  );
}

export function AdminAuditPageView({ model, onRetry }: ActivityViewProps) {
  return (
    <AdminFrame title="업무 이력" active="audit" testId="admin-audit-open-design" className="tm-admin-audit-open-design tm-admin-desktop-workbench tm-operations-template">
      <AdminDomainShell showStrip={model.state !== 'error'}>
        <PageHeader
          eyebrow="운영 기록"
          title="업무 이력"
          description="매치, 팀매치, 알림, 리뷰에서 발생한 처리 흐름을 시간순으로 확인합니다."
          action={<AdminActionLink action={{ label: '워크스페이스', href: '/admin', tone: 'neutral' }} />}
        />
        {model.state === 'error' ? <AdminErrorPanel message={model.errorMessage} onRetry={onRetry} /> : model.state === 'loading' ? (
          <AdminActivityLoading operatorName={model.operatorName} />
        ) : (
          <section className="tm-admin-audit-layout">
            <Card className="tm-admin-table-card" pad={0}>
              <div className="tm-admin-table-head">
                <div>
                  <div className="tm-text-body-lg">최근 업무 흐름</div>
                  <div className="tm-text-caption">{model.summaryLabel}</div>
                </div>
                {onRetry ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>새로고침</button> : null}
              </div>
              <AdminActivityTable items={model.items} />
            </Card>
          </section>
        )}
      </AdminDomainShell>
    </AdminFrame>
  );
}

function AdminFrame({ title, active, testId, className, children }: {
  readonly title: string;
  readonly active: 'admin' | 'audit';
  readonly testId: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <AppChrome
      title={title}
      desktopNav="admin"
      adminActiveTab={active}
      bottomNav={false}
      showSearch={false}
      showNotifications
      wide
    >
      <div className={`tm-admin-shell ${className}`} data-testid={testId}>{children}</div>
    </AppChrome>
  );
}

function AdminDomainShell({ children, showStrip = true }: { readonly children: ReactNode; readonly showStrip?: boolean }) {
  return (
    <div className="tm-admin-domain" data-testid="admin-desktop-domain">
      {showStrip ? (
        <nav className="tm-admin-desktop-workbench-strip" data-testid="admin-desktop-workbench" aria-label="빠른 이동">
          <Link className="tm-admin-strip-link" href="/admin">워크스페이스</Link>
          <Link className="tm-admin-strip-link" href="/admin/matches">개인 매치</Link>
          <Link className="tm-admin-strip-link" href="/admin/teams">팀 운영</Link>
          <Link className="tm-admin-strip-link" href="/admin/notifications">알림 · 리뷰</Link>
        </nav>
      ) : null}
      {children}
    </div>
  );
}

function AdminMetric({ metric }: { readonly metric: AdminMetricModel }) {
  return (
    <Card className="tm-admin-kpi-card" pad={16}>
      <div className="tm-metric-label">{metric.label}</div>
      <div className="tm-metric-value">{metric.value}</div>
      <div className="tm-metric-delta" data-tone={metric.tone}>{metric.sub}</div>
    </Card>
  );
}

function AdminSection({ title, sub, children }: { readonly title: string; readonly sub: string; readonly children: ReactNode }) {
  return (
    <Card className="tm-admin-section" pad={18}>
      <div className="tm-admin-section-head">
        <div className="tm-text-body-lg">{title}</div>
        <div className="tm-text-caption">{sub}</div>
      </div>
      {children}
    </Card>
  );
}

function AdminServiceActionBar({
  actions,
  communication,
}: {
  readonly actions: readonly AdminActionLinkModel[];
  readonly communication: readonly AdminQueueItemModel[];
}) {
  return (
    <Card className="tm-admin-service-bar" pad={0}>
      <div className="tm-admin-service-bar-head">
        <div>
          <div className="tm-text-body-lg">업무 실행</div>
          <div className="tm-text-caption">생성, 알림 확인, 리뷰 처리를 실제 서비스 화면으로 연결합니다.</div>
        </div>
        <div className="tm-admin-service-actions">
          {actions.map((action) => <AdminActionLink key={action.href} action={action} />)}
        </div>
      </div>
      <div className="tm-admin-service-queue" aria-label="알림과 리뷰 후속 작업">
        {communication.map((item) => (
          <Link key={item.id} className="tm-admin-service-task tm-pressable" href={item.href} data-tone={item.tone}>
            <span>{item.title}</span>
            <strong>{item.body}</strong>
            <em>{item.actionLabel}</em>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function AdminQueue({ items, emptyTitle }: { readonly items: readonly AdminQueueItemModel[]; readonly emptyTitle: string }) {
  if (items.length === 0) return <div className="tm-admin-empty">{emptyTitle}</div>;
  return (
    <div className="tm-admin-audit-list">
      {items.map((item) => (
        <Link key={item.id} className="tm-admin-audit-row tm-pressable" href={item.href} data-tone={item.tone}>
          <span>{item.title}</span>
          <span>{item.body}</span>
          <span className="tm-admin-endpoint">{item.sourceLabel} · {item.actionLabel}</span>
        </Link>
      ))}
    </div>
  );
}

function AdminWorkList({ items, emptyTitle }: { readonly items: readonly AdminWorkItemModel[]; readonly emptyTitle: string }) {
  if (items.length === 0) return <div className="tm-admin-empty">{emptyTitle}</div>;
  return (
    <div className="tm-admin-work-list">
      {items.map((item) => (
        <article key={item.id} className="tm-admin-work-row" data-state={item.tone === 'warning' ? 'action-required' : 'connected'}>
          <div className="tm-admin-domain-topline">
            <div>
              <div className="tm-text-label">{item.title}</div>
              <div className="tm-admin-endpoint">{item.statusLabel}</div>
            </div>
            <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={item.href}>상세</Link>
          </div>
          <p>{item.meta}</p>
          <AdminActionLink action={item.action} />
        </article>
      ))}
    </div>
  );
}

function AdminTeamGrid({ teams }: { readonly teams: readonly AdminTeamModel[] }) {
  if (teams.length === 0) return <div className="tm-admin-empty">운영 권한이 있는 팀이 없습니다.</div>;
  return (
    <div className="tm-admin-domain-grid">
      {teams.map((team) => (
        <article key={team.id} className="tm-admin-domain-card" data-status="ready">
          <div className="tm-admin-domain-topline">
            <div className="tm-text-label">{team.name}</div>
            <span className="tm-admin-status-pill" data-status="ready">{team.roleLabel}</span>
          </div>
          <div className="tm-admin-domain-count">{team.memberLabel}</div>
          <p>{team.meta}</p>
          <div className="tm-fixed-row-actions">
            <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={team.href}>팀 홈</Link>
            <AdminActionLink action={team.action} />
          </div>
        </article>
      ))}
    </div>
  );
}

function AdminActionLink({ action }: { readonly action: AdminActionLinkModel }) {
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
