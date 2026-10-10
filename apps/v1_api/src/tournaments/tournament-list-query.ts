import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TournamentListQueryDto } from './dto/tournament-read.dto';
import { COMPETITION_LIST_SURFACE } from './tournament-surface';
import { PUBLIC_TOURNAMENT_STATUSES } from './tournaments-read.query';

/**
 * Default public list order, evaluated by the database:
 * recruiting (open, plus a regular league's draft) -> recruitment closed -> in progress -> finished.
 * "Recruitment closed" is the status the card shows: a stored `closed`, or a tournament still stored
 * as `open` whose deadline has passed or whose capacity is full (the web's
 * `resolveTournamentRegistrationBlock`; leagues have no capacity and keep their stored status).
 * Within the first three groups the earliest start comes first; the finished group is most recently
 * ended first (falling back to the start date). Rows without a date sort last in their group, and
 * `id` (byte order) breaks ties. This file is the single source of that order.
 */
const CAPACITY_HOLD_STATUSES = ['confirmed', 'awaiting_payment', 'payment_checking', 'paid'];

/** An `open` row the card renders as "모집 마감". `registration_deadline_at` is a UTC `timestamp`, so compare in UTC. */
const OPEN_BUT_BLOCKED_SQL = Prisma.sql`(
  t.kind::text IS DISTINCT FROM 'regular_league' AND (
    t.registration_deadline_at < (now() AT TIME ZONE 'UTC')
    OR (SELECT COUNT(*) FROM v1_tournament_registrations r
          WHERE r.tournament_id = t.id AND r.status::text IN (${Prisma.join(CAPACITY_HOLD_STATUSES)})) >= t.team_count
  )
)`;

const GROUP_RANK_SQL = Prisma.sql`CASE t.status::text
  WHEN 'draft' THEN 0 WHEN 'open' THEN (CASE WHEN ${OPEN_BUT_BLOCKED_SQL} THEN 1 ELSE 0 END)
  WHEN 'closed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'completed' THEN 3
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
    conditions.push(Prisma.sql`t.kind::text = 'regular_league' AND t.status::text = 'draft'`);
  } else {
    conditions.push(Prisma.sql`t.status::text = ${query.status}`);
  }
  if (query.sportId) conditions.push(Prisma.sql`t.sport_id = ${query.sportId}`);
  if (query.genderCategory) conditions.push(Prisma.sql`t.gender_category::text = ${query.genderCategory}`);
  return Prisma.join(conditions, ' AND ');
}

const FILTERED_SQL = (query: TournamentListQueryDto) => Prisma.sql`filtered AS (
  SELECT t.id,
    ${GROUP_RANK_SQL} AS grp,
    CASE WHEN t.status::text = 'completed' THEN COALESCE(t.scheduled_end_at, t.scheduled_at) ELSE t.scheduled_at END AS sort_at
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
  /** Row id to continue after; an id that no longer matches the filter yields an empty window. */
  cursor?: string;
}

/** Ids of one page window plus one lookahead row, in default list order. */
export async function listTournamentIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  query: TournamentListQueryDto,
  window: TournamentListWindow,
): Promise<string[]> {
  const take = window.limit + 1;
  const rows = window.cursor
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        WITH ${FILTERED_SQL(query)}, c AS (SELECT * FROM filtered WHERE id = ${window.cursor})
        SELECT f.id FROM filtered f, c WHERE ${AFTER_CURSOR_SQL}
        ORDER BY ${ORDER_SQL} LIMIT ${take}`
    : await prisma.$queryRaw<Array<{ id: string }>>`
        WITH ${FILTERED_SQL(query)}
        SELECT f.id FROM filtered f
        ORDER BY ${ORDER_SQL} LIMIT ${take} OFFSET ${window.offset ?? 0}`;
  return rows.map((row) => row.id);
}

export async function countTournamentList(
  prisma: Pick<PrismaService, '$queryRaw'>,
  query: TournamentListQueryDto,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    WITH ${FILTERED_SQL(query)} SELECT COUNT(*) AS total FROM filtered`;
  return Number(rows[0]?.total ?? 0);
}
