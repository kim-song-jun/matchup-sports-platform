'use client';

import { AlertTriangle, ArrowLeftRight, Ellipsis, Goal } from 'lucide-react';

export type RecordCellKey = 'GOAL' | 'OWN_GOAL' | 'YELLOW' | 'RED' | 'FOUL' | 'SUBSTITUTION' | 'MORE';

export interface RecordGridProps {
  readonly cells: ReadonlyArray<{ readonly key: RecordCellKey; readonly label: string; readonly disabled?: boolean }>;
  readonly onSelect: (key: RecordCellKey) => void;
}

// 뜻은 글자가 전한다. 아이콘은 모두 같은 회색이고, 색은 카드 모양(옐로·레드)에만 둔다 — 그 색이 곧 뜻이라서.
function CellIcon({ cell }: { cell: RecordCellKey }) {
  switch (cell) {
    case 'GOAL':
    case 'OWN_GOAL':
      return <Goal size={20} aria-hidden="true" className="text-[var(--text-body)]" />;
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
      return <AlertTriangle size={20} aria-hidden="true" className="text-[var(--text-body)]" />;
    case 'SUBSTITUTION':
      return <ArrowLeftRight size={20} aria-hidden="true" className="text-[var(--text-body)]" />;
    case 'MORE':
      return <Ellipsis size={20} aria-hidden="true" className="text-[var(--text-body)]" />;
  }
}

/** 엄지로 누르는 큰 기록 버튼. 경기 단계가 바뀌어도 칸의 자리는 그대로다. 테두리 없는 흰 칸이 위 카드들과 같은 폭으로 놓인다. */
export function RecordGrid({ cells, onSelect }: RecordGridProps) {
  return (
    <div role="group" aria-label="기록하기" data-console-guide="events" className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      {cells.map((cell) => (
        <button
          key={cell.key}
          type="button"
          aria-haspopup="dialog"
          disabled={cell.disabled === true}
          onClick={() => onSelect(cell.key)}
          className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-[var(--radius-container)] bg-[var(--card-surface)] text-[var(--text-strong)] transition-colors hover:bg-[var(--grey150)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CellIcon cell={cell.key} />
          {/* 글자 크기는 span 에 둔다 — 전역 `button { font: inherit }` 가 버튼에 단 글자 유틸리티를 이긴다. */}
          <span className="text-[length:var(--font-size-body)] font-semibold">{cell.label}</span>
        </button>
      ))}
    </div>
  );
}
