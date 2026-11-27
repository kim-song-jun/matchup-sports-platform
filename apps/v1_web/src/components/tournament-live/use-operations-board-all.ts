import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { v1Keys } from '@/lib/query-keys';
import { OPERATIONS_BOARD_PAGE_LIMIT, readOperationsBoardPages } from '@/lib/operations-board-pages';
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

/** 보드 서버 페이지를 끝까지 읽어 한 목록으로 합친다(커서 방어·페이지 상한은 `readOperationsBoardPages`). */
export async function fetchOperationsBoardAll(get: typeof v1Get, tournamentId: string): Promise<OperationsBoardAll> {
  const path = `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations`;
  const pages = await readOperationsBoardPages((cursor) =>
    get<V1TournamentOperationsBoardPage>(path, {
      limit: OPERATIONS_BOARD_PAGE_LIMIT,
      ...(cursor === null ? {} : { cursor }),
    }),
  );
  return {
    items: pages.flatMap((page) => page.items),
    liveWarnings: pages.flatMap((page) => page.liveWarnings),
  };
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
