'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  /** UX 감사 item 2 — 제공되면 "제출된 선발 명단이 없어요" 빈 상태에 그 사이드의
   * 라인업 화면으로 가는 링크를 함께 보여준다. 라인업 없이 이미 LIVE가 된
   * 경기(막다른 길)도 이 자리에서 바로 복구할 수 있게 하기 위함이다. 둘 다
   * 없으면(예: 팀매치 경량 콘솔, 기존 테스트) 링크 없이 문구만 보여준다. */
  readonly tournamentId?: string;
  readonly fixtureId?: string;
}

/** The latest lineup for a side is the highest `revision` row among
 * `SUBMITTED`/`LOCKED` states — a `DRAFT` still belongs to the lineup
 * builder (Task 15), not to live operation. Exported so the console
 * (operate-console.tsx) can reuse the exact same "has this side actually
 * submitted a lineup?" check when it decides whether `start` is available
 * (UX audit item 2) — a second, slightly different definition of "submitted"
 * would silently drift from what this grid itself shows as empty. */
export function latestOperableLineup(lineups: readonly GameLineup[], sideId: string): GameLineup | null {
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
  tournamentId,
  fixtureId,
}: LineupGridProps) {
  const visibleSides = restrictSideId === undefined ? sides : sides.filter((side) => side.id === restrictSideId);
  // 모바일(390px)에서는 두 사이드가 세로로 쌓여, 원정팀을 보려면 홈팀 전체를
  // 스크롤해야 했다(UX 감사 item 5) — sm(640px) 이상은 이미 2열이라 둘 다 한
  // 화면에 보이므로 탭은 모바일에서만 의미가 있다. 탭을 눌러도 두 sections는
  // 여전히 각자의 팀명 헤더를 유지한다 — "어느 팀 선수인지 헷갈리지 않는다"는
  // 기존 보장(좌우 분리 + 팀명 헤더)은 그대로 두고, 모바일에서 안 보이는 쪽만
  // `hidden`으로 감춘다(sm 이상에서는 항상 둘 다 보인다).
  const [selectedMobileSideId, setSelectedMobileSideId] = useState<string | null>(null);
  const activeMobileSideId = selectedMobileSideId ?? visibleSides[0]?.id ?? null;

  return (
    <div>
      {visibleSides.length > 1 ? (
        <div role="tablist" aria-label="팀 선택" className="mb-3 flex gap-1 rounded-lg bg-[var(--surface-soft)] p-1 sm:hidden">
          {visibleSides.map((side) => (
            <button
              key={side.id}
              type="button"
              role="tab"
              aria-selected={activeMobileSideId === side.id}
              onClick={() => setSelectedMobileSideId(side.id)}
              className={[
                'min-h-[44px] flex-1 rounded-md px-2 text-sm font-semibold transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                activeMobileSideId === side.id
                  ? 'bg-[var(--grey300)] text-[var(--text-strong)] shadow-sm'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
            >
              {side.displayNameSnapshot}
              <span className="ml-1 text-2xs font-normal opacity-70">
                {side.sideKey === 'HOME' ? '홈' : '원정'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleSides.map((side) => {
          const lineup = latestOperableLineup(lineups, side.id);
          const participants = (lineup?.participants ?? []).filter(
            (participant) => filterParticipantIds === undefined || filterParticipantIds.has(participant.id),
          );
          const isActiveOnMobile = visibleSides.length <= 1 || activeMobileSideId === side.id;
          return (
            <section
              key={side.id}
              aria-labelledby={`lineup-side-${side.id}-heading`}
              className={`rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3 ${isActiveOnMobile ? '' : 'hidden sm:block'}`}
            >
              <h3
                id={`lineup-side-${side.id}-heading`}
                className="mb-2 text-sm font-semibold text-[var(--text-strong)]"
              >
                {side.displayNameSnapshot}
                <span className="ml-1.5 text-2xs font-normal text-[var(--text-muted)]">
                  {side.sideKey === 'HOME' ? '홈' : '원정'}
                </span>
              </h3>

              {lineup === null || participants.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <p className="text-sm text-[var(--text-muted)]">
                    {lineup === null ? '제출된 선발 명단이 없어요.' : '표시할 선수가 없어요.'}
                  </p>
                  {lineup === null && tournamentId !== undefined && fixtureId !== undefined ? (
                    <Link
                      href={`/tournaments/${tournamentId}/matches/${fixtureId}/lineup`}
                      className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      라인업 제출하러 가기
                    </Link>
                  ) : null}
                </div>
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
                          'hover:bg-[var(--blue50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                          disabled ? 'cursor-not-allowed opacity-50' : '',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] text-2xs font-bold tabular-nums text-[var(--text-muted)]"
                        >
                          {participant.jerseyNumber ?? '-'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                            {participant.displayNameSnapshot}
                          </span>
                          {participant.position ? (
                            <span className="block text-2xs text-[var(--text-muted)]">
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
    </div>
  );
}
