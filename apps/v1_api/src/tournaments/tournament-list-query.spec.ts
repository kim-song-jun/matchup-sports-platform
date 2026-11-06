import { Prisma } from '@prisma/client';
import { listTournamentIds } from './tournament-list-query';

const token = (value: unknown[]) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('listTournamentIds cursor validation', () => {
  const run = (cursor: string) => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    return listTournamentIds({ $queryRaw: queryRaw } as never, {}, { limit: 5, cursor }).then((rows) => ({
      rows,
      queried: queryRaw.mock.calls.length,
    }));
  };

  it.each([
    ['month 99', '9999-99-99 99:99:99'],
    ['Feb 30', '2026-02-30 10:00:00'],
    ['hour 24', '2026-03-01 24:00:00'],
    ['year 0000', '0000-01-01 00:00:00'],
  ])('rejects a well-shaped but non-existent timestamp (%s) without reaching the database', async (_label, sortAt) => {
    expect(await run(token(['v2', 0, sortAt, 'x']))).toEqual({ rows: [], queried: 0 });
  });

  it.each([
    ['plain', '2026-03-01 10:00:00'],
    ['microseconds', '2026-03-01 10:00:00.123456'],
    ['leap day', '2028-02-29 23:59:59'],
  ])('lets a real timestamp (%s) through to the query', async (_label, sortAt) => {
    expect(await run(token(['v2', 1, sortAt, 'x']))).toEqual({ rows: [], queried: 1 });
  });
});

describe('MD-QA #145 public list capacity SQL binding', () => {
  it('compatible draft filter covers all pre-start league statuses without exposing tournament drafts', async () => {
    const statements: Prisma.Sql[] = [];
    const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(Prisma.sql(strings, ...values));
      return [];
    });
    await listTournamentIds({ $queryRaw: queryRaw } as never, { kind: 'league', status: 'draft' }, { limit: 5 });
    expect(statements[0].text).toContain("t.kind::text = 'regular_league' AND t.status::text IN ('draft', 'open', 'closed')");
  });

  it('group rank: only an open row is ranked by capacity and a draft is its own preparing group', async () => {
    const statements: Prisma.Sql[] = [];
    const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(Prisma.sql(strings, ...values));
      return [];
    });
    await listTournamentIds({ $queryRaw: queryRaw } as never, { kind: 'league' }, { limit: 5 });
    const statement = statements[0];
    if (statement === undefined) throw new Error('The actual public list query was not built');
    // Actual generated SQL is the database consumer contract; this does not claim PostgreSQL ordering execution.
    expect(statement.text).toMatch(
      /WHEN 'in_progress' THEN 0\s+WHEN 'open' THEN \(CASE WHEN[\s\S]*t\.max_teams[\s\S]*THEN 3 ELSE 1 END\)\s+WHEN 'draft' THEN 2\s+WHEN 'closed' THEN 3\s+WHEN 'completed' THEN 4\s+ELSE 5 END/,
    );
    expect(statement.values).toEqual(expect.arrayContaining(['confirmed', 'awaiting_payment', 'payment_checking', 'paid']));
  });

  it('binds league maxTeams independently from tournament teamCount and counts every reservation source', async () => {
    // This checks the actual query builder contract; PostgreSQL ordering is covered by the integration spec.
    const statements: Prisma.Sql[] = [];
    const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(Prisma.sql(strings, ...values));
      return [];
    });
    await listTournamentIds({ $queryRaw: queryRaw } as never, { kind: 'all' }, { limit: 5 });
    const statement = statements[0];
    if (statement === undefined) throw new Error('The actual public list query was not built');
    expect(statement.text).toMatch(/CASE\s+WHEN t\.kind::text = 'regular_league'\s+THEN t\.max_teams\s+ELSE t\.team_count\s+END/);
    expect(statement.text).not.toMatch(/r\.entry_source/);
    expect(statement.values.filter(value => ['confirmed', 'awaiting_payment', 'payment_checking', 'paid'].includes(String(value))))
      .toEqual(expect.arrayContaining(['confirmed', 'awaiting_payment', 'payment_checking', 'paid']));
    expect(statement.values).not.toContain('waitlisted');
    expect(statement.values).not.toContain('cancel_requested');
    expect(statement.text).not.toMatch(/max_players/);
  });
});

describe('single state order and filter', () => {
  const build = async (query: Parameters<typeof listTournamentIds>[1]) => {
    const statements: Prisma.Sql[] = [];
    const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(Prisma.sql(strings, ...values)); return [];
    });
    await listTournamentIds({ $queryRaw: queryRaw } as never, query, { limit: 5 });
    return statements[0];
  };

  it('orders by group, newest registration first, with rows lacking a date last', async () => {
    const statement = await build({ kind: 'all' });
    expect(statement.text).toContain('ORDER BY f.grp ASC, (f.sort_at IS NULL) ASC, f.sort_at DESC, f.id COLLATE "C" ASC');
    expect(statement.text).toContain("CASE WHEN t.status::text = 'completed' THEN COALESCE(t.scheduled_end_at, t.scheduled_at) ELSE t.created_at END AS sort_at");
  });

  it.each([
    ['ongoing', 0], ['recruiting', 1], ['preparing', 2], ['recruit_closed', 3], ['completed', 4],
  ] as const)('stage %s filters on the same group rank the order uses (%i)', async (stage, rank) => {
    const statement = await build({ kind: 'league', stage });
    expect(statement.text).toContain(') = $');
    expect(statement.values).toContain(rank);
    expect(statement.text).toContain('t.is_public = true');
  });

  it('carries a version tag with [group, sortAt, id] in the cursor and refuses every older shape', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'a', grp: 1, sort_at: '2026-11-01 09:00:00.123456' }]);
    const rows = await listTournamentIds({ $queryRaw: queryRaw } as never, {}, { limit: 1 });
    expect(JSON.parse(Buffer.from(rows[0].cursor, 'base64url').toString('utf8'))).toEqual(['v2', 1, '2026-11-01 09:00:00.123456', 'a']);
    queryRaw.mockClear();
    // The deploy-time shapes: three parts (before the 2026-11-03 order) and four parts with a sort mode.
    for (const old of [[1, '2026-11-01 09:00:00', 'a'], [1, '2026-11-01 09:00:00', 'a', 'latest'], ['v1', 1, '2026-11-01 09:00:00', 'a']]) {
      expect(await listTournamentIds({ $queryRaw: queryRaw } as never, {}, { limit: 1, cursor: token(old) })).toEqual([]);
    }
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('gender filter spans every kind', () => {
  const build = async (query: Parameters<typeof listTournamentIds>[1]) => {
    const statements: Prisma.Sql[] = [];
    const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(Prisma.sql(strings, ...values)); return [];
    });
    await listTournamentIds({ $queryRaw: queryRaw } as never, query, { limit: 5 });
    return statements[0];
  };

  // `kind=tournament` is excluded here: its own surface SQL already contains the tournament condition.
  it.each(['league', 'all'] as const)('kind=%s: gender alone does not narrow the list to tournaments', async (kind) => {
    const statement = await build({ kind, genderCategory: 'female' });
    expect(statement.text).toContain('t.gender_category::text = $');
    expect(statement.values).toContain('female');
    // The tournament-only narrowing (`regular_tournament OR kind IS NULL`) comes from format/fee, never from gender.
    expect(statement.text).not.toContain("t.kind::text = 'regular_tournament' OR t.kind IS NULL");
  });

  it.each([{ format: 'knockout' }, { feeMax: 0 }, { feeMin: 1000 }] as const)('format and fee still narrow to tournaments: %j', async (extra) => {
    const statement = await build({ kind: 'all', ...extra } as never);
    expect(statement.text).toContain("t.kind::text = 'regular_tournament' OR t.kind IS NULL");
  });
});
