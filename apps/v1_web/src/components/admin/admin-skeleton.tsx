export function AdminKpiGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="h-3 bg-gray-100 rounded-lg w-16 mb-3" />
          <div className="h-8 bg-gray-100 rounded-lg w-12" />
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
          className="flex items-center gap-3 px-5 py-[14px] border-b border-gray-50 last:border-0 animate-pulse"
        >
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-100 rounded-lg w-3/5" />
            <div className="h-3 bg-gray-100 rounded-lg w-2/5" />
          </div>
          <div className="h-5 bg-gray-100 rounded-full w-12 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 bg-gray-100 rounded-lg w-16 mb-2" />
        <div className="h-7 bg-gray-100 rounded-lg w-48 mb-2" />
        <div className="h-4 bg-gray-100 rounded-lg w-64" />
      </div>
      <AdminKpiGridSkeleton />
      <div className="flex gap-2 mb-6">
        <div className="h-11 bg-gray-100 rounded-xl w-28" />
        <div className="h-10 bg-gray-100 rounded-xl w-28" />
        <div className="h-10 bg-gray-100 rounded-xl w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="h-4 bg-gray-100 rounded-lg w-20" />
              <div className="h-3 bg-gray-100 rounded-lg w-12" />
            </div>
            <AdminListSkeleton rows={3} />
          </div>
        ))}
      </div>
    </div>
  );
}
