import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, PageHeader } from '@/components/v1-ui/primitives';
import { AuditLogList, AuditLogTable } from './admin-audit-components';
import type {
  AdminAuditModel,
  AdminAuthorityModel,
  AdminContractModel,
  AdminDashboardModel,
  AdminDomainModel,
  AdminMetricModel,
} from './admin.types';

type DashboardViewProps = { readonly model: AdminDashboardModel; readonly onRetry?: () => void; readonly statusMutationPanel?: ReactNode };
type AuditViewProps = { readonly model: AdminAuditModel; readonly onRetry?: () => void };

export function AdminDashboardPageView({ model, onRetry, statusMutationPanel }: DashboardViewProps) {
  return (
    <AdminFrame title="관리자" active="admin" testId="admin-open-design" className="tm-admin-open-design tm-admin-desktop-workbench">
      <AdminDomainShell showStrip={model.state !== 'error'}>
        <PageHeader
          eyebrow="관리자"
          title="운영 관리"
          description="서비스 운영 현황을 확인하고 필요한 조치를 안전하게 진행하세요. 아직 준비 중인 업무는 완료된 것처럼 표시하지 않습니다."
          action={<Link className="tm-btn tm-btn-sm tm-btn-secondary" href="/admin/audit">감사 로그</Link>}
        />
        {model.state === 'error' ? <AdminError message={model.errorMessage} onRetry={onRetry} /> : (
          <>
            <section className="tm-admin-kpi-grid" aria-label="운영 요약">
              {model.metrics.map((metric) => <AdminMetric key={metric.id} metric={metric} />)}
            </section>
            <section className="tm-admin-workspace">
              <div className="tm-admin-main-column">
                <AdminSection title="서비스 운영 현황" sub="운영자가 바로 확인해야 하는 주요 영역입니다.">
                  <div className="tm-admin-domain-grid">
                    {model.domains.map((domain) => <AdminDomainCard key={domain.id} domain={domain} />)}
                  </div>
                </AdminSection>
                <AdminSection title="최근 감사 로그" sub="운영 활동의 주체, 대상, 사유를 확인합니다.">
                  <AuditLogList logs={model.recentLogs} state={model.state} compact />
                </AdminSection>
              </div>
              <aside className="tm-admin-side-column">
                <AdminAuthorityPanel authority={model.authority} pendingLabel={model.pendingActionsLabel} />
                {statusMutationPanel}
                <AdminContracts contracts={model.contracts} />
              </aside>
            </section>
          </>
        )}
      </AdminDomainShell>
    </AdminFrame>
  );
}

export function AdminAuditPageView({ model, onRetry }: AuditViewProps) {
  return (
    <AdminFrame title="감사 로그" active="audit" testId="admin-audit-open-design" className="tm-admin-audit-open-design tm-admin-desktop-workbench">
      <AdminDomainShell showStrip={model.state !== 'error'}>
        <PageHeader
          eyebrow="관리자"
          title="감사 로그"
          description="운영자가 어떤 이유로 어떤 대상을 조회하거나 시도했는지 추적합니다. 실패한 기능은 성공으로 기록하지 않습니다."
          action={<Link className="tm-btn tm-btn-sm tm-btn-secondary" href="/admin">운영 상태</Link>}
        />
        {model.state === 'error' ? <AdminError message={model.errorMessage} onRetry={onRetry} /> : (
          <section className="tm-admin-audit-layout">
            <Card className="tm-admin-table-card" pad={0}>
              <div className="tm-admin-table-head">
                <div>
                  <div className="tm-text-body-lg">관리자 행동 기록</div>
                  <div className="tm-text-caption">{model.nextCursorLabel}</div>
                </div>
                {onRetry ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>새로고침</button> : null}
              </div>
              <AuditLogTable logs={model.logs} state={model.state} />
            </Card>
            <aside className="tm-admin-side-column">
              <AdminAuthorityPanel authority={model.authority} pendingLabel="감사 기록 기준으로 표시" />
              <AdminBlockedMutationPanel />
            </aside>
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
      showNotifications={false}
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
        <div className="tm-admin-desktop-workbench-strip" data-testid="admin-desktop-workbench">
          <span className="tm-my-section-label">운영 요약</span>
          <span className="tm-my-section-label">관리자 권한</span>
          <span className="tm-my-section-label">감사 로그</span>
          <span className="tm-my-section-label">준비 중</span>
        </div>
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
      <div className="tm-metric-delta" data-tone={metric.tone ?? 'neutral'}>{metric.sub}</div>
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

function AdminDomainCard({ domain }: { readonly domain: AdminDomainModel }) {
  return (
    <article className="tm-admin-domain-card" data-status={domain.statusTone}>
      <div className="tm-admin-domain-topline">
        <div className="tm-text-label">{domain.title}</div>
        <span className="tm-admin-status-pill" data-status={domain.statusTone}>{domain.statusLabel}</span>
      </div>
      <div className="tm-admin-domain-count">
        {domain.count}{domain.unit ? <span>{domain.unit}</span> : null}
      </div>
      <p>{domain.description}</p>
      <div className="tm-admin-endpoint">{domain.detailLabel}</div>
    </article>
  );
}

function AdminAuthorityPanel({ authority, pendingLabel }: { readonly authority: AdminAuthorityModel; readonly pendingLabel: string }) {
  return (
    <Card className="tm-admin-authority-panel" pad={18}>
      <div className="tm-text-body-lg">관리자 권한</div>
      <div className="tm-admin-authority-role"><span>{authority.roleLabel}</span><span>{authority.statusLabel}</span></div>
      <p>현재 계정에서 확인하고 처리할 수 있는 운영 업무입니다.</p>
      <div className="tm-admin-permission-list">
        <span>운영 계정 확인됨</span>
        <span>감사 기록 열람 가능</span>
        <span>검토 상태: {pendingLabel}</span>
      </div>
      <div className="tm-admin-capability-list">
        {authority.capabilityLabels.length > 0 ? authority.capabilityLabels.map((label) => <span key={label}>{label}</span>) : <span>표시할 운영 권한 없음</span>}
      </div>
    </Card>
  );
}

function AdminContracts({ contracts }: { readonly contracts: readonly AdminContractModel[] }) {
  return (
    <Card className="tm-admin-contract-panel" pad={18}>
      <div className="tm-text-body-lg">처리 가능 업무</div>
      <div className="tm-admin-contract-list">
        {contracts.map((contract) => (
          <div key={`${contract.title}:${contract.detailLabel}`} className="tm-admin-contract-row" data-state={contract.state}>
            <div>
              <div className="tm-text-label">{contract.title}</div>
              <div className="tm-admin-endpoint">{contract.detailLabel}</div>
            </div>
            <p>{contract.description}</p>
            {contract.state === 'unavailable' ? (
              <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>준비 중</button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminBlockedMutationPanel() {
  return (
    <Card className="tm-admin-contract-panel" pad={18}>
      <div className="tm-text-body-lg">준비 중</div>
      <p>정산과 분쟁 처리는 아직 준비 중입니다. 실제 처리 없이 완료로 표시하지 않습니다.</p>
      <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>준비 중</button>
    </Card>
  );
}

function AdminError({ message, onRetry }: { readonly message?: string; readonly onRetry?: () => void }) {
  return (
    <div className="tm-admin-error" role="alert">
      <div>
        <div className="tm-text-body-lg">관리자 정보를 불러오지 못했습니다</div>
        <div className="tm-text-caption">{message ?? '잠시 후 다시 시도해 주세요. 권한이 없다면 관리자에게 문의해 주세요.'}</div>
      </div>
      {onRetry ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>다시 시도</button> : null}
    </div>
  );
}
