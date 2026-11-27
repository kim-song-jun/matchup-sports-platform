import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
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

/** 보드 서버 페이지를 다음 커서가 없을 때까지 읽는다. 한 페이지라도 실패하면 전체가 실패한다. */
export async function fetchOperationsBoardAll(get: typeof v1Get, tournamentId: string): Promise<OperationsBoardAll> {
  const path = `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations`;
  const items: V1TournamentOperationsBoardItem[] = [];
  const liveWarnings: V1TournamentOperationsLiveWarning[] = [];
  let cursor: string | null = null;
  do {
    const page: V1TournamentOperationsBoardPage = await get<V1TournamentOperationsBoardPage>(path, {
      limit: PAGE_LIMIT,
      ...(cursor === null ? {} : { cursor }),
    });
    items.push(...page.items);
    liveWarnings.push(...page.liveWarnings);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return { items, liveWarnings };
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
