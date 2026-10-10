import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Default public list order is computed by the database. The fixture mixes every group, null dates,
 * id ties, and rows the public surface must hide, so a wrong ORDER BY, keyset comparison or filter
 * changes the visible sequence.
 */
describe('대회 공개 목록 DB 정렬·페이지 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let read: TournamentsReadService;
  let sportId: string;
  let otherSportId: string;
  const prefix = randomUUID().slice(0, 8);
  const id = (name: string) => `${prefix}-${name}`;
  const day = (d: number) => new Date(Date.UTC(2026, 9, d));

  type Seed = {
    name: string;
    status: 'draft' | 'open' | 'closed' | 'in_progress' | 'completed' | 'cancelled';
    kind?: 'regular_tournament' | 'regular_league' | null;
    start?: Date | null;
    end?: Date | null;
    isPublic?: boolean;
    deleted?: boolean;
    gender?: 'male' | 'female' | 'mixed';
    sport?: 'main' | 'other';
  };
  // Seeds in deliberately shuffled order. `kind` defaults to regular_tournament.
  const seeds: Seed[] = [
    { name: 'c-old', status: 'completed', start: day(1), end: day(2) },
    { name: 'ip-late', status: 'in_progress', start: day(20) },
    { name: 'o-late', status: 'open', start: day(25) },
    { name: 'cl-late', status: 'closed', start: day(18) },
    { name: 'c-new', status: 'completed', start: day(3), end: day(9) },
    { name: 'c-noend', status: 'completed', start: day(7), end: null },
    { name: 'c-nodate', status: 'completed', start: null },
    { name: 'o-soon', status: 'open', start: day(11) },
    { name: 'o-tie-b', status: 'open', start: day(11) },
    { name: 'o-tie-a', status: 'open', start: day(11) },
    { name: 'o-nodate', status: 'open', start: null },
    { name: 'ip-soon', status: 'in_progress', start: day(10) },
    { name: 'cl-soon', status: 'closed', start: day(12) },
    { name: 'legacy-null-kind', status: 'open', kind: null, start: day(13) },
    // Hidden from the default (tournament) surface; shown with kind=league / kind=all.
    { name: 'lg-draft', status: 'draft', kind: 'regular_league', start: day(5) },
    { name: 'lg-open', status: 'open', kind: 'regular_league', start: day(14) },
    { name: 'lg-done', status: 'completed', kind: 'regular_league', start: day(2), end: day(4) },
    // Never public.
    { name: 'x-draft', status: 'draft', start: day(6) },
    { name: 'x-cancelled', status: 'cancelled', start: day(6) },
    { name: 'x-private', status: 'open', start: day(6), isPublic: false },
    { name: 'x-deleted', status: 'open', start: day(6), deleted: true },
    // Filter coverage.
    { name: 'f-female', status: 'open', start: day(15), gender: 'female' },
    { name: 'f-other-sport', status: 'open', start: day(16), sport: 'other' },
  ];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    read = app.get(TournamentsReadService);
    sportId = (await db.v1Sport.create({ data: { code: `list-order-${prefix}`, name: '풋살' } })).id;
    otherSportId = (await db.v1Sport.create({ data: { code: `list-order-other-${prefix}`, name: '러닝' } })).id;
    for (const seed of seeds) {
      await db.v1Tournament.create({
        data: {
          id: id(seed.name),
          sportId: seed.sport === 'other' ? otherSportId : sportId,
          title: seed.name,
          status: seed.status,
          kind: seed.kind === undefined ? 'regular_tournament' : seed.kind,
          scheduledAt: seed.start === undefined ? null : seed.start,
          scheduledEndAt: seed.end ?? null,
          isPublic: seed.isPublic ?? true,
          deletedAt: seed.deleted ? new Date() : null,
          genderCategory: seed.gender ?? null,
          teamCount: 8,
        },
      });
    }
  });
  afterAll(async () => cleanup?.());

  const list = (query: Record<string, unknown>) => read.list({ sportId, ...query } as never);
  const ids = (res: { items: Array<{ id: string }> }) => res.items.map((i) => i.id.slice(prefix.length + 1));

  const TOURNAMENT_ORDER = [
    // recruiting: earliest start first, id ties, no date last
    'o-soon', 'o-tie-a', 'o-tie-b', 'legacy-null-kind', 'f-female', 'o-late', 'o-nodate',
    'cl-soon', 'cl-late',
    'ip-soon', 'ip-late',
    // finished: most recently ended first (end falls back to start), no date last
    'c-new', 'c-noend', 'c-old', 'c-nodate',
  ];

  it('groups open -> closed -> in_progress -> completed with the per-group date direction', async () => {
    expect(ids(await list({ limit: 50 }))).toEqual(TOURNAMENT_ORDER);
  });

  it('kind=league puts a league draft with recruiting and kind=all merges both kinds in one order', async () => {
    expect(ids(await list({ kind: 'league', limit: 50 }))).toEqual(['lg-draft', 'lg-open', 'lg-done']);
    const all = ids(await list({ kind: 'all', limit: 50 }));
    expect(all).toEqual([
      'lg-draft', 'o-soon', 'o-tie-a', 'o-tie-b', 'legacy-null-kind', 'lg-open', 'f-female', 'o-late', 'o-nodate',
      'cl-soon', 'cl-late', 'ip-soon', 'ip-late', 'c-new', 'c-noend', 'lg-done', 'c-old', 'c-nodate',
    ]);
  });

  it.each([1, 2, 3, 5])('cursor paging with limit %i yields every row once, in order', async (limit) => {
    for (const kind of ['tournament', 'all'] as const) {
      const expected = ids(await list({ kind, limit: 50 }));
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 40; guard += 1) {
        const page = await list({ kind, limit, cursor });
        seen.push(...ids(page));
        expect(page.pageInfo.hasNext).toBe(page.pageInfo.nextCursor !== null);
        cursor = page.pageInfo.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual(expected);
    }
  });

  it('page-number paging matches the same order and reports the total', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 4; page += 1) {
      const res = await list({ limit: 4, page });
      expect(res.pageInfo).toMatchObject({ page, total: TOURNAMENT_ORDER.length, totalPages: 4 });
      seen.push(...ids(res));
    }
    expect(seen).toEqual(TOURNAMENT_ORDER);
    expect(ids(await list({ limit: 4, page: 5 }))).toEqual([]);
  });

  it('a cursor that is hidden or missing returns an empty page instead of restarting', async () => {
    for (const cursor of [id('x-private'), id('x-deleted'), id('lg-open'), 'no-such-id']) {
      const res = await list({ cursor, limit: 5 });
      expect(res.items).toEqual([]);
      expect(res.pageInfo).toEqual({ nextCursor: null, hasNext: false });
    }
  });

  it('page 1 with a cursor keeps following the cursor, like page-less requests', async () => {
    const res = await list({ cursor: id('o-soon'), page: 1, limit: 2 });
    expect(ids(res)).toEqual(['o-tie-a', 'o-tie-b']);
  });

  it('filters keep their meaning: status, gender, sport', async () => {
    expect(ids(await list({ status: 'completed', limit: 50 }))).toEqual(['c-new', 'c-noend', 'c-old', 'c-nodate']);
    expect(ids(await list({ status: 'draft', limit: 50 }))).toEqual([]);
    expect(ids(await list({ kind: 'league', status: 'draft', limit: 50 }))).toEqual(['lg-draft']);
    expect(ids(await list({ genderCategory: 'female', limit: 50 }))).toEqual(['f-female']);
    const other = await read.list({ sportId: otherSportId, limit: 50 } as never);
    expect(ids(other)).toEqual(['f-other-sport']);
  });

  /** Reference check: the SQL filter selects the same row set as the Prisma `where` the surface constants express. */
  it('selects the same rows as the equivalent Prisma where for every filter combination', async () => {
    const kinds: Record<string, Prisma.V1TournamentWhereInput[]> = {
      tournament: [{ OR: [{ kind: 'regular_tournament' }, { kind: null }] }],
      league: [{ kind: 'regular_league' }],
      all: [],
    };
    const statuses: Array<'open' | 'closed' | 'in_progress' | 'completed' | 'draft' | undefined> = [
      undefined, 'open', 'closed', 'in_progress', 'completed', 'draft',
    ];
    for (const kind of ['tournament', 'league', 'all'] as const) {
      for (const status of statuses) {
        for (const genderCategory of [undefined, 'female'] as const) {
          let statusWhere: Prisma.V1TournamentWhereInput;
          if (status === undefined) {
            statusWhere = {
              OR: [{ status: { in: ['open', 'closed', 'in_progress', 'completed'] } }, { kind: 'regular_league', status: 'draft' }],
            };
          } else if (status === 'draft') {
            statusWhere = { kind: 'regular_league', status: 'draft' };
          } else {
            statusWhere = { status };
          }
          const expected = await db.v1Tournament.findMany({
            where: {
              AND: [...kinds[kind], statusWhere],
              sportId,
              deletedAt: null,
              isPublic: true,
              ...(genderCategory ? { genderCategory } : {}),
            },
            select: { id: true },
          });
          const actual = await list({ kind, status, genderCategory, limit: 100 });
          expect(actual.items.map((i) => i.id).sort()).toEqual(expected.map((r) => r.id).sort());
        }
      }
    }
  });
});
