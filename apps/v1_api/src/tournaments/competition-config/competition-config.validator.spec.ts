import { UnprocessableEntityException } from '@nestjs/common';
import { validateCompetitionConfig } from './competition-config.validator';
import { REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';
import type { CompetitionConfig } from './competition-config.types';

function baseConfig(lineupOverrides: Partial<CompetitionConfig['lineup']> = {}): unknown {
  return {
    periods: [{ code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false }],
    events: ['GOAL'],
    lineup: {
      minPlayers: 3,
      maxPlayers: 5,
      substitutions: 'rolling',
      maxSubstitutions: null,
      positions: [
        { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
        { code: 'FIXO', label: '픽소', short: 'FX' },
        { code: 'PIVO', label: '피보', short: 'PV' },
      ],
      formations: [
        {
          code: '1-1',
          label: '테스트 대형',
          outfield: 2,
          slots: [
            { position: 'FIXO', x: 50, y: 35 },
            { position: 'PIVO', x: 50, y: 83 },
          ],
        },
      ],
      ...lineupOverrides,
    },
    result: { tournamentScorerPolicy: 'required', teamMatchScorerPolicy: 'optional_with_warning', mvpMin: 0, mvpMax: 1 },
    tieBreak: { points: { win: 3, draw: 1, loss: 0 }, order: REQUIRED_TIE_BREAK_ORDER, seededDraw: 'sha256-v1' },
    visibility: { default: 'live', allowed: ['live', 'official'] },
  };
}

function expectInvalid(operation: () => unknown, messageSubstring: string) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse() as { code: string; message: string };
    expect(response.code).toBe('COMPETITION_CONFIG_INVALID');
    expect(response.message).toContain(messageSubstring);
    return;
  }
  throw new Error('Expected validateCompetitionConfig to throw');
}

describe('validateCompetitionConfig — lineup.positions/formations (T1-5)', () => {
  it('accepts a lineup with exactly one goalkeeper and formation slots referencing real position codes', () => {
    expect(() => validateCompetitionConfig(baseConfig())).not.toThrow();
  });

  it('rejects lineup.positions with no goalkeeper entry', () => {
    expectInvalid(
      () => validateCompetitionConfig(baseConfig({ positions: [{ code: 'FIXO', label: '픽소', short: 'FX' }] })),
      'lineup.positions',
    );
  });

  it('rejects a formation whose slot count does not match its outfield count', () => {
    expectInvalid(
      () =>
        validateCompetitionConfig(
          baseConfig({ formations: [{ code: '1-1', label: '테스트', outfield: 2, slots: [{ position: 'FIXO', x: 50, y: 35 }] }] }),
        ),
      'lineup.formations',
    );
  });

  it('rejects a formation slot referencing a position code absent from lineup.positions', () => {
    expectInvalid(
      () =>
        validateCompetitionConfig(
          baseConfig({
            formations: [
              { code: '1-1', label: '테스트', outfield: 2, slots: [{ position: 'ALA', x: 20, y: 42 }, { position: 'PIVO', x: 50, y: 83 }] },
            ],
          }),
        ),
      'lineup.formations',
    );
  });

  it('rejects a formation slot that points at the goalkeeper position code (goalkeeper slot is always auto-added, never a preset slot)', () => {
    expectInvalid(
      () =>
        validateCompetitionConfig(
          baseConfig({
            formations: [
              { code: '1-1', label: '테스트', outfield: 2, slots: [{ position: 'GOLEIRO', x: 50, y: 6 }, { position: 'PIVO', x: 50, y: 83 }] },
            ],
          }),
        ),
      'lineup.formations',
    );
  });

  // Copilot review finding (PR #277): validateCompetitionConfig() is not only
  // a write-time guard — tournament-bracket.service.ts#recalculateStandings
  // re-runs it against an already-stored V1CompetitionConfigVersion row on
  // every standings recalculation. A row created before T1-5 simply has no
  // positions/formations key at all, so this must degrade to "no formation
  // catalog" rather than throw and break standings recalculation for
  // tournaments that already exist.
  it('accepts a legacy lineup with no positions/formations keys at all (config row predates T1-5) and normalizes them to empty arrays', () => {
    const config = validateCompetitionConfig(baseConfig({ positions: undefined, formations: undefined }));
    expect(config.lineup.positions).toEqual([]);
    expect(config.lineup.formations).toEqual([]);
  });

  it('still rejects a lineup where positions is explicitly present but malformed, even without formations', () => {
    expectInvalid(
      () =>
        validateCompetitionConfig(
          baseConfig({ positions: [{ code: 'FIXO', label: '픽소', short: 'FX' }], formations: undefined }),
        ),
      'lineup.positions',
    );
  });
});
