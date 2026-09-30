'use client';

import type { V1AdminRegistrationRosterMatrix } from '@/hooks/use-v1-game-roster';
import type { V1GameRosterSummary } from '@/hooks/use-v1-api';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
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

type BoardRosterRow = { key: 'home' | 'away'; state: BoardRosterSideState; name: string };

/**
 * 시작 전 경기의 팀별 명단 상태. 편집은 경기 명단 화면에서 운영자 권한으로 한다 — 보드에는 편집을
 * 두지 않는다(운영 방해 없이). 팀 표는 시작 시각이 지난 경기를 싣지 않지만 편집은 `SCHEDULED`
 * 동안 열려 있어, 열이 없어도 명단 화면으로 가는 길은 둔다.
 */
function boardRosterRows(
  item: V1TournamentOperationsBoardItem,
  home: BoardRosterSideState,
  away: BoardRosterSideState,
): BoardRosterRow[] {
  if (item.gameId === null || item.gameState !== 'SCHEDULED') return [];
  return [
    { key: 'home' as const, state: home, name: home.name ?? away.side?.opponentName ?? '홈팀' },
    { key: 'away' as const, state: away, name: away.name ?? home.side?.opponentName ?? '원정팀' },
  ].filter((row) => row.state.registrationId !== null && (row.state.teamId !== null || row.state.failed));
}

/**
 * 운영 보드 경고 칸에 함께 올라가는 명단 경고 문장. 빠짐 = 이번 경기 빠짐 + 결장.
 * 경고만 올린다 — 빠짐·정지가 모두 0 인 팀은 조치할 것이 없어 칸을 차지하지 않는다.
 * (명단 요약을 아직 못 읽은 팀 — 표에 그 경기 열이 없는 경우 — 도 경고가 아니라서 올리지 않는다.)
 */
export function boardRosterAlerts(
  item: V1TournamentOperationsBoardItem,
  home: BoardRosterSideState,
  away: BoardRosterSideState,
): string[] {
  const alerts: string[] = [];
  for (const { state, name } of boardRosterRows(item, home, away)) {
    if (state.teamId === null) {
      alerts.push(`${name} 명단 요약을 불러오지 못했어요`);
    } else if (state.side !== null) {
      if (state.side.summary === null) {
        alerts.push(`${name} 참가 명단 없음`);
      } else {
        const missing = state.side.summary.excluded + state.side.summary.unavailable;
        if (missing > 0 || state.side.summary.suspended > 0) {
          alerts.push(`${name} · 빠짐 ${missing} · 정지 ${state.side.summary.suspended}`);
        }
      }
    }
  }
  return alerts;
}

/** ⋯ 시트 안의 팀별 "경기 명단" 링크 — 명단 화면의 뒤로가기가 이 보드로 돌아오게 출처(`from`)를 싣는다. */
export function boardRosterLinkActions(
  item: V1TournamentOperationsBoardItem,
  home: BoardRosterSideState,
  away: BoardRosterSideState,
  from: string | null,
): ActionSheetAction[] {
  const gameId = item.gameId;
  if (gameId === null) return [];
  return boardRosterRows(item, home, away).flatMap(({ key, state, name }) =>
    state.teamId === null
      ? []
      : [
          {
            key: `roster-${key}`,
            label: `${name} 경기 명단`,
            description: '이번 경기에 뛸 선수를 확인하고 조정해요',
            href: withFromPath(gameRosterScreenPath(state.teamId, gameId), from),
          },
        ],
  );
}
