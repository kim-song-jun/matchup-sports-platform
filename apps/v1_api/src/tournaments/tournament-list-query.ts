import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TournamentListQueryDto } from './dto/tournament-read.dto';
import { COMPETITION_LIST_SURFACE } from './tournament-surface';
import { PUBLIC_TOURNAMENT_STATUSES } from './tournaments-read.query';
import { CAPACITY_HOLD_STATUSES } from './registration-capacity';

/**
 * Default public list order, evaluated by the database:
 * in progress -> recruiting (eligible open or regular-league draft) -> recruitment closed -> finished.
 * "Recruitment closed" is the status the card shows: a stored `closed`, or a recruiting row
 * whose deadline has passed or whose capacity is full (the web's
 * `resolveTournamentRegistrationBlock`; leagues use optional maxTeams independently of roster size).
 * Within the first three groups the earliest start comes first; the finished group is most recently
 * ended first (falling back to the start date). Rows without a date sort last in their group, and
 * `id` (byte order) breaks ties. This file is the single source of that order.
 */
/**
 * A recruiting row the card renders as "모집 마감". `registration_deadline_at` is UTC, so compare in UTC.
 * Only an open row is closed by its deadline (`registration-window.ts`); a league draft is not recruiting yet.
 */
const RECRUITMENT_BLOCKED_SQL = Prisma.sql`(
  (t.status::text = 'open' AND t.registration_deadline_at < (now() AT TIME ZONE 'UTC'))
  OR (SELECT COUNT(*) FROM v1_tournament_registrations r
        WHERE r.tournament_id = t.id AND r.status::text IN (${Prisma.join([...CAPACITY_HOLD_STATUSES])}))
      >= CASE WHEN t.kind::text = 'regular_league' THEN t.max_teams ELSE t.team_count END
)`;

// Group rank: 0 in progress, 1 recruiting, 2 recruitment closed, 3 finished (FINISHED_RANK), 4 anything else.
const GROUP_RANK_SQL = Prisma.sql`CASE t.status::text
  WHEN 'in_progress' THEN 0
  WHEN 'draft' THEN (CASE WHEN ${RECRUITMENT_BLOCKED_SQL} THEN 2 ELSE 1 END)
  WHEN 'open' THEN (CASE WHEN ${RECRUITMENT_BLOCKED_SQL} THEN 2 ELSE 1 END)
  WHEN 'closed' THEN 2 WHEN 'completed' THEN 3
  ELSE 4 END`;

const FINISHED_RANK = Prisma.raw('3');

/**
 * Must stay equivalent to the Prisma `where` the public surface constants express
 * (TOURNAMENT_SURFACE_KIND, PUBLIC_COMPETITION_STATUS_WHERE, PUBLIC_TOURNAMENT_VISIBILITY_WHERE);
 * the integration spec pins the two against each other.
 */
function buildFilterSql(query: TournamentListQueryDto): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    COMPETITION_LIST_SURFACE[query.kind ?? 'tournament'],
    Prisma.sql`t.deleted_at IS NULL`,
    Prisma.sql`t.is_public = true`,
  ];

  if (!query.status) {
    conditions.push(
      Prisma.sql`(t.status::text IN (${Prisma.join([...PUBLIC_TOURNAMENT_STATUSES])}) OR (t.kind::text = 'regular_league' AND t.status::text = 'draft'))`,
    );
  } else if (query.status === 'draft') {
    // A tournament's own draft is operator preparation and stays hidden; only leagues expose it.
    conditions.push(Prisma.sql`t.kind::text = 'regular_league' AND t.status::text IN ('draft', 'open', 'closed')`);
  } else {
    conditions.push(Prisma.sql`t.status::text = ${query.status}`);
  }
  if (query.sportId) conditions.push(Prisma.sql`t.sport_id = ${query.sportId}`);
  if (query.phase) {
    conditions.push(query.phase === 'upcoming' ? Prisma.sql`t.status::text IN ('draft', 'open', 'closed')`
      : Prisma.sql`t.status::text = ${query.phase === 'ongoing' ? 'in_progress' : 'completed'}`);
  }
  const registration = query.sort === 'deadline' ? 'open' : query.registration;
  if (registration) {
    // Same rule as `registration-window.ts` for both kinds: operator opened (`open`) and not past the deadline.
    const accepting = Prisma.sql`(
      t.status::text = 'open'
        AND (t.registration_deadline_at IS NULL OR t.registration_deadline_at >= (now() AT TIME ZONE 'UTC'))
    ) AND (
      (t.kind::text = 'regular_league' AND t.max_teams IS NULL)
      OR (SELECT COUNT(*) FROM v1_tournament_registrations r WHERE r.tournament_id = t.id
          AND r.status::text IN (${Prisma.join([...CAPACITY_HOLD_STATUSES])}))
        < CASE WHEN t.kind::text = 'regular_league' THEN t.max_teams ELSE t.team_count END
    )`;
    conditions.push(registration === 'open' ? Prisma.sql`COALESCE((${accepting}), FALSE)` : Prisma.sql`NOT COALESCE((${accepting}), FALSE)`);
  }
  if (query.genderCategory) conditions.push(query.genderCategory === 'unspecified'
    ? Prisma.sql`t.gender_category IS NULL` : Prisma.sql`t.gender_category::text = ${query.genderCategory}`);
  if (query.format) conditions.push(Prisma.sql`t.format::text = ${query.format}`);
  if (query.feeMin !== undefined) conditions.push(Prisma.sql`t.entry_fee >= ${query.feeMin}`);
  if (query.feeMax !== undefined) conditions.push(Prisma.sql`t.entry_fee <= ${query.feeMax}`);
  if (query.genderCategory || query.format || query.feeMin !== undefined || query.feeMax !== undefined) {
    conditions.push(Prisma.sql`(t.kind::text = 'regular_tournament' OR t.kind IS NULL)`);
  }
  if (query.dateFrom || query.dateTo) conditions.push(Prisma.sql`t.scheduled_at IS NOT NULL`);
  if (query.dateFrom) conditions.push(Prisma.sql`COALESCE(t.scheduled_end_at, t.scheduled_at) >= ${new Date(`${query.dateFrom}T00:00:00+09:00`)}`);
  if (query.dateTo) conditions.push(Prisma.sql`t.scheduled_at <= ${new Date(`${query.dateTo}T23:59:59.999+09:00`)}`);
  return Prisma.join(conditions, ' AND ');
}

// 명시적 정렬은 한 그룹에서 동작한다. 기존 keyset의 3그룹은 내림차순,
// 0그룹은 오름차순이라 같은 microsecond 보존 cursor 비교를 재사용할 수 있다.
const FILTERED_SQL = (query: TournamentListQueryDto) => Prisma.sql`filtered AS (
  SELECT t.id,
    ${query.sort === 'latest' ? Prisma.sql`3` : query.sort ? Prisma.sql`0` : GROUP_RANK_SQL} AS grp,
    ${query.sort === 'latest' ? Prisma.sql`t.created_at`
      : query.sort === 'deadline' ? Prisma.sql`t.registration_deadline_at`
      : query.sort === 'scheduled' ? Prisma.sql`t.scheduled_at`
      : Prisma.sql`CASE WHEN t.status::text = 'completed' THEN COALESCE(t.scheduled_end_at, t.scheduled_at) ELSE t.scheduled_at END`} AS sort_at
  FROM v1_tournaments t
  WHERE ${buildFilterSql(query)}
)`;

const ORDER_SQL = Prisma.sql`f.grp ASC, (f.sort_at IS NULL) ASC,
  CASE WHEN f.grp < ${FINISHED_RANK} THEN f.sort_at END ASC,
  CASE WHEN f.grp = ${FINISHED_RANK} THEN f.sort_at END DESC,
  f.id COLLATE "C" ASC`;

/** Rows strictly after the cursor row `c` in `ORDER_SQL` order (keyset comparison). */
const AFTER_CURSOR_SQL = Prisma.sql`(
  f.grp > c.grp OR (f.grp = c.grp AND (
    (c.sort_at IS NULL AND f.sort_at IS NULL AND f.id COLLATE "C" > c.id COLLATE "C")
    OR (c.sort_at IS NOT NULL AND (
      f.sort_at IS NULL
      OR (f.sort_at = c.sort_at AND f.id COLLATE "C" > c.id COLLATE "C")
      OR (c.grp < ${FINISHED_RANK} AND f.sort_at > c.sort_at)
      OR (c.grp = ${FINISHED_RANK} AND f.sort_at < c.sort_at)
    ))
  ))
)`;

export interface TournamentListWindow {
  limit: number;
  /** Rows to skip (page mode). */
  offset?: number;
  /** Cursor token from a previous page's last row (see `encodeCursor`); anything else yields an empty window. */
  cursor?: string;
}

export interface TournamentListRow {
  id: string;
  /** Resumes the list right after this row. */
  cursor: string;
}

interface CursorKey {
  grp: number;
  /** `timestamp` rendered as text, so microseconds survive the round trip. */
  sortAt: string | null;
  id: string;
  sort?: 'latest' | 'deadline' | 'scheduled';
}

const SORT_AT_TEXT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?$/;

/** The shape alone admits `9999-99-99 99:99:99`, which Postgres rejects with a 500 at the `::timestamp` cast. */
function isRealTimestampText(text: string): boolean {
  const match = SORT_AT_TEXT.exec(text);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

/**
 * The cursor carries the sort key the row had when its page was served. Recomputing it from the row
 * would move a cursor row between groups when its deadline passes or its capacity fills mid-scroll,
 * and the next page would skip or repeat rows.
 */
function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key.sort ? [key.grp, key.sortAt, key.id, key.sort] : [key.grp, key.sortAt, key.id])).toString('base64url');
}

function decodeCursor(token: string): CursorKey | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || (parsed.length !== 3 && parsed.length !== 4)) return null;
  const [grp, sortAt, id, sort] = parsed;
  if (!Number.isInteger(grp) || grp < 0 || grp > 4) return null;
  if (sortAt !== null && !(typeof sortAt === 'string' && isRealTimestampText(sortAt))) return null;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (sort !== undefined && !['latest', 'deadline', 'scheduled'].includes(sort)) return null;
  return { grp, sortAt, id, sort };
}

/** One page window plus one lookahead row, in default list order. */
export async function listTournamentIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  query: TournamentListQueryDto,
  window: TournamentListWindow,
): Promise<TournamentListRow[]> {
  const take = window.limit + 1;
  type Row = { id: string; grp: number; sort_at: string | null };
  let rows: Row[];
  if (window.cursor !== undefined && window.cursor !== '') {
    const key = decodeCursor(window.cursor);
    if (!key || key.sort !== query.sort) return [];
    rows = await prisma.$queryRaw<Row[]>`
        WITH ${FILTERED_SQL(query)},
          c AS (SELECT ${key.grp}::int AS grp, ${key.sortAt}::timestamp AS sort_at, ${key.id}::text AS id)
        SELECT f.id, f.grp, f.sort_at::text AS sort_at FROM filtered f, c WHERE ${AFTER_CURSOR_SQL}
        ORDER BY ${ORDER_SQL} LIMIT ${take}`;
  } else {
    rows = await prisma.$queryRaw<Row[]>`
        WITH ${FILTERED_SQL(query)}
        SELECT f.id, f.grp, f.sort_at::text AS sort_at FROM filtered f
        ORDER BY ${ORDER_SQL} LIMIT ${take} OFFSET ${window.offset ?? 0}`;
  }
  return rows.map((row) => ({
    id: row.id,
    cursor: encodeCursor({ grp: row.grp, sortAt: row.sort_at, id: row.id, sort: query.sort }),
  }));
}

export async function countTournamentList(
  prisma: Pick<PrismaService, '$queryRaw'>,
  query: TournamentListQueryDto,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    WITH ${FILTERED_SQL(query)} SELECT COUNT(*) AS total FROM filtered`;
  return Number(rows[0]?.total ?? 0);
}
