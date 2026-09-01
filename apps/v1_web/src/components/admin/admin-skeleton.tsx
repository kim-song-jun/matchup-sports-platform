export function AdminKpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] p-5 animate-pulse">
          <div className="h-3 bg-[var(--surface-soft)] rounded-lg w-16 mb-3" />
          <div className="h-8 bg-[var(--surface-soft)] rounded-lg w-12" />
        </div>
      ))}
    </div>
  );
}

export function AdminListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-5 py-3 min-h-[64px] border-b border-[var(--border)] last:border-0 animate-pulse"
        >
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[var(--surface-soft)] rounded-lg w-3/5" />
            <div className="h-3 bg-[var(--surface-soft)] rounded-lg w-2/5" />
          </div>
          <div className="h-5 bg-[var(--surface-soft)] rounded-full w-12 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function AdminTableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden animate-pulse">
      {/* Fake thead */}
      <div className="flex gap-4 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-soft)]">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-[var(--border)] rounded-lg flex-1" />
        ))}
      </div>
      {/* Fake rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-4 border-b border-[var(--border)] last:border-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-[var(--surface-soft)] rounded-lg flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// admin board 페이지(필터바 + 테이블만, KPI 그리드 없음) 전용 스켈레톤.
// AdminPageSkeleton은 KPI 그리드를 항상 포함해 board 페이지에 쓰면 "실제로 안 뜰 박스"가
// 레이아웃 튐을 만든다 — app-motion-system.md §3.2.1 참조.
export function AdminBoardListSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 bg-[var(--surface-soft)] rounded-lg w-16 mb-2" />
        <div className="h-7 bg-[var(--surface-soft)] rounded-lg w-48" />
      </div>
      <div className="flex gap-2 mb-6">
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-24" />
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-24" />
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-20" />
      </div>
      <AdminTableSkeleton rows={rows} cols={cols} />
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 bg-[var(--surface-soft)] rounded-lg w-16 mb-2" />
        <div className="h-7 bg-[var(--surface-soft)] rounded-lg w-48 mb-2" />
        <div className="h-4 bg-[var(--surface-soft)] rounded-lg w-64" />
      </div>
      <AdminKpiGridSkeleton />
      <div className="flex gap-2 mb-6">
        <div className="h-11 bg-[var(--surface-soft)] rounded-xl w-28" />
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-28" />
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-24" />
      </div>
      <AdminTableSkeleton rows={5} cols={4} />
    </div>
  );
}
