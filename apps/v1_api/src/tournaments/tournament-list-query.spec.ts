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
    expect(await run(token([0, sortAt, 'x']))).toEqual({ rows: [], queried: 0 });
  });

  it.each([
    ['plain', '2026-03-01 10:00:00'],
    ['microseconds', '2026-03-01 10:00:00.123456'],
    ['leap day', '2028-02-29 23:59:59'],
  ])('lets a real timestamp (%s) through to the query', async (_label, sortAt) => {
    expect(await run(token([1, sortAt, 'x']))).toEqual({ rows: [], queried: 1 });
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

  it('MD-QA #145 review follow-up draft rank: actual SQL applies capacity before ranking a league draft as recruiting', async () => {
    const statements: Prisma.Sql[] = [];
    const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(Prisma.sql(strings, ...values));
      return [];
    });
    await listTournamentIds({ $queryRaw: queryRaw } as never, { kind: 'league' }, { limit: 5 });
    const statement = statements[0];
    if (statement === undefined) throw new Error('The actual public list query was not built');
    const draftRankClause = statement.text.match(/WHEN 'draft' THEN([\s\S]*?)WHEN 'open'/)?.[1];
    // Actual generated SQL is the database consumer contract; this does not claim PostgreSQL ordering execution.
    expect(draftRankClause).toMatch(/CASE WHEN[\s\S]*t\.max_teams[\s\S]*THEN 2 ELSE 1 END/);
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
