'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';
import { jerseyText } from './player-label';

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

/**
 * **표시·검인용**: 제출본이 있으면 그것을, 하나도 없으면 그 사이드의 **최신 리비전을
 * 상태와 무관하게** 쓴다.
 *
 * `latestOperableLineup` 과 **일부러 다르게 동작한다. 둘을 하나로 합치지 마라** --
 * 소비처마다 옳은 답이 다르다:
 *
 * | 쓰는 곳 | 써야 하는 것 | 이유 |
 * |---|---|---|
 * | 라인업 그리드 · 검인 패널 · 콘솔 표시 | **이 함수(폴백)** | 화면에 선수가 떠야 운영이 된다 |
 * | "아직 제출 안 했어요" 경고 판정 | `latestOperableLineup` | 폴백을 쓰면 경고가 영영 안 뜬다 |
 *
 * **왜 생겼나**: 예전에는 "양 팀이 제출해야 경기를 시작할 수 있다"는 게이트가 있어서
 * 라이브 경기에는 제출본이 항상 있었다 -- 그래서 표시도 제출본만 보면 됐다. P1-c 가 그
 * 게이트를 걷어내면서(등록 명단이 곧 참가자라 제출 없이도 기록할 대상이 있다) 그 전제가
 * 깨졌고, 표시 경로를 그대로 두면 **미제출 상태로 시작한 경기의 콘솔이 통째로 빈다** --
 * 운영자가 득점을 아무에게도 못 붙이고, 검인할 대상도 안 뜬다(P1-b 에서 지킨 `arrivedAt`
 * 을 애초에 만들 수 없게 된다).
 *
 * 서버도 같은 이유로 같은 규칙을 쓴다(`selectLineupParticipantsWithDraftFallback`).
 * **서버와 클라이언트가 다른 명단을 보면 안 된다** -- 실제로 P1-c 직후 그 둘이 갈려
 * 있었고, API 만 측정해서 알아채지 못했다.
 *
 * 원래 막으려던 것은 그대로 막는다: 제출본이 **있는** 사이드에서는 그 위에 얹힌 DRAFT
 * (정정 요청으로 재오픈된 초안)가 직전 제출을 밀어내지 못한다.
 */
export function latestLineupForDisplay(lineups: readonly GameLineup[], sideId: string): GameLineup | null {
  const operable = latestOperableLineup(lineups, sideId);
  if (operable !== null) return operable;
  const candidates = lineups.filter((lineup) => lineup.sideId === sideId);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) => (current.revision > latest.revision ? current : latest));
}

/**
 * 검색어로 선수를 좁힌다. 등번호와 이름 **양쪽**을 본다 — 현장에서 운영자가 아는
 * 정보는 둘 중 하나이고(유니폼 번호를 보고 찾거나, 후보 선수가 이름을 불러주거나),
 * 어느 쪽만 지원하면 나머지 절반은 여전히 스크롤로 훑어야 한다.
 *
 * 대소문자·앞뒤 공백을 무시한다. 등번호는 **접두 일치**다 — "1"로 1·10·11이 함께
 * 뜨는 게 맞다(운영자가 두 자리 번호를 한 자만 기억하는 경우가 실제로 있다).
 * 반대로 이름은 부분 일치라 성만 쳐도 찾힌다.
 */
export function matchesPlayerQuery(
  participant: Pick<GameLineupParticipant, 'displayNameSnapshot' | 'jerseyNumber'>,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return true;
  if (participant.displayNameSnapshot.toLowerCase().includes(query)) return true;
  if (participant.jerseyNumber === null) return false;
  return String(participant.jerseyNumber).startsWith(query);
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
  /**
   * 선수 검색어. 1차 대회 회고 — 실시간 입력을 "후보 선수들에게 물어보고 얘기하면서"
   * 진행했다. 스쿼드가 15~20명이면 등번호순 정렬만으로는 스크롤하며 눈으로 훑어야
   * 하고, 경기 중 그 몇 초가 오입력으로 이어진다.
   *
   * **컴포넌트 로컬 상태**로 둔다 — 부모가 관리하면 이벤트 기록 한 번마다 검색어가
   * 초기화될지 유지될지가 호출부마다 갈린다. 여기서는 "이 그리드가 떠 있는 동안
   * 유지"가 유일한 규칙이다.
   */
  const [query, setQuery] = useState('');

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
              <span className="ml-1 text-xs font-normal opacity-70">
                {side.sideKey === 'HOME' ? '홈' : '원정'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {/* 검색은 교체 대상 선택처럼 목록이 이미 한두 명으로 좁혀진 단계에서는 방해만
          된다 — filterParticipantIds 가 걸린 호출(ActionTargetPicker 의 교체 1·2단계)에는
          띄우지 않는다. */}
      {filterParticipantIds === undefined ? (
        <div className="mb-3">
          <label htmlFor="lineup-grid-player-search" className="sr-only">
            등번호 또는 이름으로 선수 찾기
          </label>
          <input
            id="lineup-grid-player-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled}
            placeholder="등번호 또는 이름"
            autoComplete="off"
            className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleSides.map((side) => {
          const lineup = latestLineupForDisplay(lineups, side.id);
          const participants = (lineup?.participants ?? [])
            .filter(
              (participant) => filterParticipantIds === undefined || filterParticipantIds.has(participant.id),
            )
            .filter((participant) => matchesPlayerQuery(participant, query));
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
                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                  {side.sideKey === 'HOME' ? '홈' : '원정'}
                </span>
              </h3>

              {lineup === null || participants.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <p className="text-sm text-[var(--text-muted)]">
                    {lineup === null
                      // [P1-c 후속] 예전엔 '제출된 선발 명단이 없어요' 였다. 이제 표시는
                      // 폴백을 쓰므로 여기까지 왔다는 건 **초안조차 없다**는 뜻이다 --
                      // 등록 명단에서 참가자가 만들어지므로 정상적으로는 도달하지 않는다.
                      ? '이 팀의 명단을 찾을 수 없어요.'
                      : query.trim().length > 0
                        ? `'${query.trim()}'과 맞는 선수가 없어요.`
                        : '표시할 선수가 없어요.'}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2" role="list">
                  {participants.map((participant) => (
                    <li key={participant.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelectPlayer({ sideId: side.id, participant })}
                        aria-label={`${participant.displayNameSnapshot} 선수 이벤트 기록`}
                        className={[
                          'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          'hover:bg-[var(--blue50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                          disabled ? 'cursor-not-allowed opacity-50' : '',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] text-xs font-bold tabular-nums text-[var(--text-muted)]"
                        >
                          {jerseyText(participant.jerseyNumber)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                            {participant.displayNameSnapshot}
                          </span>
                          {participant.position ? (
                            <span className="block text-xs text-[var(--text-muted)]">
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
