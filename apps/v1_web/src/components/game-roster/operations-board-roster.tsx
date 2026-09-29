'use client';

import Link from 'next/link';
import type { V1AdminRegistrationRosterMatrix } from '@/hooks/use-v1-game-roster';
import type { V1GameRosterSummary } from '@/hooks/use-v1-api';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { withFromPath } from '@/lib/session-storage';
import type { V1TournamentOperationsBoardItem } from '@/types/api';

/** 운영 보드 한 경기·한 팀의 명단 요약. `opponentName` 은 그 팀 입장의 상대 — 리그 행의 팀명 대체로 쓴다. */
export type BoardRosterSide = { teamId: string; summary: V1GameRosterSummary | null; opponentName: string | null };

/** 명단 요약이 필요한 참가 신청 — 보이는 시작 전 경기의 양 팀. 조정은 시작 전에만 하므로 시작된 경기는 부르지 않는다. */
export function boardRosterRegistrationIds(items: readonly V1TournamentOperationsBoardItem[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.gameId === null || item.gameState !== 'SCHEDULED') continue;
    if (item.homeRegistrationId !== null) ids.add(item.homeRegistrationId);
    if (item.awayRegistrationId !== null) ids.add(item.awayRegistrationId);
  }
  return [...ids];
}

export type BoardRosterIndex = {
  /** `gameId` → `registrationId` → 그 팀 명단 요약. */
  games: Map<string, Map<string, BoardRosterSide>>;
  /** 표를 불러온 신청의 팀 — 표에 그 경기 열이 없어도 "명단" 버튼을 만들 수 있다. */
  teamIds: Map<string, string>;
};

export function indexBoardRosters(matrices: readonly V1AdminRegistrationRosterMatrix[]): BoardRosterIndex {
  const games = new Map<string, Map<string, BoardRosterSide>>();
  const teamIds = new Map<string, string>();
  for (const matrix of matrices) {
    teamIds.set(matrix.registrationId, matrix.teamId);
    for (const game of matrix.games) {
      const sides = games.get(game.gameId) ?? new Map<string, BoardRosterSide>();
      sides.set(matrix.registrationId, { teamId: matrix.teamId, summary: game.summary, opponentName: game.opponentName });
      games.set(game.gameId, sides);
    }
  }
  return { games, teamIds };
}

export type BoardRosterSideState = {
  registrationId: string | null;
  name: string | null;
  side: BoardRosterSide | null;
  /** 그 신청의 표를 불러왔으면 팀 id(열 유무와 무관), 아직이거나 실패면 null. */
  teamId: string | null;
  failed: boolean;
};

/**
 * 운영 보드 경기 카드의 "빠짐 N · 정지 N" 과 "명단" 버튼(Task 179). 빠짐 = 이번 경기 빠짐 + 결장.
 * 편집은 경기 명단 화면에서 운영자 권한으로 한다 — 보드에는 편집을 두지 않는다(운영 방해 없이).
 * 팀 표는 시작 시각이 지난 경기를 싣지 않지만 편집은 `SCHEDULED` 동안 열려 있어, 열이 없어도 버튼은 둔다.
 */
export function BoardRosterSummary({
  item,
  home,
  away,
  from,
}: {
  item: V1TournamentOperationsBoardItem;
  home: BoardRosterSideState;
  away: BoardRosterSideState;
  /** 명단 화면의 뒤로가기가 이 보드로 돌아오게 싣는 출처. */
  from: string | null;
}) {
  if (item.gameId === null || item.gameState !== 'SCHEDULED') return null;
  const gameId = item.gameId;
  const rows = [
    { key: 'home', state: home, fallbackName: home.name ?? away.side?.opponentName ?? '홈팀' },
    { key: 'away', state: away, fallbackName: away.name ?? home.side?.opponentName ?? '원정팀' },
  ].filter((row) => row.state.registrationId !== null && (row.state.teamId !== null || row.state.failed));
  if (rows.length === 0) return null;
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0" aria-label="경기 명단 요약">
      {rows.map(({ key, state, fallbackName }) => (
        <li key={key} className="flex flex-wrap items-center gap-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          {state.teamId === null ? (
            <span>{fallbackName} 명단 요약을 불러오지 못했어요</span>
          ) : (
            <>
              <span className="min-w-0 break-words">
                {fallbackName} · {state.side === null ? '요약은 명단 화면에서 볼 수 있어요' : summaryText(state.side.summary)}
              </span>
              <Link
                href={withFromPath(gameRosterScreenPath(state.teamId, gameId), from)}
                aria-label={`${fallbackName} 경기 명단`}
                className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 font-medium whitespace-nowrap text-[var(--text-body)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                명단
              </Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function summaryText(summary: V1GameRosterSummary | null): string {
  if (summary === null) return '참가 명단 없음';
  return `빠짐 ${summary.excluded + summary.unavailable} · 정지 ${summary.suspended}`;
}
