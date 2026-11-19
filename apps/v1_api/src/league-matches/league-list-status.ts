import type { V1TournamentStatus } from '@prisma/client';

/**
 * 어드민 리그 목록의 상태 칩 키. 표의 상태 알약(`leagueLifecycleLabel`)과 같은 단위다.
 * 리그에는 '취소'가 없어(보류로 대신한다) 남아 있는 `cancelled` 행은 알약처럼 `completed`(종료)로 묶는다.
 */
export const LEAGUE_LIST_STATUS_FILTERS = ['draft', 'open', 'closed', 'in_progress', 'completed', 'on_hold'] as const;
export type LeagueListStatusFilter = (typeof LEAGUE_LIST_STATUS_FILTERS)[number];

export function leagueListStatusKey(status: V1TournamentStatus): LeagueListStatusFilter {
  return status === 'cancelled' ? 'completed' : status;
}
