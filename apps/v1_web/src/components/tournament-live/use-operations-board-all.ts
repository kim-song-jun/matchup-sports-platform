import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { mergeByFixtureId } from '@/lib/merge-board-pages';
import { v1Keys } from '@/lib/query-keys';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import type { v1Get } from '@/lib/api-client';
import type {
  V1TournamentOperationsBoardItem,
  V1TournamentOperationsBoardPage,
  V1TournamentOperationsLiveWarning,
} from '@/types/api';

export interface OperationsBoardAll {
  items: V1TournamentOperationsBoardItem[];
  liveWarnings: V1TournamentOperationsLiveWarning[];
}

const PAGE_LIMIT = 100;
/** 한 번에 읽는 서버 페이지 상한(2,000경기). 서버가 커서를 잘못 주어도 요청이 끝없이 이어지지 않게 한다. */
const MAX_PAGES = 20;

/**
 * 보드 서버 페이지를 다음 커서가 없을 때까지 읽는다. 한 페이지라도 실패하면 전체가 실패한다.
 * 커서가 없거나, 이미 쓴 커서가 다시 오거나, 빈 페이지가 오면 거기서 멈춘다.
 */
export async function fetchOperationsBoardAll(get: typeof v1Get, tournamentId: string): Promise<OperationsBoardAll> {
  const path = `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations`;
  const items: V1TournamentOperationsBoardItem[] = [];
  const liveWarnings: V1TournamentOperationsLiveWarning[] = [];
  const usedCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageCount = 0; pageCount < MAX_PAGES; pageCount += 1) {
    const page: V1TournamentOperationsBoardPage = await get<V1TournamentOperationsBoardPage>(path, {
      limit: PAGE_LIMIT,
      ...(cursor === null ? {} : { cursor }),
    });
    items.push(...page.items);
    liveWarnings.push(...page.liveWarnings);
    const next = page.nextCursor;
    if (!next || page.items.length === 0 || usedCursors.has(next)) break;
    usedCursors.add(next);
    cursor = next;
  }
  return { items: mergeByFixtureId(items), liveWarnings: mergeByFixtureId(liveWarnings) };
}

/** 키가 `tournamentOperationsBoardAll` 아래에 있어 구장 배정 등 기존 무효화가 그대로 닿는다. */
export function useOperationsBoardAll(tournamentId: string, options?: { enabled?: boolean }) {
  const { v1Get } = useV1DataSource();
  return useQuery({
    queryKey: [...v1Keys.tournamentOperationsBoardAll(tournamentId), 'all'] as const,
    queryFn: () => fetchOperationsBoardAll(v1Get, tournamentId),
    enabled: Boolean(tournamentId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS,
  });
}
