'use client';

import type { ReactNode } from 'react';
import { AdminEmpty } from './admin-empty';
import { AdminStatusPill } from './admin-status-pill';

// ── Card model ────────────────────────────────────────────────────────────
export interface AdminCardMeta {
  /** Optional leading lucide icon (16px 권장, color는 컴포넌트가 muted 처리) */
  icon?: ReactNode;
  label: ReactNode;
  wrap?: boolean;
}

export interface AdminCardModel {
  title: ReactNode;
  subtitle?: ReactNode;
  /** STATUS_META 키 — AdminStatusPill 렌더 */
  status?: string;
  /** pill 라벨 오버라이드 */
  statusLabel?: string;
  /** 우상단 status 영역 커스텀(상태 enum 이 아닌 경우). status 보다 우선 */
  statusNode?: ReactNode;
  meta?: AdminCardMeta[];
  description?: ReactNode;
  /** 위험/경고 상태 좌측 accent + 배경 tint (AdminDataTable rowTone 과 동일 시각언어) */
  tone?: 'danger' | 'warning';
}

// ── Props ─────────────────────────────────────────────────────────────────
interface AdminCardListProps<T> {
  rows: T[];
  keyExtractor: (row: T) => string;
  card: (row: T) => AdminCardModel;
  /** 카드 하단 액션 영역 */
  renderActions?: (row: T) => ReactNode;
  /** 액션 배치 — stretch(기본): 버튼을 행 너비로 늘림 / compact: 고유 너비 칩으로 좌측 정렬
   *  (액션이 4개 이상이라 줄바꿈될 때 마지막 버튼 혼자 풀너비가 되는 것을 막는다) */
  actionLayout?: 'stretch' | 'compact';
  loading?: boolean;
  empty?: ReactNode;
  error?: string;
  onRetry?: () => void;
  /** 로딩 중 스켈레톤 카드 수 (default: 6) */
  skeletonCards?: number;
  minCardWidth?: string;
}

// ── tone → class (AdminDataTable 과 동일 매핑) ──────────────────────────────
const TONE_CARD: Record<'danger' | 'warning', string> = {
  danger: 'bg-red-50/40 border-l-2 border-l-red-400',
  warning: 'bg-amber-50/40 border-l-2 border-l-amber-400',
};

// 모바일 1열 → 좁은 화면부터 채워지는 반응형 그리드.
const GRID_CLASS = 'grid gap-3';

export function AdminCardList<T>({
  rows,
  keyExtractor,
  card,
  renderActions,
  actionLayout = 'stretch',
  loading = false,
  empty,
  error,
  onRetry,
  skeletonCards = 6,
  minCardWidth = '280px',
}: AdminCardListProps<T>) {
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill,minmax(${minCardWidth},1fr))` };

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

  // Loading state — 카드형 스켈레톤
  if (loading) {
    return (
      <div className={GRID_CLASS} style={gridStyle} aria-busy="true" aria-live="polite">
        {Array.from({ length: skeletonCards }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-100 p-3.5 animate-pulse"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="h-3.5 w-2/3 rounded bg-gray-100" />
                <div className="mt-2 h-2.5 w-1/2 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-14 rounded-full bg-gray-100" />
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <div className="h-2.5 rounded bg-gray-100" />
              <div className="h-2.5 rounded bg-gray-100" />
              <div className="h-2.5 rounded bg-gray-100" />
              <div className="h-2.5 rounded bg-gray-100" />
            </div>
            <div className="mt-3.5 h-10 rounded-lg bg-gray-100" />
          </div>
        ))}
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

  return (
    <ul className={GRID_CLASS} style={gridStyle} role="list">
      {rows.map((row) => {
        const model = card(row);
        const tone = model.tone;
        return (
          <li
            key={keyExtractor(row)}
            className={[
              'bg-white rounded-xl border border-gray-100 p-3.5 flex flex-col transition-colors hover:border-gray-200',
              tone ? TONE_CARD[tone] : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* 제목 + 상태 */}
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="text-[var(--font-size-body-sm)] font-semibold text-gray-900 truncate">
                  {model.title}
                </p>
                {model.subtitle != null && (
                  <p className="text-[var(--font-size-caption)] text-gray-400 mt-0.5 truncate">
                    {model.subtitle}
                  </p>
                )}
              </div>
              {model.statusNode ? (
                <span className="shrink-0">{model.statusNode}</span>
              ) : model.status ? (
                <span className="shrink-0">
                  <AdminStatusPill status={model.status} label={model.statusLabel} />
                </span>
              ) : null}
            </div>

            {/* 메타 그리드 */}
            {model.meta && model.meta.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5">
                {model.meta.map((m, i) => (
                  <dd
                    key={i}
                    className="flex items-center gap-1.5 text-[var(--font-size-label)] text-gray-600 tabular-nums min-w-0"
                  >
                    {m.icon && (
                      <span className="shrink-0 text-gray-400 inline-flex" aria-hidden="true">
                        {m.icon}
                      </span>
                    )}
                    <span className={m.wrap ? 'min-w-0 break-words leading-snug' : 'truncate'}>{m.label}</span>
                  </dd>
                ))}
              </dl>
            )}

            {model.description ? (
              <div className="mt-2.5 rounded-lg bg-gray-50 px-3 py-2 text-[var(--font-size-caption)] text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
                {model.description}
              </div>
            ) : null}

            {/* 액션 — stretch: full-width / compact: 고유 너비 칩 */}
            {hasActions && (
              <div
                className={[
                  'mt-3 flex flex-wrap items-center gap-2',
                  actionLayout === 'stretch' ? '[&>*]:min-w-[88px] [&>*]:flex-1' : '',
                ].join(' ').trim()}
              >
                {renderActions!(row)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
