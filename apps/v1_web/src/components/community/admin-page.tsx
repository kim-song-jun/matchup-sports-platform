'use client';

import Link from 'next/link';
import { V1ApiError } from '@/lib/api-client';
import { useV1AdminActionLogs, useV1AdminMe, useV1AdminOverview, useV1AdminStatusChangeLogs } from '@/hooks/use-v1-admin-api';
import { AppChrome } from '@/components/v1-ui/shell';
import { ActionPanel, Card, ListItem, MetricCard, PageHeader } from '@/components/v1-ui/primitives';
import type { V1AdminCapability, V1AdminRole } from '@/types/admin-api';

type AdminSurface = 'dashboard' | 'audit';

type RoleCapabilityRow = {
  readonly role: V1AdminRole;
  readonly label: string;
  readonly capabilities: readonly V1AdminCapability[];
  readonly note: string;
};

const roleCapabilityRows: readonly RoleCapabilityRow[] = [
  { role: 'owner', label: 'Owner', capabilities: ['overview:read', 'status:write', 'logs:read', 'admin:owner'], note: '전체 운영 권한과 관리자 소유권' },
  { role: 'ops', label: 'Ops', capabilities: ['overview:read', 'status:write', 'logs:read'], note: '상태 변경 가능, owner 권한 제외' },
  { role: 'support', label: 'Support', capabilities: ['overview:read', 'logs:read'], note: '읽기 전용 · support는 조회와 로그만 가능' },
];

const guardRules = [
  { title: 'active admin', sub: 'v1_admin_users.status가 active인 계정만 관리자 화면에 진입합니다.', trailing: 'required' },
  { title: 'PERMISSION_DENIED', sub: '비관리자, revoked/suspended admin은 운영 데이터를 받지 못합니다.', trailing: '403' },
  { title: 'Support admins cannot mutate status', sub: 'support role은 status:write capability가 없어 상태 변경 API가 차단됩니다.', trailing: 'blocked' },
  { title: 'reason required', sub: '상태 변경은 사유와 beforeState/afterState audit payload를 남겨야 합니다.', trailing: 'audit' },
];

function formatError(error: unknown) {
  if (error instanceof V1ApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'unknown error';
}

export function AdminMinimumPageView({ surface }: { surface: AdminSurface }) {
  const audit = surface === 'audit';
  const adminMe = useV1AdminMe({ retry: false });
  const canLoadAdminData = adminMe.isSuccess;
  const overview = useV1AdminOverview({ enabled: canLoadAdminData && !audit, retry: false });
  const actionLogs = useV1AdminActionLogs(undefined, { enabled: canLoadAdminData && audit, retry: false });
  const statusLogs = useV1AdminStatusChangeLogs(undefined, { enabled: canLoadAdminData && audit, retry: false });
  const testId = audit ? 'admin-audit-open-design' : 'admin-open-design';
  const className = audit ? 'tm-admin-audit-open-design' : 'tm-admin-open-design tm-admin-desktop-workbench';

  return (
    <AppChrome
      title={audit ? '감사 로그' : '관리자'}
      desktopNav="admin"
      adminActiveTab={audit ? 'audit' : 'admin'}
      bottomNav={false}
      showSearch={false}
      showNotifications={false}
      wide
    >
      <div className={`tm-create-shell ${className}`} data-testid={testId}>
        {adminMe.isError ? <AdminPermissionDenied surface={audit ? '감사 로그' : '운영 상태'} errorMessage={formatError(adminMe.error)} /> : null}
        {!adminMe.isError ? (
          <>
            {!audit ? <AdminWorkbenchStrip /> : null}
            <PageHeader
              eyebrow={adminMe.isPending ? 'admin access check' : `admin ${adminMe.data.adminRole}`}
              title={audit ? '감사 로그' : '운영 상태'}
              description="v1 관리자 화면은 active admin 권한, role capability, 감사 로그 추적성을 기준으로 렌더링합니다. 실패한 API 요청은 성공처럼 처리하지 않습니다."
              action={<Link className="tm-btn tm-btn-sm tm-btn-secondary" href={audit ? '/admin' : '/admin/audit'}>{audit ? '운영 상태' : '감사 로그'}</Link>}
            />
            {!audit ? <AdminDashboardBody adminRole={adminMe.data?.adminRole ?? null} overviewState={overview} /> : null}
            {audit ? <AdminAuditBody actionLogsState={actionLogs} statusLogsState={statusLogs} /> : null}
          </>
        ) : null}
      </div>
    </AppChrome>
  );
}

function AdminWorkbenchStrip() {
  return (
    <div className="tm-admin-desktop-workbench-strip" data-testid="admin-desktop-workbench">
      <div className="tm-my-section-label">운영 요약</div>
      <div className="tm-my-section-label">검토 큐</div>
      <div className="tm-my-section-label">감사 로그</div>
    </div>
  );
}

function AdminDashboardBody({
  adminRole,
  overviewState,
}: {
  readonly adminRole: V1AdminRole | null;
  readonly overviewState: ReturnType<typeof useV1AdminOverview>;
}) {
  const overviewErrorMessage = overviewState.isError ? formatError(overviewState.error) : null;
  const valueFor = (value: number | undefined) => {
    if (overviewState.isError) return '오류';
    if (typeof value === 'number') return String(value);
    return '확인 중';
  };

  return (
    <>
      <div className="tm-responsive-card-grid">
        <MetricCard label="활성 사용자" value={valueFor(overviewState.data?.users.active)} delta="overview:read" />
        <MetricCard label="모집 매치" value={valueFor(overviewState.data?.matches.recruiting)} delta="status queue" tone="up" />
        <MetricCard label="활성 팀" value={valueFor(overviewState.data?.teams.active)} delta={adminRole ?? 'checking'} />
      </div>
      {overviewErrorMessage ? (
        <Card pad={14}>
          <div className="tm-text-body-lg">운영 상태 오류</div>
          <div className="tm-text-caption" style={{ marginTop: 6 }}>{overviewErrorMessage}</div>
        </Card>
      ) : null}
      <div className="tm-detail-grid">
        <div>
          <AdminPermissionMatrix />
          <Card pad={16} style={{ marginTop: 14 }}>
            <div className="tm-text-body-lg">최근 운영 action</div>
            <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
              <ListItem title="overview:read" sub="GET /admin/overview · active admin만 조회" trailing={overviewState.isError ? '오류' : '조회'} />
              <ListItem title="status:write" sub="owner/ops만 상태 변경 API 진입 가능 · support는 차단" trailing="권한 분기" />
              <ListItem title="logs:read" sub="GET /admin/action-logs, /admin/status-change-logs" trailing="감사" />
            </div>
          </Card>
        </div>
        <aside>
          <AdminPermissionGuard />
          <ActionPanel
            title="운영 mutation 보류"
            description="상태 변경 API 계약은 존재하지만, 이 최소 관리자 화면은 사유 입력과 대상 상세 확인 없이 성공 처리를 만들지 않습니다."
            action={<button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>처리 불가</button>}
          />
        </aside>
      </div>
    </>
  );
}

function AdminPermissionMatrix() {
  return (
    <Card pad={16}>
      <div className="tm-text-body-lg">권한 매트릭스</div>
      <div className="tm-my-list-stack" data-testid="admin-permission-matrix" style={{ marginTop: 12 }}>
        {roleCapabilityRows.map((row) => (
          <div key={row.role} className="tm-list-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-body" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>{row.role} · {row.label}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{row.capabilities.join(' · ')}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{row.note}</div>
            </div>
            {row.role === 'support' ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>상태 변경 권한 필요</button> : <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>허용</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminPermissionGuard() {
  return (
    <Card pad={16} style={{ marginBottom: 14 }}>
      <div className="tm-text-body-lg">권한 차단 조건</div>
      <div className="tm-my-list-stack" data-testid="admin-permission-guard" style={{ marginTop: 12 }}>
        {guardRules.map((rule) => <ListItem key={rule.title} title={rule.title} sub={rule.sub} trailing={rule.trailing} />)}
        <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>상태 변경 권한 필요</button>
      </div>
    </Card>
  );
}

function AdminAuditBody({
  actionLogsState,
  statusLogsState,
}: {
  readonly actionLogsState: ReturnType<typeof useV1AdminActionLogs>;
  readonly statusLogsState: ReturnType<typeof useV1AdminStatusChangeLogs>;
}) {
  const actionLog = actionLogsState.data?.items[0];
  const statusLog = statusLogsState.data?.items[0];

  return (
    <div className="tm-detail-grid">
      <div>
        <Card pad={16}>
          <div className="tm-text-body-lg">감사 로그 contract</div>
          <div className="tm-my-list-stack" data-testid="admin-audit-trail" style={{ marginTop: 12 }}>
            <ListItem title="actionLogId" sub={actionLog?.actionLogId ?? stateText(actionLogsState)} trailing="action" />
            <ListItem title="adminUserId / actionType / targetType" sub={`${actionLog?.adminUserId ?? '-'} · ${actionLog?.actionType ?? '-'} · ${actionLog?.targetType ?? '-'}`} trailing="actor" />
            <ListItem title="reason / 사유" sub={actionLog?.reason ?? '사유(reason) 값이 없으면 mutation 계약 불충족'} trailing="required" />
            <ListItem title="beforeState / afterState" sub="beforeState와 afterState는 raw JSON으로 보존됩니다." trailing="diff" />
            <ListItem title="statusChangeLogId" sub={statusLog?.statusChangeLogId ?? stateText(statusLogsState)} trailing="status" />
            <ListItem title="fromStatus / toStatus" sub={`${statusLog?.fromStatus ?? '-'} -> ${statusLog?.toStatus ?? '-'}`} trailing="transition" />
            <ListItem title="cursor" sub="action/status logs 모두 cursor pagination으로 재조회합니다." trailing="pageInfo" />
          </div>
        </Card>
      </div>
      <aside>
        <ActionPanel
          title="감사 조회"
          description="GET /admin/action-logs와 GET /admin/status-change-logs를 별도로 조회합니다. 실패하면 해당 에러 메시지를 그대로 보여줍니다."
          action={<button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>처리 불가</button>}
        />
      </aside>
    </div>
  );
}

function stateText(state: { readonly isPending: boolean; readonly isError: boolean; readonly error: unknown }) {
  if (state.isError) return formatError(state.error);
  if (state.isPending) return '불러오는 중';
  return '로그 없음';
}

function AdminPermissionDenied({ surface, errorMessage }: { readonly surface: string; readonly errorMessage: string }) {
  return (
    <div>
      <PageHeader
        eyebrow="HTTP 403 · required: active admin"
        title="접근 권한이 없어요"
        description={`${surface} 페이지는 관리자 전용입니다. ${errorMessage}`}
        action={<button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>관리자 권한 필요</button>}
      />
      <div data-testid="admin-permission-denied">
        <Card pad={16}>
          <div className="tm-text-body-lg">PERMISSION_DENIED</div>
          <div className="tm-text-caption" style={{ marginTop: 8 }}>Active admin access is required. 실패한 권한 요청을 성공 상태로 대체하지 않습니다.</div>
        </Card>
      </div>
    </div>
  );
}
