'use client';

import { useEffect, useState } from 'react';
import { useV1AuthMe, useV1MyTeams } from '@/hooks/use-v1-api';
import { hasStoredV1Session } from '@/lib/session-storage';

export type MyMatchRosterTeam =
  /** 비로그인이거나, 두 팀 어디에도 활성 멤버가 아니거나, 경기(게임)가 아직 없다 — 우리 팀 카드가 없다. */
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'resolved'; teamId: string; gameId: string }
  | { status: 'error'; error: unknown };

/**
 * 경기 상세(공개 화면)에서 "우리 팀"을 고른다 — 대회·리그 공용. 두 팀 중 내가 활성 멤버인 팀(`/me/teams`,
 * 역할 무관 — 팀원은 요약을 본다)이다. 사이드·명단은 `useV1TeamGameRoster(teamId, gameId)` 가 한 번에 푼다.
 * 쓰기 권한은 여기서 판정하지 않는다 — 명단 응답의 `editable` 이 서버 판정이다.
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
  const myTeamId = myTeams.data?.items.find((team) => teamIds.includes(team.teamId))?.teamId ?? null;

  if (!hasSessionHint || me.isError) return { status: 'none' };
  if (me.data === undefined || myTeams.isPending) return { status: 'loading' };
  if (myTeams.isError) return { status: 'error', error: myTeams.error };
  if (myTeamId === null || gameId === null) return { status: 'none' };
  return { status: 'resolved', teamId: myTeamId, gameId };
}
