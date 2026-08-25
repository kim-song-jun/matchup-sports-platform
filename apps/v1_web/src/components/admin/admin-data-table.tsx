'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { AdminEmpty } from './admin-empty';
import { PaginationBar, type PaginationBarProps } from '../v1-ui/pagination-bar';
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
   * 폭이 넓어 가로 스크롤이 생기는 표에서 관리(actions) 열을 오른쪽에 고정한다.
   * 핵심 액션 버튼이 스크롤해야만 보이는 것을 막는다(2026-08-25 사용자 확정 — 리그 대진 표).
   * 고정 셀은 스크롤 콘텐츠가 비쳐 보이지 않도록 카드 배경을 불투명하게 깐다 —
   * rowTone 틴트·hover 배경은 고정 셀 아래에서는 보이지 않는 것이 의도된 트레이드오프다.
   */
  stickyActions?: boolean;
  /**
   * #9: Per-row visual tone for dangerous/warning states (suspended, blocked, cancelled…).
   * danger → var(--red50)/40 + left red accent bar.
   * warning → var(--tint-orange) + left amber accent bar.
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

/** 표 하단 페이지네이션 props — 공용 `PaginationBar` 와 같은 계약을 쓴다. */
export type AdminTablePagination = PaginationBarProps;

// ── Alignment utility ─────────────────────────────────────────────────────
function alignClass(align: AdminTableColumn<unknown>['align']): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

// ── Component ─────────────────────────────────────────────────────────────
// #9: row tone → Tailwind class maps
const ROW_TONE_TR: Record<'danger' | 'warning', string> = {
  danger: 'bg-[var(--red50)]/40',
  warning: 'bg-[var(--tint-orange)]',
};
const ROW_TONE_ACCENT: Record<'danger' | 'warning', string> = {
  danger: 'border-l-2 border-l-red-400',
  warning: 'border-l-2 border-l-[var(--orange500)]',
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
  stickyActions = false,
  rowTone,
  onRowClick,
  rowClickLabel,
  pagination,
}: AdminDataTableProps<T>) {
  // Error state
  if (error) {
    return (
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-[var(--red700)] font-medium">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
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
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
        <AdminListSkeleton rows={skeletonRows} />
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
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
      ? 'w-max min-w-full text-[13px] text-[var(--text-body)]'
      : 'w-max min-w-full text-sm text-[var(--text-body)]';

    return (
      <table className={tableClassName}>
        <thead className="sticky top-0 bg-[var(--card-surface)] border-b border-[var(--border)] z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={[
                  cellPad,
                  'font-semibold text-[var(--text-muted)] text-[12px] tracking-wide whitespace-nowrap select-none',
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
                className={[
                  cellPad,
                  'font-semibold text-[var(--text-muted)] text-[12px] tracking-wide text-right whitespace-nowrap',
                  stickyActions ? 'sticky right-0 z-20 bg-[var(--card-surface)] border-l border-[var(--border)]' : '',
                ].filter(Boolean).join(' ')}
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
                    ? 'cursor-pointer hover:bg-[var(--surface-soft)]/60 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:-outline-offset-2'
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
                  <td
                    className={[
                      cellPad,
                      'text-right align-middle',
                      stickyActions ? 'sticky right-0 z-[5] bg-[var(--card-surface)] border-l border-[var(--border)]' : '',
                    ].filter(Boolean).join(' ')}
                  >
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
      <div className={['hidden lg:block bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden', tableMaxWidth ?? 'max-w-[900px]'].join(' ')}>
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
          <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden w-max min-w-full">
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
              className={['bg-[var(--card-surface)] rounded-xl border border-[var(--border)] px-4 py-3', tone ? ROW_TONE_TR[tone] : '', tone ? ROW_TONE_ACCENT[tone] : ''].filter(Boolean).join(' ')}
            >
              <dl className="flex flex-col gap-1.5">
                {columns.map((col) => (
                  <div key={col.key} className="flex items-start gap-2 text-[13px]">
                    <dt className="shrink-0 text-[var(--text-muted)] w-[90px] font-medium">{col.header}</dt>
                    {/* min-w-0: flex item 의 기본 min-width 는 auto 라, 셀 내용이 길면 dd 가
                        줄어들지 못하고 뷰포트를 밀어낸다(390px 화면에서 dd 가 410px 로 버텨
                        문서에 가로 스크롤 +151px 발생 — /admin/notices 실측). 안쪽 truncate 도
                        이 min-width 가 풀려야 동작한다. */}
                    <dd className="min-w-0 text-[var(--text-body)] flex-1 tabular-nums">{col.render(row)}</dd>
                  </div>
                ))}
              </dl>
              {hasActions && (
                <div className="mt-3 flex items-center gap-2 justify-end border-t border-[var(--border)] pt-2.5">
                  {renderActions!(row)}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <PaginationBar {...pagination} />
      )}
    </>
  );
}

/**
 * 표 하단 페이지네이션. "전체 N건 중 M–K"를 함께 보여준다 — 운영자가 목록 어디쯤을 보고
 * 있는지 알아야 하고, 커서 기반 "더 보기"만으로는 그 감각이 생기지 않는다.
 *
 * 구현은 `components/v1-ui/pagination-bar.tsx` 로 옮겼다(소비자 대회 목록도 같은 바를
 * 쓴다). 이 이름은 어드민 19곳의 호출부를 그대로 두려고 남긴 재수출이다.
 */
export { PaginationBar as AdminTablePaginationBar };
