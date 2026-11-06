import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { PUBLIC_COMPETITION_STATUS_WHERE } from '../../src/tournaments/tournaments-read.query';
import { TOURNAMENT_SURFACE_KIND } from '../../src/tournaments/tournament-surface';
import { PUBLIC_TOURNAMENT_VISIBILITY_WHERE } from '../../src/tournaments/tournament-surface-lookup';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * The public list order is computed by the database. The fixture mixes every group, null dates,
 * id ties, and rows the public surface must hide, so a wrong ORDER BY, keyset comparison or filter
 * changes the visible sequence. Order: in progress, recruiting, preparing (league draft), recruitment closed,
 * finished. Inside a group the most recently registered row (`createdAt`) comes first; finished rows sort by
 * when they ended. A stored `open` row the card shows as "접수 마감" (deadline passed or capacity held) must
 * sort with the closed group; unlimited leagues keep their stored status.
 */
describe('대회 공개 목록 DB 정렬·페이지 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let read: TournamentsReadService;
  let sportId: string;
  let otherSportId: string;
  let teamId: string;
  const prefix = randomUUID().slice(0, 8);
  const id = (name: string) => `${prefix}-${name}`;
  const day = (d: number) => new Date(Date.UTC(2026, 9, d));
  const PAST_DEADLINE = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const FUTURE_DEADLINE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
    deadline?: Date;
    capacity?: number;
    /** Status of the single registration the row gets (one team per tournament). */
    held?: 'confirmed' | 'awaiting_payment' | 'cancelled';
    /** Minutes after the fixture epoch the row was registered; defaults to its position in `seeds` (later = newer). */
    created?: number;
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
    // Same registration time: the id (byte order) breaks the tie.
    { name: 'o-tie-b', status: 'open', start: day(11), created: 8 },
    { name: 'o-tie-a', status: 'open', start: day(11), created: 8 },
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
    // Stored open, but the card shows "모집 마감": deadline passed, or capacity held by confirmed / pending teams.
    { name: 'o-expired', status: 'open', start: day(9), deadline: PAST_DEADLINE },
    { name: 'o-full-confirmed', status: 'open', start: day(8), capacity: 1, held: 'confirmed' },
    { name: 'o-full-pending', status: 'open', start: day(17), capacity: 1, held: 'awaiting_payment' },
    // Controls on the other side of each rule: still recruiting.
    { name: 'o-future-deadline', status: 'open', start: day(19), deadline: FUTURE_DEADLINE },
    { name: 'o-room', status: 'open', start: day(21), capacity: 2, held: 'confirmed' },
    { name: 'o-cancelled-reg', status: 'open', start: day(22), capacity: 1, held: 'cancelled' },
    // Unlimited leagues ignore historical teamCount. Since 2026-10-27 an open league past its deadline is 모집 마감 like a tournament.
    { name: 'lg-expired', status: 'open', kind: 'regular_league', start: day(23), deadline: PAST_DEADLINE },
    { name: 'lg-full', status: 'open', kind: 'regular_league', start: day(24), capacity: 1, held: 'confirmed' },
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
    const owner = await db.v1User.create({
      data: { email: `list-order-${prefix}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' },
    });
    const region = await db.v1Region.create({ data: { code: `list-order-${prefix}`, name: 'list order', level: 1 } });
    teamId = (await db.v1Team.create({ data: { ownerUserId: owner.id, sportId, regionId: region.id, name: `list order ${prefix}` } })).id;
    for (const [index, seed] of seeds.entries()) {
      await db.v1Tournament.create({
        data: {
          id: id(seed.name),
          createdAt: new Date(Date.UTC(2026, 8, 1, 0, seed.created ?? index)),
          sportId: seed.sport === 'other' ? otherSportId : sportId,
          title: seed.name,
          status: seed.status,
          kind: seed.kind === undefined ? 'regular_tournament' : seed.kind,
          scheduledAt: seed.start === undefined ? null : seed.start,
          scheduledEndAt: seed.end ?? null,
          isPublic: seed.isPublic ?? true,
          deletedAt: seed.deleted ? new Date() : null,
          genderCategory: seed.gender ?? null,
          teamCount: seed.capacity ?? 8,
          registrationDeadlineAt: seed.deadline ?? null,
        },
      });
      if (seed.held) {
        await db.v1TournamentRegistration.create({
          data: { tournamentId: id(seed.name), teamId, appliedByUserId: owner.id, status: seed.held },
        });
      }
    }
  });
  afterAll(async () => cleanup?.());

  const list = (query: Record<string, unknown>) => read.list({ sportId, ...query } as never);
  const ids = (res: { items: Array<{ id: string }> }) => res.items.map((i) => i.id.slice(prefix.length + 1));

  const TOURNAMENT_ORDER = [
    // in progress: most recently registered first
    'ip-soon', 'ip-late',
    // recruiting: most recently registered first, id breaks the o-tie tie
    'f-female', 'o-cancelled-reg', 'o-room', 'o-future-deadline', 'legacy-null-kind', 'o-nodate', 'o-tie-a', 'o-tie-b', 'o-soon', 'o-late',
    // closed: stored closed plus stored-open rows past their deadline or at capacity, most recently registered first
    'o-full-pending', 'o-full-confirmed', 'o-expired', 'cl-soon', 'cl-late',
    // finished: most recently ended first (end falls back to start), no date last
    'c-new', 'c-noend', 'c-old', 'c-nodate',
  ];
  // League rows join the same groups: a league draft is its own "preparing" group between recruiting and closed.
  const ALL_ORDER = [
    'ip-soon', 'ip-late',
    'f-female', 'lg-full', 'o-cancelled-reg', 'o-room', 'o-future-deadline', 'lg-open', 'legacy-null-kind', 'o-nodate', 'o-tie-a', 'o-tie-b', 'o-soon', 'o-late',
    'lg-draft',
    'lg-expired', 'o-full-pending', 'o-full-confirmed', 'o-expired', 'cl-soon', 'cl-late',
    'c-new', 'c-noend', 'lg-done', 'c-old', 'c-nodate',
  ];

  it('groups in_progress -> recruiting -> closed -> completed, newest registration first inside a group', async () => {
    expect(ids(await list({ limit: 50 }))).toEqual(TOURNAMENT_ORDER);
  });

  it('sorts a stored-open row the card shows as 접수 마감 with the closed group, for leagues too', async () => {
    const order = ids(await list({ kind: 'all', limit: 50 }));
    const closedNames = ['cl-soon', 'cl-late', 'o-expired', 'o-full-confirmed', 'o-full-pending', 'lg-expired'];
    const firstClosed = Math.min(...closedNames.map((name) => order.indexOf(name)));
    const lastClosed = Math.max(...closedNames.map((name) => order.indexOf(name)));
    expect(firstClosed).toBe(order.indexOf('lg-draft') + 1);
    expect(lastClosed).toBe(order.indexOf('c-new') - 1);
    for (const name of ['o-future-deadline', 'o-room', 'o-cancelled-reg', 'lg-full']) {
      expect(order.indexOf(name)).toBeLessThan(order.indexOf('lg-draft'));
    }
  });

  it('kind=league puts a league draft between recruiting and closed, and kind=all merges both kinds in one order', async () => {
    expect(ids(await list({ kind: 'league', limit: 50 }))).toEqual([
      'lg-full', 'lg-open', 'lg-draft', 'lg-expired', 'lg-done',
    ]);
    expect(ids(await list({ kind: 'all', limit: 50 }))).toEqual(ALL_ORDER);
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
    const totalPages = Math.ceil(TOURNAMENT_ORDER.length / 4);
    for (let page = 1; page <= totalPages; page += 1) {
      const res = await list({ limit: 4, page });
      expect(res.pageInfo).toMatchObject({ page, total: TOURNAMENT_ORDER.length, totalPages });
      seen.push(...ids(res));
    }
    expect(seen).toEqual(TOURNAMENT_ORDER);
    expect(ids(await list({ limit: 4, page: totalPages + 1 }))).toEqual([]);
  });

  it('a cursor that is not one this list issued returns an empty page instead of restarting', async () => {
    const forge = (value: unknown[]) => Buffer.from(JSON.stringify(value)).toString('base64url');
    for (const cursor of [
      id('o-soon'),
      'no-such-id',
      forge(['v2', 9, null, 'x']),
      forge(['v2', 0, '9999-99-99 99:99:99', 'x']),
      forge(['v2', 0, '2026-02-30 10:00:00', 'x']),
      // Cursors issued before the 2026-11-03 order: three parts, or four with a sort mode that no longer exists.
      forge([0, '2026-03-01 10:00:00', 'x']),
      forge([0, '2026-03-01 10:00:00', 'x', 'latest']),
    ]) {
      const res = await list({ cursor, limit: 5 });
      expect(res.items).toEqual([]);
      expect(res.pageInfo).toEqual({ nextCursor: null, hasNext: false });
    }
  });

  it('a cursor row that turns into 모집 마감 between pages does not skip the rows still recruiting', async () => {
    const first = await list({ limit: 5 });
    expect(ids(first).at(-1)).toBe('o-room');
    expect(first.pageInfo.hasNext).toBe(true);

    await db.v1Tournament.update({ where: { id: id('o-room') }, data: { registrationDeadlineAt: PAST_DEADLINE } });
    try {
      const rest: string[] = [];
      let cursor: string | undefined = first.pageInfo.nextCursor ?? undefined;
      for (let guard = 0; cursor && guard < 40; guard += 1) {
        const page = await list({ limit: 9, cursor });
        rest.push(...ids(page));
        cursor = page.pageInfo.nextCursor ?? undefined;
      }
      const expected = TOURNAMENT_ORDER.slice(TOURNAMENT_ORDER.indexOf('o-room') + 1);
      // The cursor row itself reappears under its new group; every other row is returned exactly once.
      expect(rest.filter((name) => name !== 'o-room')).toEqual(expected);
    } finally {
      await db.v1Tournament.update({ where: { id: id('o-room') }, data: { registrationDeadlineAt: null } });
    }
  });

  it('page 1 wins over a cursor sent with it: the first rows, reported as page 1 with the total', async () => {
    const first = await list({ limit: 1 });
    expect(ids(first)).toEqual(['ip-soon']);
    const res = await list({ cursor: first.pageInfo.nextCursor, page: 1, limit: 2 });
    expect(ids(res)).toEqual(['ip-soon', 'ip-late']);
    expect(res.pageInfo).toMatchObject({ page: 1, total: TOURNAMENT_ORDER.length, hasPrev: false });
  });

  it('filters keep their meaning: status, gender, sport', async () => {
    expect(ids(await list({ status: 'completed', limit: 50 }))).toEqual(['c-new', 'c-noend', 'c-old', 'c-nodate']);
    expect(ids(await list({ status: 'draft', limit: 50 }))).toEqual([]);
    expect(ids(await list({ kind: 'league', status: 'draft', limit: 50 }))).toEqual(['lg-full', 'lg-open', 'lg-draft', 'lg-expired']);
    expect(ids(await list({ genderCategory: 'female', limit: 50 }))).toEqual(['f-female']);
    const other = await read.list({ sportId: otherSportId, limit: 50 } as never);
    expect(ids(other)).toEqual(['f-other-sport']);
  });

  it('stage selects exactly the rows whose card shows that state', async () => {
    expect(ids(await list({ stage: 'ongoing', limit: 50 }))).toEqual(['ip-soon', 'ip-late']);
    expect(ids(await list({ stage: 'recruiting', limit: 50 }))).toEqual(TOURNAMENT_ORDER.slice(2, 12));
    expect(ids(await list({ stage: 'recruit_closed', limit: 50 }))).toEqual(TOURNAMENT_ORDER.slice(12, 17));
    expect(ids(await list({ stage: 'completed', limit: 50 }))).toEqual(TOURNAMENT_ORDER.slice(17));
    // A tournament draft is operator preparation and never public; only a league draft is "preparing".
    expect(ids(await list({ stage: 'preparing', limit: 50 }))).toEqual([]);
    expect(ids(await list({ kind: 'league', stage: 'preparing', limit: 50 }))).toEqual(['lg-draft']);
    expect(ids(await list({ kind: 'league', stage: 'recruiting', limit: 50 }))).toEqual(['lg-full', 'lg-open']);
    expect(ids(await list({ kind: 'league', stage: 'recruit_closed', limit: 50 }))).toEqual(['lg-expired']);
  });

  it('the pre-start filter includes a closed league and reports the matching total', async () => {
    await db.v1Tournament.update({ where: { id: id('lg-open') }, data: { status: 'closed' } });
    try {
      const result = await list({ kind: 'league', status: 'draft', limit: 50, page: 1 });
      expect(ids(result)).toEqual(['lg-full', 'lg-draft', 'lg-expired', 'lg-open']);
      expect(result.pageInfo).toMatchObject({ total: 4 });
    } finally {
      await db.v1Tournament.update({ where: { id: id('lg-open') }, data: { status: 'open' } });
    }
  });

  it.each([
    ['confirmed', 'seeded'], ['awaiting_payment', 'applied'],
    ['payment_checking', 'promoted'], ['paid', 'applied'],
  ] as const)('MD-QA #145: actual DB order closes a finite league held by %s/%s while null remains unlimited', async (held, entrySource) => {
    const sport = await db.v1Sport.create({ data: { code: `list-cap-${prefix}-${held}`, name: '정원 정렬' } });
    const originalTeam = await db.v1Team.findUniqueOrThrow({ where: { id: teamId }, select: { ownerUserId: true, regionId: true } });
    const team = await db.v1Team.create({ data: { ...originalTeam, sportId: sport.id, name: `정원 ${held}` } });
    type CapacitySeed = {
      name: string; kind: 'regular_league' | 'regular_tournament' | null; maxTeams: number | null; teamCount: number;
      status?: 'draft' | 'open';
      held: typeof held | 'waitlisted' | 'cancel_requested' | 'cancelled';
    };
    const capacitySeeds: CapacitySeed[] = [
      // A full league (the oldest row) must still sort AFTER all recruiting rows once its real team cap is full.
      { name: 'league-full', kind: 'regular_league', maxTeams: 1, teamCount: 8, held },
      { name: 'league-unlimited', kind: 'regular_league', maxTeams: null, teamCount: 1, held },
      { name: 'league-room', kind: 'regular_league', maxTeams: 2, teamCount: 1, held },
      { name: 'league-waitlisted', kind: 'regular_league', maxTeams: 1, teamCount: 8, held: 'waitlisted' },
      { name: 'league-cancel-requested', kind: 'regular_league', maxTeams: 1, teamCount: 8, held: 'cancel_requested' },
      { name: 'league-cancelled', kind: 'regular_league', maxTeams: 1, teamCount: 8, held: 'cancelled' },
      { name: 'tournament-full', kind: 'regular_tournament', maxTeams: null, teamCount: 1, held },
      { name: 'legacy-null-full', kind: null, maxTeams: 20, teamCount: 1, held },
      { name: 'tournament-room', kind: 'regular_tournament', maxTeams: 1, teamCount: 2, held },
      { name: 'league-draft-full', kind: 'regular_league', maxTeams: 1, teamCount: 8, status: 'draft', held },
      { name: 'league-draft-room', kind: 'regular_league', maxTeams: 2, teamCount: 1, status: 'draft', held },
      { name: 'league-draft-unlimited', kind: 'regular_league', maxTeams: null, teamCount: 1, status: 'draft', held },
    ];
    for (const [index, seed] of capacitySeeds.entries()) {
      const tournament = await db.v1Tournament.create({ data: {
        title: seed.name, sportId: sport.id, kind: seed.kind, status: seed.status ?? 'open', isPublic: true,
        maxTeams: seed.maxTeams, teamCount: seed.teamCount, maxPlayers: 20, scheduledAt: day(index + 1),
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
      } });
      await db.v1TournamentRegistration.create({ data: {
        tournamentId: tournament.id, teamId: team.id, appliedByUserId: originalTeam.ownerUserId,
        status: seed.held, entrySource,
      } });
    }
    const actual = await read.list({ sportId: sport.id, kind: 'all', limit: 50 });
    // Recruiting first, then the league drafts (their own group whatever their capacity), then the full rows; newest first inside each.
    expect(actual.items.map(item => item.title)).toEqual([
      'tournament-room', 'league-cancelled', 'league-cancel-requested', 'league-waitlisted', 'league-room', 'league-unlimited',
      'league-draft-unlimited', 'league-draft-room', 'league-draft-full',
      'legacy-null-full', 'tournament-full', 'league-full',
    ]);
  });

  /** Reference check: the SQL filter selects the same row set as the Prisma `where` the surface constants express. */
  it('selects the same rows as the equivalent Prisma where for every filter combination', async () => {
    const kinds: Record<string, Prisma.V1TournamentWhereInput[]> = {
      tournament: [TOURNAMENT_SURFACE_KIND],
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
            statusWhere = PUBLIC_COMPETITION_STATUS_WHERE;
          } else if (status === 'draft') {
            statusWhere = { kind: 'regular_league', status: { in: ['draft', 'open', 'closed'] } };
          } else {
            statusWhere = { status };
          }
          const expected = await db.v1Tournament.findMany({
            where: {
              AND: [...kinds[kind], statusWhere, PUBLIC_TOURNAMENT_VISIBILITY_WHERE],
              sportId,
              deletedAt: null,
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
