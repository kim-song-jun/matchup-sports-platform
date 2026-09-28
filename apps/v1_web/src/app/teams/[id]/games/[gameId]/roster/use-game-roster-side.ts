'use client';

import { useV1Game, useV1TeamUpcomingGames } from '@/hooks/use-v1-api';

export type GameRosterSideResolution =
  | { status: 'loading' }
  | { status: 'resolved'; sideId: string; opponentName: string | null; title: string | null }
  /** 친선 경기 — 명단 조정 대상이 아니라 참석명단 화면으로 보낸다. */
  | { status: 'friendly'; teamMatchId: string | null }
  | { status: 'not-found' }
  | { status: 'error'; error: unknown };

/**
 * 경로(`/teams/:teamId/games/:gameId/roster`)에는 사이드가 없어 여기서 찾는다 — 알림 딥링크가 이 경로를 쓴다.
 *
 * 두 출처가 서로 다른 사람을 덮는다.
 * - 팀 다가오는 경기: 그 팀 활성 멤버 누구나 받지만 **시작 전 경기만** 온다.
 * - 경기 조회(`GET /games/:id`): 시작 뒤에도 오지만 대회 경기는 팀 owner·manager·운영자만 읽는다.
 * 앞에서 못 찾으면 뒤를 본다. 둘 다 안 되는 경우(대회 일반 팀원이 시작 뒤 진입)는 `error` 로 끝난다.
 */
export function useGameRosterSide(teamId: string, gameId: string): GameRosterSideResolution {
  const upcoming = useV1TeamUpcomingGames(teamId);
  const item = upcoming.data?.items.find((game) => game.gameId === gameId) ?? null;
  const needsGame = upcoming.isError || (upcoming.isSuccess && (item === null || item.sideId === null));
  const game = useV1Game(gameId, { enabled: needsGame && (item === null || item.competitionKind !== 'FRIENDLY') });

  if (item !== null && item.competitionKind === 'FRIENDLY') {
    return { status: 'friendly', teamMatchId: item.teamMatchId };
  }
  if (item !== null && item.sideId !== null) {
    return { status: 'resolved', sideId: item.sideId, opponentName: item.opponentName, title: item.title };
  }
  if (!needsGame || game.isLoading || game.isPending) return { status: 'loading' };
  if (game.isError) return { status: 'error', error: game.error };

  const sides = game.data?.sides ?? [];
  const own = sides.find((side) => side.teamId === teamId);
  if (own === undefined) return { status: 'not-found' };
  const opponent = sides.find((side) => side.id !== own.id);
  return { status: 'resolved', sideId: own.id, opponentName: opponent?.displayNameSnapshot ?? null, title: null };
}
