import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TournamentListQueryDto } from './dto/tournament-read.dto';
import { COMPETITION_LIST_SURFACE } from './tournament-surface';
import { PUBLIC_TOURNAMENT_STATUSES } from './tournaments-read.query';
import { CAPACITY_HOLD_STATUSES } from './registration-capacity';

/**
 * The only public list order, evaluated by the database. A row's group is the state its card shows:
 * in progress -> recruiting -> preparing (regular-league draft) -> recruitment closed -> finished.
 * "Recruitment closed" is a stored `closed`, or an `open` row whose deadline has passed or whose capacity
 * is full (the web's `resolveTournamentRegistrationBlock`; leagues use optional maxTeams independently of
 * roster size). Inside a group the most recently registered row comes first; the finished group is most
 * recently ended first (falling back to the start date). Rows without a date sort last in their group, and
 * `id` (byte order) breaks ties. This file is the single source of that order, and `stage` filters on the
 * same group so the badge, the filter and the order never disagree.
 */
/**
 * An `open` row the card renders as "접수 마감". `registration_deadline_at` is UTC, so compare in UTC.
 * Only an open row is closed by its deadline (`registration-window.ts`).
 */
const RECRUITMENT_BLOCKED_SQL = Prisma.sql`(
  (t.status::text = 'open' AND t.registration_deadline_at < (now() AT TIME ZONE 'UTC'))
  OR (SELECT COUNT(*) FROM v1_tournament_registrations r
        WHERE r.tournament_id = t.id AND r.status::text IN (${Prisma.join([...CAPACITY_HOLD_STATUSES])}))
      >= CASE WHEN t.kind::text = 'regular_league' THEN t.max_teams ELSE t.team_count END
)`;

// Group rank: 0 in progress, 1 recruiting, 2 preparing (draft), 3 recruitment closed, 4 finished, 5 anything else.
const GROUP_RANK_SQL = Prisma.sql`CASE t.status::text
  WHEN 'in_progress' THEN 0
  WHEN 'open' THEN (CASE WHEN ${RECRUITMENT_BLOCKED_SQL} THEN 3 ELSE 1 END)
  WHEN 'draft' THEN 2
  WHEN 'closed' THEN 3
  WHEN 'completed' THEN 4
  ELSE 5 END`;

const STAGE_RANK: Record<NonNullable<TournamentListQueryDto['stage']>, number> = {
  ongoing: 0,
  recruiting: 1,
  preparing: 2,
  recruit_closed: 3,
  completed: 4,
};

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
  // The card's single state badge is the list's group, so the filter selects exactly the rows showing that badge.
  if (query.stage) conditions.push(Prisma.sql`(${GROUP_RANK_SQL}) = ${STAGE_RANK[query.stage]}`);
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

// sort_at: registration time (newest first), except a finished row, which sorts by when it ended.
const FILTERED_SQL = (query: TournamentListQueryDto) => Prisma.sql`filtered AS (
  SELECT t.id,
    ${GROUP_RANK_SQL} AS grp,
    CASE WHEN t.status::text = 'completed' THEN COALESCE(t.scheduled_end_at, t.scheduled_at) ELSE t.created_at END AS sort_at
  FROM v1_tournaments t
  WHERE ${buildFilterSql(query)}
)`;

const ORDER_SQL = Prisma.sql`f.grp ASC, (f.sort_at IS NULL) ASC, f.sort_at DESC, f.id COLLATE "C" ASC`;

/** Rows strictly after the cursor row `c` in `ORDER_SQL` order (keyset comparison). */
const AFTER_CURSOR_SQL = Prisma.sql`(
  f.grp > c.grp OR (f.grp = c.grp AND (
    (c.sort_at IS NULL AND f.sort_at IS NULL AND f.id COLLATE "C" > c.id COLLATE "C")
    OR (c.sort_at IS NOT NULL AND (
      f.sort_at IS NULL
      OR (f.sort_at = c.sort_at AND f.id COLLATE "C" > c.id COLLATE "C")
      OR f.sort_at < c.sort_at
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
 *
 * The first element is a version tag. The group numbers and the sort key changed meaning on 2026-11-03
 * (old 2 = closed, 3 = finished; new 2 = preparing, 3 = closed, 4 = finished; start ascending -> registration
 * descending), and a cursor from before that has the same three-part shape. A page that is still open across
 * the deploy would skip or repeat rows, so the old shapes are refused instead of reinterpreted. Bump the tag
 * whenever the meaning of `grp` or `sortAt` changes again.
 */
const CURSOR_VERSION = 'v2';

function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify([CURSOR_VERSION, key.grp, key.sortAt, key.id])).toString('base64url');
}

function decodeCursor(token: string): CursorKey | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== CURSOR_VERSION) return null;
  const [, grp, sortAt, id] = parsed;
  if (!Number.isInteger(grp) || grp < 0 || grp > 5) return null;
  if (sortAt !== null && !(typeof sortAt === 'string' && isRealTimestampText(sortAt))) return null;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  return { grp, sortAt, id };
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
    if (!key) return [];
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
    cursor: encodeCursor({ grp: row.grp, sortAt: row.sort_at, id: row.id }),
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
