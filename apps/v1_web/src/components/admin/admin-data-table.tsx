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
  /**
   * Fixed-width Tailwind class applied to both th and td (e.g. 'w-[64px]').
   * Use this to prevent short numeric columns from spreading across wide
   * viewports when the table is w-full.
   */
  width?: string;
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
  /**
   * When true, renders an actual compact <table> on mobile (<lg) instead of
   * the stacked card list, wrapped in a horizontally scrollable container so
   * stat-heavy tables (e.g. leaderboards) don't reflow into tall vertical
   * stacks on narrow screens.
   * Default false — existing card-stack behaviour unchanged.
   */
  scrollOnMobile?: boolean;
  /**
   * Tailwind max-width class for the desktop table wrapper so stat-heavy
   * tables don't stretch across wide (1920+) viewports.
   * 기본값(미전달): 'max-w-[900px]' 캡 적용(#6). 캡 해제는 'max-w-none',
   * 다른 폭은 예: 'max-w-3xl' 전달.
   */
  tableMaxWidth?: string;
  /**
   * #9: Per-row visual tone for dangerous/warning states (suspended, blocked, cancelled…).
   * danger → bg-red-50/40 + left red accent bar.
   * warning → bg-amber-50/40 + left amber accent bar.
   */
  rowTone?: (row: T) => 'danger' | 'warning' | undefined;
}

// ── Alignment utility ─────────────────────────────────────────────────────
function alignClass(align: AdminTableColumn<unknown>['align']): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

// ── Component ─────────────────────────────────────────────────────────────
// #9: row tone → Tailwind class maps
const ROW_TONE_TR: Record<'danger' | 'warning', string> = {
  danger: 'bg-red-50/40',
  warning: 'bg-amber-50/40',
};
const ROW_TONE_ACCENT: Record<'danger' | 'warning', string> = {
  danger: 'border-l-2 border-l-red-400',
  warning: 'border-l-2 border-l-amber-400',
};

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
  scrollOnMobile = false,
  tableMaxWidth,
  rowTone,
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
        {empty ?? <AdminEmpty title="항목이 없어요" description="다른 조건으로 검색해 보세요." />}
      </div>
    );
  }

  const hasActions = !!renderActions;

  // ── Shared table renderer (desktop + compact mobile scroll variant) ─────
  // compact=true is used for the <lg scrollOnMobile table: tighter padding,
  // smaller text, no forced tableMaxWidth (the table sizes to its content
  // inside a horizontally scrollable wrapper instead).
  function renderTable(compact: boolean) {
    const cellPad = compact ? 'px-3 py-2.5' : 'px-4 py-3';
    const tableClassName = compact
      ? 'w-max min-w-full text-[13px] text-gray-700'
      : ['w-full text-sm text-gray-700', tableMaxWidth ?? ''].join(' ').trim();

    return (
      <table className={tableClassName}>
        <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={[
                  cellPad,
                  'font-semibold text-gray-600 text-[12px] tracking-wide whitespace-nowrap select-none',
                  alignClass(col.align),
                  col.width ?? '',
                  col.className ?? '',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
            {hasActions && (
              <th
                scope="col"
                className={[cellPad, 'font-semibold text-gray-600 text-[12px] tracking-wide text-right whitespace-nowrap'].join(' ')}
              >
                {actionsHeader ?? '작업'}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => {
            const tone = rowTone?.(row);
            return (
              <tr
                key={keyExtractor(row)}
                className={['transition-colors hover:bg-gray-50/60', tone ? ROW_TONE_TR[tone] : ''].filter(Boolean).join(' ')}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={col.key}
                    className={[
                      cellPad,
                      'tabular-nums align-middle',
                      // rowTone 좌측 accent: 테이블에서 <tr> border-l은 border model상 미렌더될 수 있어 첫 셀(td)에 적용 (Copilot)
                      colIdx === 0 && tone ? ROW_TONE_ACCENT[tone] : '',
                      alignClass(col.align),
                      col.width ?? '',
                      col.className ?? '',
                    ].filter(Boolean).join(' ')}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {hasActions && (
                  <td className={[cellPad, 'text-right align-middle'].join(' ')}>
                    <div className="flex items-center justify-end gap-2">
                      {renderActions!(row)}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
      {/* ── Desktop table (lg+) ─────────────────────────────────────────── */}
      {/* max-w-[900px]: tableMaxWidth 미전달 시 과폭 방지 기본 캡 (1920+ 대응) */}
      <div className={['hidden lg:block bg-white rounded-2xl border border-gray-100 overflow-hidden', tableMaxWidth ?? 'max-w-[900px]'].join(' ')}>
        <div className="overflow-x-auto">
          {renderTable(false)}
        </div>
      </div>

      {/* ── Mobile (<lg) ─────────────────────────────────────────────────── */}
      {scrollOnMobile ? (
        // Compact real <table>, not a card stack — stat-heavy tables (e.g.
        // leaderboards) keep their column structure instead of reflowing
        // into tall vertical stacks. Wrapper breaks out of the page's -mx-4
        // padding so the scroll area reaches the viewport edge.
        <div className="lg:hidden overflow-x-auto -mx-4 px-4">
          {/* w-max min-w-full: 카드가 테이블 콘텐츠 폭만큼 자라야 바깥 래퍼가 스크롤된다 —
              카드 폭이 뷰포트에 갇히면 overflow-hidden이 넘친 컬럼을 잘라낸다 */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden w-max min-w-full">
            {renderTable(true)}
          </div>
        </div>
      ) : (
        <ul className="lg:hidden flex flex-col gap-2" role="list">
          {rows.map((row) => {
            const tone = rowTone?.(row);
            return (
            <li
              key={keyExtractor(row)}
              className={['bg-white rounded-xl border border-gray-100 px-4 py-3', tone ? ROW_TONE_TR[tone] : '', tone ? ROW_TONE_ACCENT[tone] : ''].filter(Boolean).join(' ')}
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
            );
          })}
        </ul>
      )}
    </>
  );
}
