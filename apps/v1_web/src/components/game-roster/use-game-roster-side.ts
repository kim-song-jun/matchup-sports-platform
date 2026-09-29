'use client';

import { useV1Game, useV1TeamUpcomingGames } from '@/hooks/use-v1-api';

export type GameRosterSideResolution =
  | { status: 'loading' }
  | { status: 'resolved'; gameId: string; sideId: string; opponentName: string | null; title: string | null }
  /** 친선 경기 — 명단 조정 대상이 아니라 참석명단 화면으로 보낸다. */
  | { status: 'friendly'; teamMatchId: string | null }
  | { status: 'not-found' }
  | { status: 'error'; error: unknown };

/**
 * 경기를 가리키는 값. 경기 상세는 게임이 비공개면 `gameId` 없이 대진(팀매치) id 만 안다.
 * `kickoffAt` 을 알면(null = 시각 미정) 다가오는 경기에 들 수 없는 경기(시각이 지났거나 미정)는 그 목록을
 * 부르지 않는다 — 서버가 경기마다 명단 요약을 계산하는 무거운 조회다. 모르면(undefined) 부른다.
 */
export type GameRosterSideTarget = { gameId: string | null; teamMatchId?: string | null; kickoffAt?: string | null };

/**
 * 경로(`/teams/:teamId/games/:gameId/roster`)·경기 상세에는 사이드가 없어 여기서 찾는다.
 *
 * 두 출처가 서로 다른 사람을 덮는다.
 * - 팀 다가오는 경기: 그 팀 활성 멤버 누구나 받지만 **시작 전 경기만** 온다.
 * - 경기 조회(`GET /games/:id`): 시작 뒤에도 오지만 대회 경기는 팀 owner·manager·운영자만 읽는다.
 * 앞에서 못 찾으면 뒤를 본다. 둘 다 안 되는 경우(대회 일반 팀원이 시작 뒤 진입)는 `error` 로 끝난다.
 * `teamId` 가 null 이면 아무것도 조회하지 않고 `loading` 에 머문다 — 호출부가 팀을 정한 뒤에 쓴다.
 */
export function useGameRosterSide(teamId: string | null, target: GameRosterSideTarget): GameRosterSideResolution {
  const { gameId, teamMatchId = null, kickoffAt } = target;
  const maybeUpcoming = kickoffAt === undefined || (kickoffAt !== null && Date.parse(kickoffAt) >= Date.now());
  const upcoming = useV1TeamUpcomingGames(teamId, { enabled: maybeUpcoming });
  const item =
    upcoming.data?.items.find(
      (game) => (gameId !== null && game.gameId === gameId) || (teamMatchId !== null && game.teamMatchId === teamMatchId),
    ) ?? null;
  const needsGame =
    (!maybeUpcoming && item === null) || upcoming.isError || (upcoming.isSuccess && (item === null || item.sideId === null));
  const game = useV1Game(gameId, {
    enabled: teamId !== null && needsGame && (item === null || item.competitionKind !== 'FRIENDLY'),
  });

  if (item !== null && item.competitionKind === 'FRIENDLY') {
    return { status: 'friendly', teamMatchId: item.teamMatchId };
  }
  if (item !== null && item.sideId !== null) {
    return { status: 'resolved', gameId: item.gameId, sideId: item.sideId, opponentName: item.opponentName, title: item.title };
  }
  if (!needsGame || teamId === null) return { status: 'loading' };
  if (gameId === null) return upcoming.isError ? { status: 'error', error: upcoming.error } : { status: 'not-found' };
  if (game.isLoading || game.isPending) return { status: 'loading' };
  if (game.isError) return { status: 'error', error: game.error };

  const sides = game.data?.sides ?? [];
  const own = sides.find((side) => side.teamId === teamId);
  if (own === undefined) return { status: 'not-found' };
  const opponent = sides.find((side) => side.id !== own.id);
  return { status: 'resolved', gameId, sideId: own.id, opponentName: opponent?.displayNameSnapshot ?? null, title: null };
}
