import { BoardCardStateBadge, WarningBadge } from '@/components/tournament-ops/badges';
import { formatPenaltyShootout, readGameResultScore } from '@/lib/game-result-score';
import { CardActionLink } from './board-card';
import type { BoardCard, CardAction } from './ops-board-model';

const CONSOLE_FALLBACK: CardAction = { kind: 'console', label: '경기 콘솔 열기', emphasis: 'secondary' };

interface OperationsListViewProps {
  cards: readonly BoardCard[];
  isDesktop: boolean;
  liveBase: string;
  consoleQuery: string;
  onOpenInfo: (card: BoardCard) => void;
}

function ResultText({ card }: { card: BoardCard }) {
  const { item } = card;
  if (item.currentRevisionState === 'VOID') {
    return <span className="text-[length:var(--font-size-caption)] font-medium text-[var(--red700)]">결과 무효</span>;
  }
  const score = item.currentRevisionState === 'OFFICIAL' ? readGameResultScore(item.currentScore) : null;
  if (score === null) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <span className="tabular-nums">
      <span className="font-medium text-[var(--text-strong)]">
        {score.home}:{score.away}
      </span>
      {score.penalties ? (
        <span className="block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{formatPenaltyShootout(score.penalties)}</span>
      ) : null}
    </span>
  );
}

function ChecksCell({ card }: { card: BoardCard }) {
  if (card.checks.length === 0) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {card.checks.map((code) => (
        <WarningBadge key={code} code={code} />
      ))}
    </span>
  );
}

function TitleButton({ card, onOpenInfo }: { card: BoardCard; onOpenInfo: (card: BoardCard) => void }) {
  return (
    <button
      type="button"
      aria-label={`${card.title} 경기 정보`}
      onClick={() => onOpenInfo(card)}
      className="min-h-11 min-w-0 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
    >
      <span className="block break-words font-medium text-[var(--text-strong)]">{card.title}</span>
      {card.subtitle ? <span className="block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{card.subtitle}</span> : null}
    </button>
  );
}

const TH = 'px-4 py-3 text-left text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]';

/** 경기를 한 줄씩 보는 표. 판에서 보기 어려운 긴 대회·리그를 위한 보기이고, 할 일은 카드와 같은 규칙이다. */
export function OperationsListView({ cards, isDesktop, liveBase, consoleQuery, onOpenInfo }: OperationsListViewProps) {
  if (!isDesktop) {
    return (
      <ul className="flex flex-col gap-2" role="list">
        {cards.map((card) => (
          <li key={card.fixtureId} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <TitleButton card={card} onOpenInfo={onOpenInfo} />
              <BoardCardStateBadge state={card.state} />
            </div>
            <p className="text-[length:var(--font-size-caption)] tabular-nums text-[var(--text-muted)]">
              {[card.timeLabel ?? '시간 미정', card.fieldName ?? '구장 미정'].join(' · ')}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap gap-1">
                <ChecksCell card={card} />
              </span>
              <CardActionLink card={card} action={card.action ?? CONSOLE_FALLBACK} liveBase={liveBase} consoleQuery={consoleQuery} />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
      <table className="w-full table-fixed text-[length:var(--font-size-body-sm)] text-[var(--text-body)]">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[14%]" />
          <col className="w-[9%]" />
          <col className="w-[16%]" />
          <col className="w-[19%]" />
        </colgroup>
        <thead className="border-b border-[var(--border)] bg-[var(--surface-soft)]">
          <tr>
            <th scope="col" className={TH}>경기</th>
            <th scope="col" className={TH}>시간</th>
            <th scope="col" className={TH}>구장</th>
            <th scope="col" className={TH}>상태</th>
            <th scope="col" className={TH}>결과</th>
            <th scope="col" className={TH}>확인할 것</th>
            <th scope="col" className={TH}>다음 할 일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {cards.map((card) => (
            <tr key={card.fixtureId}>
              <td className="px-4 py-2 align-middle">
                <TitleButton card={card} onOpenInfo={onOpenInfo} />
              </td>
              <td className="px-4 py-3 align-middle tabular-nums">{card.timeLabel ?? '시간 미정'}</td>
              <td className="px-4 py-3 align-middle">{card.fieldName ?? '구장 미정'}</td>
              <td className="px-4 py-3 align-middle">
                <BoardCardStateBadge state={card.state} />
              </td>
              <td className="px-4 py-3 align-middle">
                <ResultText card={card} />
              </td>
              <td className="px-4 py-3 align-middle">
                <ChecksCell card={card} />
              </td>
              <td className="px-4 py-2 align-middle">
                <CardActionLink card={card} action={card.action ?? CONSOLE_FALLBACK} liveBase={liveBase} consoleQuery={consoleQuery} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
