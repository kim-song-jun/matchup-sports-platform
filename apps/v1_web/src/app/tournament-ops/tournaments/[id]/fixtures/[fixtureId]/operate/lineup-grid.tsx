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
  /** Live-substitution addition — when set, only participants whose id is in
   * this set render (both sections still keep their empty-state message when
   * everyone on that side is filtered out). Used by `ActionTargetPicker`'s
   * substitution step to show "나갈 선수" as on-pitch-only, then "들어올 선수"
   * as bench-only, without changing this component's default (unfiltered)
   * behavior for every other caller. */
  readonly filterParticipantIds?: ReadonlySet<string>;
  /** Live-substitution addition — when set, only this one side's section
   * renders. Used by the "들어올 선수" step, which is scoped to the outgoing
   * player's own side. */
  readonly restrictSideId?: string;
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

export function LineupGrid({
  sides,
  lineups,
  onSelectPlayer,
  disabled = false,
  filterParticipantIds,
  restrictSideId,
}: LineupGridProps) {
  const visibleSides = restrictSideId === undefined ? sides : sides.filter((side) => side.id === restrictSideId);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visibleSides.map((side) => {
        const lineup = latestOperableLineup(lineups, side.id);
        const participants = (lineup?.participants ?? []).filter(
          (participant) => filterParticipantIds === undefined || filterParticipantIds.has(participant.id),
        );
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

            {lineup === null || participants.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {lineup === null ? '제출된 선발 명단이 없어요.' : '표시할 선수가 없어요.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5" role="list">
                {participants.map((participant) => (
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
