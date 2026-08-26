/**
 * Unit coverage for the legacy formatNote → matchFormat/matchStyle/uniformColor
 * parser. A fake PrismaClient (not a real DB) is enough here since the only
 * real logic worth protecting is the ' · ' split/index mapping and the
 * candidate-selection query shape — this is deliberately NOT a
 * test/team-matches/*.integration-spec.ts (that glob is not even wired into
 * jest.config.ts's `integration` project — see jest.config.ts's comment
 * trail about test/team-schedules and test/league-matches needing an
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

  // Regression for the review finding: the old write path joined
  // [grade, format, style, uniform].filter(Boolean) — any field left blank at creation
  // time is dropped, not left as an empty slot, so every field after it shifts left by
  // one. A row with only 2 segments could be [grade,format] (style+uniform blank) just as
  // easily as [style,uniform] (grade+format blank) or [grade,uniform] (format+style
  // blank) — the count alone can't tell them apart. Only when every one of the 4 original
  // fields was filled (4 segments survive) does the position mapping hold, because then
  // nothing was dropped to begin with.
  it('does not guess positions for a partial segment count — keeps everything in matchStyle instead of mislabeling a value as format', async () => {
    const { prisma, updates } = fakePrisma([
      // Originally grade='B', format='' (blank, dropped), style='친선', uniform='파랑'.
      // A naive [grade,format,style] index mapping would wrongly read '친선' as the
      // match format and '파랑' as the style, losing the real uniform color entirely.
      { id: 'tm-legacy-mid-blank', formatNote: 'B · 친선 · 파랑' },
    ]);

    const counts = await backfillTeamMatchConditions(prisma);

    expect(counts).toEqual({ candidates: 1, updated: 1 });
    expect(updates).toEqual([
      { id: 'tm-legacy-mid-blank', data: { matchFormat: null, matchStyle: ['B', '친선', '파랑'], uniformColor: null } },
    ]);
  });

  it('handles a row with only some segments present (partial legacy write) without asserting which fields they were', async () => {
    const { prisma, updates } = fakePrisma([
      { id: 'tm-legacy-2', formatNote: 'A · 11:11' }, // 2 segments: could be [grade,format] or [style,uniform] etc — ambiguous
    ]);

    await backfillTeamMatchConditions(prisma);

    expect(updates).toEqual([
      { id: 'tm-legacy-2', data: { matchFormat: null, matchStyle: ['A', '11:11'], uniformColor: null } },
    ]);
  });

  it('writes a single ambiguous token to matchStyle instead of silently dropping it', async () => {
    const { prisma, updates } = fakePrisma([
      { id: 'tm-legacy-3', formatNote: 'ㄷㄷ' }, // matches the real alpha QA-noise row; position unknown, so kept rather than guessed away as grade
    ]);

    const counts = await backfillTeamMatchConditions(prisma);

    expect(counts).toEqual({ candidates: 1, updated: 1 });
    expect(updates).toEqual([
      { id: 'tm-legacy-3', data: { matchFormat: null, matchStyle: ['ㄷㄷ'], uniformColor: null } },
    ]);
  });

  it('skips a row whose formatNote has no non-empty segments at all (nothing worth writing)', async () => {
    const { prisma, updates } = fakePrisma([
      { id: 'tm-legacy-empty', formatNote: '' },
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
