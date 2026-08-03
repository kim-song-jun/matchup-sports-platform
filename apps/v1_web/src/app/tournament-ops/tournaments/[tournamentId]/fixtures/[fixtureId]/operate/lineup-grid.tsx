'use client';

import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';

/**
 * Task 21 — tappable player grid for the live operations console.
 *
 * "Player tap must visibly freeze the captured match time until the event
 * is committed or explicitly cancelled" — this component only SELECTS a
 * player; the parent (`operate-console.tsx`) is what freezes the clock and
 * opens the event-capture step, since the freeze instant must be captured
 * at the exact moment of tap, not re-derived later.
 */

export interface LineupGridProps {
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  readonly onSelectPlayer: (input: {
    readonly sideId: string;
    readonly participant: GameLineupParticipant;
  }) => void;
  readonly disabled?: boolean;
}

/** The latest lineup for a side is the highest `revision` row among
 * `SUBMITTED`/`LOCKED` states — a `DRAFT` still belongs to the lineup
 * builder (Task 15), not to live operation. */
function latestOperableLineup(lineups: readonly GameLineup[], sideId: string): GameLineup | null {
  const candidates = lineups.filter(
    (lineup) => lineup.sideId === sideId && (lineup.state === 'SUBMITTED' || lineup.state === 'LOCKED'),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) => (current.revision > latest.revision ? current : latest));
}

export function LineupGrid({ sides, lineups, onSelectPlayer, disabled = false }: LineupGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {sides.map((side) => {
        const lineup = latestOperableLineup(lineups, side.id);
        return (
          <section
            key={side.id}
            aria-labelledby={`lineup-side-${side.id}-heading`}
            className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <h3
              id={`lineup-side-${side.id}-heading`}
              className="mb-2 text-sm font-semibold text-gray-900 dark:text-white"
            >
              {side.displayNameSnapshot}
              <span className="ml-1.5 text-2xs font-normal text-gray-400 dark:text-gray-500">
                {side.sideKey === 'HOME' ? '홈' : '원정'}
              </span>
            </h3>

            {lineup === null || lineup.participants.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                제출된 선발 명단이 없어요.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5" role="list">
                {lineup.participants.map((participant) => (
                  <li key={participant.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelectPlayer({ sideId: side.id, participant })}
                      aria-label={`${participant.displayNameSnapshot} 선수 이벤트 기록`}
                      className={[
                        'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                        'hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                        'dark:hover:bg-blue-500/10',
                        disabled ? 'cursor-not-allowed opacity-50' : '',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xs font-bold tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      >
                        {participant.jerseyNumber ?? '-'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                          {participant.displayNameSnapshot}
                        </span>
                        {participant.position ? (
                          <span className="block text-2xs text-gray-400 dark:text-gray-500">
                            {participant.position}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
