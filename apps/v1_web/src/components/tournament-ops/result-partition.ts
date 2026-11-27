import { useMemo } from 'react';
import { useTournamentEndedFixtures } from '@/hooks/use-tournament-result-review';
import { classifyEndedResult } from './result-kind';

type ResultRow = { fixtureId: string; gameId: string | null; revisionId: string | null; currentRevisionState?: string | null };

/**
 * 끝난 경기를 결과 화면의 세 묶음으로 나눈다 — 확정 대기·확정됨·결과 무효. 운영 보드 카드와 같은 분류
 * (`classifyEndedResult`)를 쓴다. 경기(`gameId`)가 없는 행은 어느 쪽에도 넣지 않는다.
 */
export function partitionResultFixtures<T extends ResultRow>(
  items: readonly T[],
  overdueFixtureIds: ReadonlySet<string>,
): { pending: (T & { gameId: string })[]; confirmed: (T & { gameId: string })[]; voided: (T & { gameId: string })[] } {
  const pending: (T & { gameId: string })[] = [];
  const confirmed: (T & { gameId: string })[] = [];
  const voided: (T & { gameId: string })[] = [];
  for (const item of items) {
    if (item.gameId === null) continue;
    const row = item as T & { gameId: string };
    const kind = classifyEndedResult(item, overdueFixtureIds.has(item.fixtureId));
    (kind === 'pending' ? pending : kind === 'void' ? voided : confirmed).push(row);
  }
  return { pending, confirmed, voided };
}

/** 검토 기한 초과는 시계 의존이라 안정 스냅샷이 아니라 `liveWarnings` 로 온다. */
export function overdueFixtureIdsOf(liveWarnings: ReadonlyArray<{ fixtureId: string; warnings: readonly string[] }> | undefined): Set<string> {
  const ids = new Set<string>();
  for (const live of liveWarnings ?? []) {
    if (live.warnings.includes('RESULT_REVIEW_OVERDUE')) ids.add(live.fixtureId);
  }
  return ids;
}

/** 운영 셸 「결과」 메뉴의 숫자. 읽지 않는 상황에서는 `enabled` 를 끄고 0 을 쓴다. */
export function usePendingResultCount(tournamentId: string, enabled: boolean): number {
  const ended = useTournamentEndedFixtures(tournamentId, { enabled });
  return useMemo(() => {
    if (!enabled || !ended.data) return 0;
    return partitionResultFixtures(ended.data.items, overdueFixtureIdsOf(ended.data.liveWarnings)).pending.length;
  }, [enabled, ended.data]);
}
