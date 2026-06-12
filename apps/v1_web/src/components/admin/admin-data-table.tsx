'use client';

import type { ReactNode } from 'react';
import { AdminEmpty } from './admin-empty';
import { AdminListSkeleton } from './admin-skeleton';

// ── Column definition ─────────────────────────────────────────────────────
export interface AdminTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Text alignment for header + cells. Defaults to 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Additional Tailwind classes applied to both th and td */
  className?: string;
}

// ── Props ─────────────────────────────────────────────────────────────────
interface AdminDataTableProps<T> {
  columns: AdminTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  /** Trailing column with per-row action buttons */
  actionsHeader?: string;
  renderActions?: (row: T) => ReactNode;
  loading?: boolean;
  /** Custom empty node; defaults to AdminEmpty */
  empty?: ReactNode;
  error?: string;
  onRetry?: () => void;
  /** Number of skeleton rows shown while loading (default: 5) */
  skeletonRows?: number;
}

// ── Alignment utility ─────────────────────────────────────────────────────
function alignClass(align: AdminTableColumn<unknown>['align']): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

// ── Component ─────────────────────────────────────────────────────────────
export function AdminDataTable<T>({
  columns,
  rows,
  keyExtractor,
  actionsHeader,
  renderActions,
  loading = false,
  empty,
  error,
  onRetry,
  skeletonRows = 5,
}: AdminDataTableProps<T>) {
  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 py-10 px-4 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-red-500 font-medium">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm text-blue-500 hover:text-blue-600 underline underline-offset-2 min-h-[44px] px-3 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            다시 시도하기
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <AdminListSkeleton rows={skeletonRows} />
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {empty ?? <AdminEmpty title="결과가 없어요" description="검색 조건을 변경해 보세요." />}
      </div>
    );
  }

  const hasActions = !!renderActions;

  return (
    <>
      {/* ── Desktop table (lg+) ─────────────────────────────────────────── */}
      <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-700">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={[
                      'px-4 py-3 font-semibold text-gray-600 text-[12px] tracking-wide whitespace-nowrap select-none',
                      alignClass(col.align),
                      col.className ?? '',
                    ].join(' ')}
                  >
                    {col.header}
                  </th>
                ))}
                {hasActions && (
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-gray-600 text-[12px] tracking-wide text-right whitespace-nowrap"
                  >
                    {actionsHeader ?? '작업'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className="transition-colors hover:bg-gray-50/60"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        'px-4 py-3 tabular-nums align-middle',
                        alignClass(col.align),
                        col.className ?? '',
                      ].join(' ')}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-4 py-3 text-right align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {renderActions!(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile card list (<lg) ───────────────────────────────────────── */}
      <ul className="lg:hidden flex flex-col gap-2" role="list">
        {rows.map((row) => (
          <li
            key={keyExtractor(row)}
            className="bg-white rounded-xl border border-gray-100 px-4 py-3"
          >
            <dl className="flex flex-col gap-1.5">
              {columns.map((col) => (
                <div key={col.key} className="flex items-start gap-2 text-[13px]">
                  <dt className="shrink-0 text-gray-400 w-[90px] font-medium">{col.header}</dt>
                  <dd className="text-gray-800 flex-1 tabular-nums">{col.render(row)}</dd>
                </div>
              ))}
            </dl>
            {hasActions && (
              <div className="mt-3 flex items-center gap-2 justify-end border-t border-gray-50 pt-2.5">
                {renderActions!(row)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
