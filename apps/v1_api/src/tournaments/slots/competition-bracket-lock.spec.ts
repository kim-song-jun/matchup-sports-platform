import type { Prisma } from '@prisma/client';
import {
  lockCompetitionForBracketMutationInTx,
  lockCompetitionForSlotReleaseInTx,
} from './competition-bracket-lock';

// The two lanes' locks do not serialize against each other (spec S2). Swapping a lane silently drops
// concurrency protection, so the lane is pinned by the SQL that actually goes out.
function fakeTx(leagueStatus: string = 'active') {
  const executed: Array<{ sql: string; values: unknown[] }> = [];
  const queried: Array<{ sql: string; values: unknown[] }> = [];
  const findFirst = jest.fn(async () => ({ status: leagueStatus }));
  const tx = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executed.push({ sql: strings.join('?'), values });
      return 1;
    }),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queried.push({ sql: strings.join('?'), values });
      return [];
    }),
    v1Tournament: { findFirst },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, executed, queried, findFirst };
}

describe('lockCompetitionForBracketMutationInTx', () => {
  it('tournament lane takes only the league-fixture-generation advisory lock and never locks the row', async () => {
    const { tx, executed, queried, findFirst } = fakeTx();
    await lockCompetitionForBracketMutationInTx(tx, { id: 't-1', kind: 'regular_tournament' });
    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('pg_advisory_xact_lock');
    expect(executed[0].values).toEqual(['league-fixture-generation:t-1']);
    expect(queried).toHaveLength(0);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('a pre-R1 row with null kind is also the tournament lane', async () => {
    const { tx, executed, queried } = fakeTx();
    await lockCompetitionForBracketMutationInTx(tx, { id: 't-2', kind: null });
    expect(executed).toHaveLength(1);
    expect(queried).toHaveLength(0);
  });

  it('regular league lane takes FOR UPDATE on the competition row and no advisory lock', async () => {
    const { tx, executed, queried } = fakeTx('active');
    await lockCompetitionForBracketMutationInTx(tx, { id: 'l-1', kind: 'regular_league' });
    expect(queried).toHaveLength(1);
    expect(queried[0].sql).toContain('v1_tournaments');
    expect(queried[0].sql).toContain('FOR UPDATE');
    expect(queried[0].values).toEqual(['l-1']);
    expect(executed).toHaveLength(0);
  });

  it('rejects an on_hold league with LEAGUE_ON_HOLD 409 after taking the row lock', async () => {
    const { tx, queried } = fakeTx('on_hold');
    await expect(
      lockCompetitionForBracketMutationInTx(tx, { id: 'l-1', kind: 'regular_league' }),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_ON_HOLD' } });
    expect(queried).toHaveLength(1);
  });
});

describe('lockCompetitionForBracketMutationInTx — ended leagues', () => {
  it.each(['completed', 'cancelled'])('rejects a %s league with LEAGUE_ENDED 409 after taking the row lock', async (status) => {
    const { tx, queried } = fakeTx(status);
    await expect(
      lockCompetitionForBracketMutationInTx(tx, { id: 'l-1', kind: 'regular_league' }),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_ENDED' } });
    expect(queried).toHaveLength(1);
  });

  it('does not apply the league status guard to the tournament lane', async () => {
    const { tx, findFirst } = fakeTx('completed');
    await expect(
      lockCompetitionForBracketMutationInTx(tx, { id: 't-1', kind: 'regular_tournament' }),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('lockCompetitionForSlotReleaseInTx', () => {
  it('does not reject an on_hold league — a withdrawn team must still free its slot', async () => {
    const { tx, queried, findFirst } = fakeTx('on_hold');
    await expect(
      lockCompetitionForSlotReleaseInTx(tx, { id: 'l-1', kind: 'regular_league' }),
    ).resolves.toBeUndefined();
    expect(queried).toHaveLength(1);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each(['completed', 'cancelled'])('does not reject a %s league — releasing a slot stays open after the league ends', async (status) => {
    const { tx, queried, findFirst } = fakeTx(status);
    await expect(
      lockCompetitionForSlotReleaseInTx(tx, { id: 'l-1', kind: 'regular_league' }),
    ).resolves.toBeUndefined();
    expect(queried).toHaveLength(1);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
