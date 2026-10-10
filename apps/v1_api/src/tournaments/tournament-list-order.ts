import { V1CompetitionKind } from '@prisma/client';

export interface TournamentListSortRow {
  id: string;
  status: string;
  kind: V1CompetitionKind | null;
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
}

/**
 * Default public list order: recruiting -> recruitment closed -> in progress -> finished.
 * A regular league's `draft` ("upcoming") sits with recruiting; only leagues can be public in `draft`.
 */
const STATUS_GROUP_RANK: Record<string, number> = {
  draft: 0,
  open: 0,
  closed: 1,
  in_progress: 2,
  completed: 3,
};

const UNRANKED = Number.MAX_SAFE_INTEGER;

function time(date: Date | null | undefined): number | null {
  return date ? date.getTime() : null;
}

/** Compares nullable timestamps; rows without a date always sort last. */
function compareNullableLast(a: number | null, b: number | null, direction: 'asc' | 'desc'): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

export function compareTournamentListRows(a: TournamentListSortRow, b: TournamentListSortRow): number {
  const rankA = STATUS_GROUP_RANK[a.status] ?? UNRANKED;
  const rankB = STATUS_GROUP_RANK[b.status] ?? UNRANKED;
  if (rankA !== rankB) return rankA - rankB;

  if (a.status === 'completed') {
    // Most recently finished first; fall back to the start date when no end date was recorded.
    const byEnd = compareNullableLast(
      time(a.scheduledEndAt) ?? time(a.scheduledAt),
      time(b.scheduledEndAt) ?? time(b.scheduledAt),
      'desc',
    );
    if (byEnd !== 0) return byEnd;
  } else {
    const byStart = compareNullableLast(time(a.scheduledAt), time(b.scheduledAt), 'asc');
    if (byStart !== 0) return byStart;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortTournamentListRows<T extends TournamentListSortRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareTournamentListRows);
}
