/**
 * Unit coverage for the legacy formatNote → matchFormat/matchStyle/uniformColor
 * parser. A fake PrismaClient (not a real DB) is enough here since the only
 * real logic worth protecting is the ' · ' split/index mapping and the
 * candidate-selection query shape — this is deliberately NOT a
 * test/team-matches/*.integration-spec.ts (that glob is not even wired into
 * jest.config.ts's `integration` project — see jest.config.ts's comment
 * trail about test/team-schedules and test/team-match-series needing an
 * explicit glob addition; test/team-matches/ never got one, so any spec
 * placed there today would silently never run under `--selectProjects
 * integration`, exactly the trap those comments warn about. Flagged
 * separately, not fixed here — jest.config.ts is out of this lane's file
 * ownership).
 */
import { backfillTeamMatchConditions } from './team-match-conditions-backfill';

function fakePrisma(rows: Array<{ id: string; formatNote: string | null }>) {
  const updates: Array<{ id: string; data: { matchFormat: string | null; matchStyle: string[]; uniformColor: string | null } }> = [];
  return {
    prisma: {
      v1TeamMatch: {
        findMany: jest.fn(async (args: unknown) => {
          expect(args).toMatchObject({
            where: {
              formatNote: { not: null },
              matchFormat: null,
              uniformColor: null,
              matchStyle: { equals: [] },
            },
          });
          return rows;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: typeof updates[number]['data'] }) => {
          updates.push({ id: where.id, data });
          return { id: where.id, ...data };
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    updates,
  };
}

describe('backfillTeamMatchConditions', () => {
  it('splits legacy formatNote by the create-client join order, discarding index 0 (grade)', async () => {
    const { prisma, updates } = fakePrisma([
      { id: 'tm-legacy-1', formatNote: 'B · 5:5 · 친선 · 파랑' },
    ]);

    const counts = await backfillTeamMatchConditions(prisma);

    expect(counts).toEqual({ candidates: 1, updated: 1 });
    expect(updates).toEqual([
      { id: 'tm-legacy-1', data: { matchFormat: '5:5', matchStyle: ['친선'], uniformColor: '파랑' } },
    ]);
  });

  it('handles a row with only some segments present (partial legacy write)', async () => {
    const { prisma, updates } = fakePrisma([
      { id: 'tm-legacy-2', formatNote: 'A · 11:11' }, // no style/uniform segment at all
    ]);

    await backfillTeamMatchConditions(prisma);

    expect(updates).toEqual([
      { id: 'tm-legacy-2', data: { matchFormat: '11:11', matchStyle: [], uniformColor: null } },
    ]);
  });

  it('skips a row when every parsed segment is empty (nothing worth writing)', async () => {
    const { prisma, updates } = fakePrisma([
      { id: 'tm-legacy-3', formatNote: 'ㄷㄷ' }, // only a grade-position token, matches the real alpha QA-noise row
    ]);

    const counts = await backfillTeamMatchConditions(prisma);

    expect(counts).toEqual({ candidates: 1, updated: 0 });
    expect(updates).toEqual([]);
  });

  it('is a no-op when there are no candidate rows', async () => {
    const { prisma, updates } = fakePrisma([]);

    const counts = await backfillTeamMatchConditions(prisma);

    expect(counts).toEqual({ candidates: 0, updated: 0 });
    expect(updates).toEqual([]);
  });
});
