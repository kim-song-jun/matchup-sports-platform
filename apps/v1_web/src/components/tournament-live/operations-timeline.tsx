import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { groupByTime, type BoardCard, type FieldColumn } from './ops-board-model';

interface OperationsTimelineProps {
  columns: readonly FieldColumn[];
  /** 선택한 날의 카드. 열에 없는 구장의 카드는 그리지 않는다. */
  cards: readonly BoardCard[];
  /** 선택한 날이 오늘일 때만 `HH:mm` 을 준다. */
  nowTimeLabel: string | null;
  renderCard: (card: BoardCard) => ReactNode;
}

function NowRow({ label }: { label: string }) {
  return (
    <div role="row" className="px-3 py-1">
      <div role="cell">
        <div role="separator" aria-label={`지금 ${label}`} className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--blue500)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold tabular-nums text-[var(--button-text-primary)]">
            지금 {label}
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-[var(--blue500)]" />
        </div>
      </div>
    </div>
  );
}

/** 구장 열 × 시작 시각 줄. 같은 칸에 겹친 경기는 세로로 쌓는다. */
export function OperationsTimeline({ columns, cards, nowTimeLabel, renderCard }: OperationsTimelineProps) {
  if (columns.length === 0) return null;
  const groups = groupByTime(cards);
  const rowStyle: CSSProperties = { gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` };
  const nowIndex = nowTimeLabel === null ? -1 : groups.findIndex((g) => g.time > nowTimeLabel);
  const nowAt = nowTimeLabel === null ? null : nowIndex === -1 ? groups.length : nowIndex;

  return (
    <div role="table" aria-label="구장별 경기 시간표" className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
      <div role="row" style={rowStyle} className="grid gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
        <div role="columnheader">
          <span className="sr-only">시간</span>
        </div>
        {columns.map((column) => (
          <div key={column.key} role="columnheader" className="min-w-0">
            <p className="font-semibold text-[var(--text-strong)]">{column.name}</p>
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {column.staffLine}
              {column.expiresLabel === null ? null : (
                <>
                  {' · '}
                  <span className="font-semibold text-[var(--orange700)]">{column.expiresLabel}</span>
                </>
              )}
              {` · 경기 ${column.count}`}
            </p>
          </div>
        ))}
      </div>
      {groups.map((group, index) => (
        <Fragment key={group.time}>
          {nowAt === index && nowTimeLabel !== null ? <NowRow label={nowTimeLabel} /> : null}
          <div role="row" style={rowStyle} className="grid gap-2 px-3 py-1.5">
            <div role="rowheader" className="pt-3 text-[length:var(--font-size-caption)] tabular-nums text-[var(--text-muted)]">
              {group.time}
            </div>
            {columns.map((column) => (
              <div key={column.key} role="cell" className="flex min-w-0 flex-col gap-2">
                {group.cards.filter((card) => card.fieldKey === column.key).map(renderCard)}
              </div>
            ))}
          </div>
        </Fragment>
      ))}
      {nowAt === groups.length && nowTimeLabel !== null ? <NowRow label={nowTimeLabel} /> : null}
    </div>
  );
}
