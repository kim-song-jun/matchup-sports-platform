import { parseLineupLimits, parsePeriodDurations } from './competition-config.parse';

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

/**
 * alpha "452′" 사고 대응(2026-08) — `operate-console.tsx`의 확인 게이트가 이
 * 파서의 반환값으로 "제출을 막을지 그냥 통과시킬지"를 가른다. 실제 프리셋
 * 모양(`competition-config.presets.ts`의 `FOOTBALL_V1_CONFIG.periods` 등)과
 * 레거시 `{count:N}` 축약 모양, 개별 항목 손상까지 모두 커버한다.
 */
describe('parsePeriodDurations', () => {
  it('reads durationMinutes/extraTime off a well-formed periods array, index-aligned with input order', () => {
    expect(
      parsePeriodDurations([
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
      ]),
    ).toEqual([
      { durationMinutes: 45, extraTime: false },
      { durationMinutes: 45, extraTime: false },
    ]);
  });

  it('reads extraTime: true through unchanged for a dedicated extra-time period entry', () => {
    expect(parsePeriodDurations([{ code: 'EXTRA_FIRST', durationMinutes: 15, extraTime: true }])).toEqual([
      { durationMinutes: 15, extraTime: true },
    ]);
  });

  it('returns null wholesale for the legacy {count:N} shape — it carries no per-period duration to read', () => {
    expect(parsePeriodDurations({ count: 2 } as never)).toBeNull();
  });

  it('returns null for non-array/null/undefined input, never throwing', () => {
    expect(parsePeriodDurations(null)).toBeNull();
    expect(parsePeriodDurations(undefined)).toBeNull();
    expect(parsePeriodDurations('not-an-array' as never)).toBeNull();
  });

  it('degrades a single malformed entry to null without invalidating the rest of the array', () => {
    expect(
      parsePeriodDurations([
        { code: 'FIRST_HALF', durationMinutes: 45, extraTime: false },
        { code: 'BROKEN', durationMinutes: 0, extraTime: false },
        { code: 'MISSING_DURATION' },
        'not-an-object',
        { code: 'SECOND_HALF', durationMinutes: 45, extraTime: false },
      ] as never),
    ).toEqual([
      { durationMinutes: 45, extraTime: false },
      null,
      null,
      null,
      { durationMinutes: 45, extraTime: false },
    ]);
  });

  it('treats any non-true extraTime value as false rather than propagating a malformed flag', () => {
    expect(parsePeriodDurations([{ durationMinutes: 20, extraTime: 'yes' }] as never)).toEqual([
      { durationMinutes: 20, extraTime: false },
    ]);
  });
});
