import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { BoardCard } from './ops-board-model';

interface OperationsPhoneListProps {
  cards: readonly BoardCard[];
  /** 구장 칩이 「전체」일 때 카드가 구장 이름을 직접 알린다. */
  showField: boolean;
  /** 선택한 날이 오늘일 때만 `HH:mm` 을 준다. */
  nowTimeLabel: string | null;
  renderCard: (card: BoardCard, showField: boolean) => ReactNode;
}

function NowSeparator({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={`지금 ${label}`} className="flex items-center gap-2">
      <span className="rounded-full bg-[var(--blue500)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold tabular-nums text-[var(--button-text-primary)]">
        지금 {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-[var(--blue500)]" />
    </div>
  );
}

/** 시간순 한 줄 목록. 끝난 경기(확정됨·취소됨)는 한 줄로 접고, 결과 확정 대기는 할 일이 남아 접지 않는다. */
export function OperationsPhoneList({ cards, showField, nowTimeLabel, renderCard }: OperationsPhoneListProps) {
  const finishedId = useId();
  const [finishedOpen, setFinishedOpen] = useState<boolean | null>(null);
  if (cards.length === 0) return null;

  const finished = cards.filter((c) => c.state === 'result-done' || c.state === 'cancelled');
  const active = cards.filter((c) => c.state !== 'result-done' && c.state !== 'cancelled');
  const open = finishedOpen ?? active.length === 0;
  const nowAt = nowTimeLabel === null ? -1 : active.findIndex((c) => c.timeLabel !== null && c.timeLabel > nowTimeLabel);
  const separatorAt = nowTimeLabel === null ? null : nowAt === -1 ? active.length : nowAt;

  return (
    <div className="flex flex-col gap-2">
      {finished.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={finishedId}
            onClick={() => setFinishedOpen(!open)}
            className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-[length:var(--font-size-label)] font-medium text-[var(--text-body)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            끝난 경기 {finished.length}
            <ChevronDown size={16} aria-hidden="true" className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <div id={finishedId} hidden={!open} className="flex flex-col gap-2">
            {open ? finished.map((card) => renderCard(card, showField)) : null}
          </div>
        </>
      ) : null}
      {active.map((card, index) => (
        <div key={card.fixtureId} className="flex flex-col gap-2">
          {separatorAt === index && nowTimeLabel !== null ? <NowSeparator label={nowTimeLabel} /> : null}
          {renderCard(card, showField)}
        </div>
      ))}
      {separatorAt === active.length && nowTimeLabel !== null ? <NowSeparator label={nowTimeLabel} /> : null}
    </div>
  );
}
