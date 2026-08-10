import { parseLineupLimits } from './competition-config.parse';

/**
 * Extracted from a private duplicate in team-match-lineup.service.ts so
 * games.service.ts#saveLineup could reuse the exact same roster-size gate
 * instead of having no check at all — this spec locks the tolerant-defaults
 * contract both call sites depend on.
 */
describe('parseLineupLimits', () => {
  it('reads minPlayers/maxPlayers/substitutions/maxSubstitutions off a well-formed lineup blob', () => {
    expect(
      parseLineupLimits({ minPlayers: 3, maxPlayers: 6, substitutions: 'rolling', maxSubstitutions: null }),
    ).toEqual({ minPlayers: 3, maxPlayers: 6, substitutions: 'rolling', maxSubstitutions: null });
    expect(
      parseLineupLimits({ minPlayers: 7, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: 5 }),
    ).toEqual({ minPlayers: 7, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: 5 });
  });

  it('falls back to (1, 11, limited, null) for null/undefined/non-object input, never throwing', () => {
    const fallback = { minPlayers: 1, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: null };
    expect(parseLineupLimits(null)).toEqual(fallback);
    expect(parseLineupLimits(undefined)).toEqual(fallback);
    expect(parseLineupLimits('not-an-object' as never)).toEqual(fallback);
    expect(parseLineupLimits([] as never)).toEqual(fallback);
  });

  it('falls back field-by-field when individual keys are missing or malformed', () => {
    expect(parseLineupLimits({ maxPlayers: 6 })).toEqual({
      minPlayers: 1,
      maxPlayers: 6,
      substitutions: 'limited',
      maxSubstitutions: null,
    });
    expect(parseLineupLimits({ minPlayers: 'three', maxPlayers: 6, substitutions: 'rolling' })).toEqual({
      minPlayers: 1,
      maxPlayers: 6,
      substitutions: 'rolling',
      maxSubstitutions: null,
    });
  });

  it('only accepts the literal string "rolling" for substitutions — anything else (including typos) degrades to "limited"', () => {
    expect(parseLineupLimits({ substitutions: 'rolling' }).substitutions).toBe('rolling');
    expect(parseLineupLimits({ substitutions: 'unlimited' }).substitutions).toBe('limited');
    expect(parseLineupLimits({ substitutions: 'Rolling' }).substitutions).toBe('limited');
  });
});
