'use client';

import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useV1AuthMe, useV1MyTeams } from '@/hooks/use-v1-api';
import type { V1TeamGameRosterView } from '@/hooks/use-v1-game-roster';
import { V1ApiError, v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { hasStoredV1Session } from '@/lib/session-storage';
import type { V1MyTeam } from '@/types/api';

export type MyMatchRosterTeam =
  /** 비로그인이거나, 두 팀 어디에도 활성 멤버가 아니거나, 경기(게임)가 아직 없다 — 우리 팀 카드가 없다. */
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'resolved'; teamId: string; gameId: string }
  | { status: 'error'; error: unknown };

/**
 * 경기 상세(공개 화면)에서 "우리 팀"을 고른다 — 대회·리그 공용. 후보는 두 팀 중 내가 활성 멤버인 팀(역할 무관)이고,
 * 공개 응답이 참가팀을 가리면(접수 중 대회) 내 팀 전부다. 후보가 하나로 정해지지 않을 때만 후보마다 팀 명단을 불러(404 =
 * 이 경기 팀 아님) 기준 명단에 내가 있는 팀 → 내가 관리하는 팀 → 첫 팀 순으로 고른다 — 두 팀에 다 속한 선수도 자기 팀을
 * 본다. 정해지면 조회하지 않는다(카드가 한 번 부른다). 쓰기 권한은 명단 응답의 `editable`(서버 판정)이 정한다.
 */
export function useMyMatchRosterTeam({
  teamIds,
  gameId,
}: {
  teamIds: readonly (string | null)[];
  gameId: string | null;
}): MyMatchRosterTeam {
  // 비로그인 관전자에게 401 을 만들지 않는다 — 세션 힌트가 있을 때만 확인한다(SSR 불일치를 피해 effect 에서 읽는다).
  const [hasSessionHint, setHasSessionHint] = useState(false);
  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);
  const me = useV1AuthMe({ enabled: hasSessionHint, retry: false });
  const myTeams = useV1MyTeams(undefined, { enabled: me.data !== undefined });

  const knownTeamIds = teamIds.filter((teamId): teamId is string => teamId !== null);
  const candidates = (myTeams.data?.items ?? []).filter(
    (team) => knownTeamIds.length === 0 || knownTeamIds.includes(team.teamId),
  );
  const probe = knownTeamIds.length === 0 || candidates.length > 1;
  const rosters = useQueries({
    queries: (probe ? candidates : []).map((team) => ({
      queryKey: v1Keys.teamGameRoster(team.teamId, gameId ?? ''),
      queryFn: () => v1Get<V1TeamGameRosterView>(`/teams/${team.teamId}/games/${gameId}/roster`),
      enabled: gameId !== null,
      retry: false,
    })),
  });

  if (!hasSessionHint || me.isError) return { status: 'none' };
  if (me.data === undefined || myTeams.isPending) return { status: 'loading' };
  if (myTeams.isError) return { status: 'error', error: myTeams.error };
  if (candidates.length === 0 || gameId === null) return { status: 'none' };
  if (!probe) return { status: 'resolved', teamId: candidates[0].teamId, gameId };
  if (rosters.some((roster) => roster.isPending)) return { status: 'loading' };

  const myUserId = me.data.user.id;
  const loaded = candidates.flatMap((team, index) => {
    const data = rosters[index]?.data;
    return data === undefined ? [] : [{ team, data }];
  });
  const picked = pickMyTeam(loaded, myUserId);
  const failure = rosters.find(
    (roster) => roster.isError && !(roster.error instanceof V1ApiError && roster.error.statusCode === 404),
  );
  // 다른 후보가 실패했으면 그 팀이 내 팀이었을 수 있다 — 명단에 내가 있는 팀을 찾았을 때만 실패를 무시한다.
  if (picked !== null && (failure === undefined || picked.data.base.some((row) => row.userId === myUserId))) {
    return { status: 'resolved', teamId: picked.team.teamId, gameId };
  }
  if (failure !== undefined) return { status: 'error', error: failure.error };
  return { status: 'none' };
}

function pickMyTeam(
  loaded: ReadonlyArray<{ team: V1MyTeam; data: V1TeamGameRosterView }>,
  myUserId: string,
): { team: V1MyTeam; data: V1TeamGameRosterView } | null {
  const managed = (row: { team: V1MyTeam }) => row.team.role === 'owner' || row.team.role === 'manager';
  const listed = loaded.filter((row) => row.data.base.some((entry) => entry.userId === myUserId));
  return listed.find(managed) ?? listed[0] ?? loaded.find(managed) ?? loaded[0] ?? null;
}
