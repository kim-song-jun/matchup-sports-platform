'use client';

import { AlertTriangle, ArrowLeftRight, Ellipsis, Goal } from 'lucide-react';

export type RecordCellKey = 'GOAL' | 'OWN_GOAL' | 'YELLOW' | 'RED' | 'FOUL' | 'SUBSTITUTION' | 'MORE';

export interface RecordGridProps {
  readonly cells: ReadonlyArray<{ readonly key: RecordCellKey; readonly label: string; readonly disabled?: boolean }>;
  readonly onSelect: (key: RecordCellKey) => void;
}

// 뜻은 글자가 전하고 색은 작은 아이콘에만 둔다 — 칸 배경은 모두 같은 중립색이다.
function CellIcon({ cell }: { cell: RecordCellKey }) {
  switch (cell) {
    case 'GOAL':
      return <Goal size={20} aria-hidden="true" className="text-[var(--green700)]" />;
    case 'OWN_GOAL':
      return <Goal size={20} aria-hidden="true" className="text-[var(--text-muted)]" />;
    case 'YELLOW':
    case 'RED':
      // 카드 모양이라 모서리를 토큰(4px)보다 작게 둔다.
      return (
        <span
          aria-hidden="true"
          className={`block h-4 w-3 rounded-[2px] ${cell === 'RED' ? 'bg-[var(--red500)]' : 'bg-[var(--yellow500)]'}`}
        />
      );
    case 'FOUL':
      return <AlertTriangle size={20} aria-hidden="true" className="text-[var(--text-muted)]" />;
    case 'SUBSTITUTION':
      return <ArrowLeftRight size={20} aria-hidden="true" className="text-[var(--blue700)]" />;
    case 'MORE':
      return <Ellipsis size={20} aria-hidden="true" className="text-[var(--text-muted)]" />;
  }
}

/** 엄지로 누르는 큰 기록 버튼. 경기 단계가 바뀌어도 칸의 자리는 그대로다. */
export function RecordGrid({ cells, onSelect }: RecordGridProps) {
  return (
    <div role="group" aria-label="기록하기" data-console-guide="events" className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-6">
      {cells.map((cell) => (
        <button
          key={cell.key}
          type="button"
          disabled={cell.disabled === true}
          onClick={() => onSelect(cell.key)}
          className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CellIcon cell={cell.key} />
          {cell.label}
        </button>
      ))}
    </div>
  );
}
