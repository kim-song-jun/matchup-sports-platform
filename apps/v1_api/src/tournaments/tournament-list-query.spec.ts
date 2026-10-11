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
