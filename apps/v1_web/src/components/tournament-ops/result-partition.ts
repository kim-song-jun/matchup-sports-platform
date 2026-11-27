import { useMemo } from 'react';
import { useTournamentEndedFixtures } from '@/hooks/use-tournament-result-review';

type ResultRow = { fixtureId: string; gameId: string | null; revisionId: string | null };

/**
 * 끝난 경기를 결과 화면의 두 묶음으로 나눈다. 확정 결과가 없거나 검토 기한을 넘긴 경기는 확정 대기,
 * 나머지(확정 결과 있음)는 확정됨. 경기(`gameId`)가 없는 행은 어느 쪽에도 넣지 않는다.
 */
export function partitionResultFixtures<T extends ResultRow>(
  items: readonly T[],
  overdueFixtureIds: ReadonlySet<string>,
): { pending: (T & { gameId: string })[]; confirmed: (T & { gameId: string })[] } {
  const pending: (T & { gameId: string })[] = [];
  const confirmed: (T & { gameId: string })[] = [];
  for (const item of items) {
    if (item.gameId === null) continue;
    const row = item as T & { gameId: string };
    if (item.revisionId === null || overdueFixtureIds.has(item.fixtureId)) pending.push(row);
    else confirmed.push(row);
  }
  return { pending, confirmed };
}

/** 검토 기한 초과는 시계 의존이라 안정 스냅샷이 아니라 `liveWarnings` 로 온다. */
export function overdueFixtureIdsOf(liveWarnings: ReadonlyArray<{ fixtureId: string; warnings: readonly string[] }> | undefined): Set<string> {
  const ids = new Set<string>();
  for (const live of liveWarnings ?? []) {
    if (live.warnings.includes('RESULT_REVIEW_OVERDUE')) ids.add(live.fixtureId);
  }
  return ids;
}

/** 운영 셸 「결과」 메뉴의 숫자. 읽지 않는 역할에서는 `enabled` 를 끄고 0 을 쓴다. */
export function usePendingResultCount(tournamentId: string, enabled: boolean): number {
  const ended = useTournamentEndedFixtures(tournamentId, { enabled });
  return useMemo(() => {
    if (!enabled || !ended.data) return 0;
    return partitionResultFixtures(ended.data.items, overdueFixtureIdsOf(ended.data.liveWarnings)).pending.length;
  }, [enabled, ended.data]);
}
