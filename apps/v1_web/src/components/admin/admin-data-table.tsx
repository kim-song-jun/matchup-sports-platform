'use client';

import type { KeyboardEvent, ReactNode } from 'react';
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
  /**
   * 행 전체를 눌렀을 때의 동작. 넘기지 않으면 행에 hover·커서 강조가 붙지 않는다 —
   * 눌러도 아무 일이 없는 행이 클릭 가능해 보이는 것을 막기 위함이다.
   */
  onRowClick?: (row: T) => void;
  /** 행 클릭 시 스크린리더가 읽을 라벨. onRowClick 과 함께 쓴다. */
  rowClickLabel?: (row: T) => string;
  /** 목록 하단 페이지네이션. 넘기지 않으면 렌더하지 않는다. */
  pagination?: AdminTablePagination;
}

export interface AdminTablePagination {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  /** 페이지 이동 요청이 진행 중이면 버튼을 잠근다. */
  loading?: boolean;
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
  onRowClick,
  rowClickLabel,
  pagination,
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
    // tableMaxWidth는 데스크톱 래퍼(아래 hidden lg:block div)에만 적용한다 —
    // 여기 <table> 자체에 같이 걸면 w-max로 콘텐츠 폭까지 자라야 할 테이블이
    // 그 cap에 눌려 overflow-x-auto 스크롤 대신 다시 컬럼 압축이 재발한다.
    const tableClassName = compact
      ? 'w-max min-w-full text-[13px] text-gray-700'
      : 'w-max min-w-full text-sm text-gray-700';

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
                // hover 강조는 클릭 핸들러가 있을 때만 붙인다. 눌러도 아무 일이 없는 행에
                // 배경 반응만 주면 "여기 눌러도 된다"는 잘못된 신호가 된다.
                {...(onRowClick
                  ? {
                      onClick: () => onRowClick(row),
                      onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        // 셀 안의 버튼·링크에서 올라온 키 입력까지 행 클릭으로 삼키지 않는다.
                        if (event.target !== event.currentTarget) return;
                        event.preventDefault();
                        onRowClick(row);
                      },
                      tabIndex: 0,
                      role: 'button' as const,
                      'aria-label': rowClickLabel?.(row),
                    }
                  : {})}
                className={[
                  'transition-colors',
                  onRowClick
                    ? 'cursor-pointer hover:bg-gray-50/60 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:-outline-offset-2'
                    : '',
                  tone ? ROW_TONE_TR[tone] : '',
                ].filter(Boolean).join(' ')}
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

      {pagination && pagination.totalPages > 1 && (
        <AdminTablePaginationBar {...pagination} />
      )}
    </>
  );
}

/**
 * 표 하단 페이지네이션. "전체 N건 중 M–K"를 함께 보여준다 — 운영자가 목록 어디쯤을 보고
 * 있는지 알아야 하고, 커서 기반 "더 보기"만으로는 그 감각이 생기지 않는다.
 */
function AdminTablePaginationBar({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  loading,
}: AdminTablePagination) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pages = visiblePages(page, totalPages);

  const btn = [
    'inline-flex items-center justify-center min-w-[40px] min-h-[40px] px-2 rounded-lg',
    'text-[var(--font-size-label)] font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-40',
  ].join(' ');

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 pt-1"
      aria-label="목록 페이지"
    >
      <p className="text-[var(--font-size-label)] text-gray-500 tabular-nums">
        전체 {total.toLocaleString('ko-KR')}건 중 {from.toLocaleString('ko-KR')}–
        {to.toLocaleString('ko-KR')}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className={[btn, 'text-gray-600 hover:bg-gray-100'].join(' ')}
          aria-label="이전 페이지"
        >
          이전
        </button>

        {pages.map((item, index) =>
          item === null ? (
            // 페이지가 많을 때의 생략 구간. 버튼이 아니므로 포커스를 받지 않는다.
            <span
              key={`gap-${index}`}
              className="px-1 text-gray-400 select-none"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={loading}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`${item}페이지`}
              className={[
                btn,
                'tabular-nums',
                item === page
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100',
              ].join(' ')}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className={[btn, 'text-gray-600 hover:bg-gray-100'].join(' ')}
          aria-label="다음 페이지"
        >
          다음
        </button>
      </div>
    </nav>
  );
}

/**
 * 현재 페이지 주변만 보여주고 나머지는 생략(null)으로 접는다. 페이지가 수백 개가 되어도
 * 버튼 줄이 넘치지 않게 한다.
 */
function visiblePages(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | null> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push(null);
  for (let current = start; current <= end; current += 1) pages.push(current);
  if (end < totalPages - 1) pages.push(null);

  pages.push(totalPages);
  return pages;
}
