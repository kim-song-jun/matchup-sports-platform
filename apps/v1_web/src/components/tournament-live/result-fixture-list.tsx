import { useId } from 'react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { ResultListBadge } from '@/components/tournament-ops/badges';
import { formatGameResultScoreWithPenalties, readGameResultScore } from '@/lib/game-result-score';
import { kstTimeLabel } from './ops-board-model';
import type { TournamentOperationsBoardItem } from '@/hooks/use-tournament-result-review';

export type ResultListItem = TournamentOperationsBoardItem & { gameId: string };

interface ResultFixtureListProps {
  pending: readonly ResultListItem[];
  confirmed: readonly ResultListItem[];
  selectedFixtureId: string | null;
  onSelect: (item: ResultListItem) => void;
  titleFor: (item: ResultListItem) => string;
  boardHref: string;
}

function metaOf(item: ResultListItem): string {
  return [
    item.fieldName,
    item.scheduledAt ? kstTimeLabel(item.scheduledAt) : null,
    typeof item.fixtureNumber === 'number' ? `${item.fixtureNumber}번 경기` : null,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

function Row({ item, confirmed, selected, onSelect, title }: { item: ResultListItem; confirmed: boolean; selected: boolean; onSelect: (item: ResultListItem) => void; title: string }) {
  const score = confirmed && readGameResultScore(item.currentScore) !== null ? formatGameResultScoreWithPenalties(item.currentScore) : null;
  const meta = metaOf(item);
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(item)}
        className={`flex min-h-11 w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${
          selected ? 'border-[var(--blue500)] bg-[var(--blue50)]' : 'border-[var(--border)] bg-[var(--card-surface)] hover:bg-[var(--surface-soft)]'
        }`}
      >
        <span className="min-w-0">
          <span className="block break-words font-semibold text-[var(--text-strong)]">{title}</span>
          {meta ? <span className="mt-0.5 block text-[length:var(--font-size-caption)] tabular-nums text-[var(--text-muted)]">{meta}</span> : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <ResultListBadge confirmed={confirmed} />
          {score ? <span className="text-[length:var(--font-size-label)] font-semibold tabular-nums text-[var(--text-strong)]">{score}</span> : null}
        </span>
      </button>
    </li>
  );
}

/** 끝난 경기를 확정 대기와 확정됨 두 묶음으로 보여 준다. 대기 줄의 점수는 패널에서 본다. */
export function ResultFixtureList({ pending, confirmed, selectedFixtureId, onSelect, titleFor, boardHref }: ResultFixtureListProps) {
  const pendingId = useId();
  const confirmedId = useId();
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={pendingId} className="flex flex-col gap-2">
        <h2 id={pendingId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
          확정 대기 {pending.length}
        </h2>
        {pending.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3">
            <p className="font-medium text-[var(--text-strong)]">지금 확정할 결과가 없어요</p>
            <Link href={boardHref} className="inline-flex min-h-11 items-center text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] underline underline-offset-2">
              운영 보드로 가기
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {pending.map((item) => (
              <Row key={item.fixtureId} item={item} confirmed={false} selected={item.fixtureId === selectedFixtureId} onSelect={onSelect} title={titleFor(item)} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby={confirmedId} className="flex flex-col gap-2">
        <h2 id={confirmedId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
          확정됨 {confirmed.length}
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">아직 확정된 결과가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {confirmed.map((item) => (
              <Row key={item.fixtureId} item={item} confirmed selected={item.fixtureId === selectedFixtureId} onSelect={onSelect} title={titleFor(item)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
