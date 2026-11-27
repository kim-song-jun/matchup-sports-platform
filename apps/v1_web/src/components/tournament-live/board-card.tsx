import { Check, Pencil, Play, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { BoardCardStateBadge } from '@/components/tournament-ops/badges';
import { formatPenaltyShootout, readGameResultScore } from '@/lib/game-result-score';
import { resultsHref } from '@/lib/tournament-live-routes';
import type { BoardCard, CardAction, CardActionKind, CardState } from './ops-board-model';

const CARD_SURFACE: Record<CardState, string> = {
  live: 'bg-[var(--blue50)]',
  'result-pending': 'bg-[var(--tint-orange)]',
  'result-done': 'bg-[var(--surface-soft)]',
  scheduled: 'bg-[var(--card-surface)]',
  cancelled: 'bg-[var(--surface-soft)]',
};

const ACTION_ICON: Record<CardActionKind, ReactNode> = {
  console: <Play size={14} aria-hidden="true" />,
  'confirm-result': <Check size={14} aria-hidden="true" />,
  'fix-result': <Pencil size={14} aria-hidden="true" />,
  'assign-staff': <UserPlus size={14} aria-hidden="true" />,
};

const ACTION_TONE: Record<CardAction['emphasis'], string> = {
  primary: 'bg-[var(--button-fill-primary)] text-[var(--button-text-primary)] hover:bg-[var(--button-fill-primary-hover)]',
  secondary: 'border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-strong)] hover:bg-[var(--surface-soft)]',
  warning: 'bg-[var(--orange50)] text-[var(--orange700)] hover:bg-[var(--tint-orange)]',
};

function actionHref(action: CardAction, card: BoardCard, liveBase: string, consoleQuery: string): string {
  switch (action.kind) {
    case 'console':
      return `${liveBase}/fixtures/${encodeURIComponent(card.fixtureId)}/operate${consoleQuery}`;
    case 'confirm-result':
    case 'fix-result':
      return resultsHref(liveBase, card.fixtureId);
    case 'assign-staff':
      return `${liveBase}/staff`;
  }
}

function footerText(card: BoardCard): string {
  if (card.staffMissing) return '구장 담당자가 없어요';
  if (card.isFieldNext) return card.fieldName === null ? '다음 경기' : `${card.fieldName} 다음 경기`;
  return card.subtitle;
}

interface CardActionLinkProps {
  card: BoardCard;
  action: CardAction;
  liveBase: string;
  consoleQuery: string;
}

/** 카드·목록 행이 쓰는 할 일 버튼 하나. 이름에 경기 제목을 붙여 같은 문구끼리 구분한다. */
export function CardActionLink({ card, action, liveBase, consoleQuery }: CardActionLinkProps) {
  return (
    <Link
      href={actionHref(action, card, liveBase, consoleQuery)}
      aria-label={`${card.title} ${action.label}`}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[length:var(--font-size-label)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${ACTION_TONE[action.emphasis]}`}
    >
      {ACTION_ICON[action.kind]}
      {action.label}
    </Link>
  );
}

interface BoardCardViewProps {
  card: BoardCard;
  liveBase: string;
  consoleQuery: string;
  /** 구장 열이 없는 목록에서 카드가 구장 이름을 직접 알린다. */
  showField?: boolean;
  onOpenInfo: (card: BoardCard) => void;
}

/** 경기 한 장 — 상태 배지와 할 일 하나. 나머지는 제목을 눌러 여는 경기 정보에서 한다. */
export function BoardCardView({ card, liveBase, consoleQuery, showField = false, onOpenInfo }: BoardCardViewProps) {
  const { item, action } = card;
  const score = item.currentRevisionState === 'OFFICIAL' ? readGameResultScore(item.currentScore) : null;
  const topLine = [
    card.timeLabel ?? '시간 미정',
    typeof item.fixtureNumber === 'number' ? `${item.fixtureNumber}번 경기` : null,
    showField ? (card.fieldName ?? '구장 미정') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const text = footerText(card);

  return (
    <article
      aria-label={card.title}
      className={`flex flex-col gap-2 rounded-xl border border-[var(--border)] px-3 py-3 ${CARD_SURFACE[card.state]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          aria-label={`${card.title} 경기 정보`}
          onClick={() => onOpenInfo(card)}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <span className="block text-[length:var(--font-size-caption)] tabular-nums text-[var(--text-muted)]">{topLine}</span>
          <span className="mt-1 flex items-baseline justify-between gap-2">
            <span className="min-w-0 break-words font-semibold text-[var(--text-strong)]">{card.title}</span>
            {score ? (
              <span className="shrink-0 font-bold tabular-nums text-[var(--text-strong)]">
                {score.home} : {score.away}
              </span>
            ) : null}
          </span>
          {score?.penalties ? (
            <span className="block text-right text-[length:var(--font-size-caption)] tabular-nums text-[var(--text-muted)]">
              {formatPenaltyShootout(score.penalties)}
            </span>
          ) : null}
        </button>
        <BoardCardStateBadge state={card.state} />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <span
          className={`min-w-0 text-[length:var(--font-size-caption)] ${
            card.staffMissing ? 'font-medium text-[var(--orange700)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {text}
        </span>
        {action ? <CardActionLink card={card} action={action} liveBase={liveBase} consoleQuery={consoleQuery} /> : null}
      </div>
    </article>
  );
}
