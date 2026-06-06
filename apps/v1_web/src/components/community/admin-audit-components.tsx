import type { AdminAuditLogModel, AdminLoadState } from './admin.types';

export function AuditLogList({ logs, state, compact = false }: {
  readonly logs: readonly AdminAuditLogModel[];
  readonly state: AdminLoadState;
  readonly compact?: boolean;
}) {
  if (state === 'loading') return <div className="tm-admin-empty">감사 로그를 불러오는 중입니다.</div>;
  if (logs.length === 0) return <div className="tm-admin-empty">표시할 감사 로그가 없습니다.</div>;
  return (
    <div className={compact ? 'tm-admin-audit-list tm-admin-audit-list-compact' : 'tm-admin-audit-list'}>
      {logs.map((log) => <AuditLogRow key={log.id} log={log} />)}
    </div>
  );
}

export function AuditLogTable({ logs, state }: {
  readonly logs: readonly AdminAuditLogModel[];
  readonly state: AdminLoadState;
}) {
  if (state === 'loading') return <div className="tm-admin-empty">감사 로그를 불러오는 중입니다.</div>;
  return (
    <div className="tm-admin-table" role="table" aria-label="감사 로그">
      <div className="tm-admin-table-row tm-admin-table-row-head" role="row">
        <span role="columnheader">주체</span>
        <span role="columnheader">액션</span>
        <span role="columnheader">대상</span>
        <span role="columnheader">사유</span>
        <span role="columnheader">시각</span>
      </div>
      {logs.length === 0 ? <div className="tm-admin-empty">표시할 감사 로그가 없습니다.</div> : logs.map((log) => <AuditLogRow key={log.id} log={log} table />)}
    </div>
  );
}

function AuditLogRow({ log, table = false }: { readonly log: AdminAuditLogModel; readonly table?: boolean }) {
  const className = table ? 'tm-admin-table-row' : 'tm-admin-audit-row';
  return (
    <div className={className} role={table ? 'row' : undefined}>
      <span>{log.actorId}</span>
      <span>{log.action}</span>
      <span>{log.target}</span>
      <span>사유: {log.reason}</span>
      <span>{log.createdAt}</span>
    </div>
  );
}
