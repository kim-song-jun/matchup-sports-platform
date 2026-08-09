import { FOOTBALL_V1_CONFIG, FUTSAL_V1_CONFIG } from './competition-config.presets';
import { CompetitionConfig } from './competition-config.types';
import {
  buildLineupSizeConfig,
  canonicalCompetitionConfigForSport,
  selectableLineupSizes,
} from './lineup-size';

describe('canonicalCompetitionConfigForSport', () => {
  it('returns the exact FOOTBALL_V1_CONFIG/FUTSAL_V1_CONFIG preset objects', () => {
    expect(canonicalCompetitionConfigForSport('football')).toBe(FOOTBALL_V1_CONFIG);
    expect(canonicalCompetitionConfigForSport('futsal')).toBe(FUTSAL_V1_CONFIG);
  });
});

describe('selectableLineupSizes', () => {
  it('derives futsal candidates from FUTSAL_FORMATIONS outfield counts (+1 GK), deduped and sorted', () => {
    // FUTSAL_FORMATIONS has outfield:4 (1-2-1/2-2/3-1) and outfield:5
    // (2-2-1/1-3-1/3-1-1) presets — +1 GK each gives 5 and 6, matching the
    // 5-a-side/6-a-side match styles team-match-conditions.constants.ts
    // already offers.
    expect(selectableLineupSizes(FUTSAL_V1_CONFIG)).toEqual([5, 6]);
  });

  it('falls back to only the canonical default when the sport has no formations catalog (football)', () => {
    // FOOTBALL_FORMATIONS is deliberately empty (no 11-a-side coordinate
    // data exists anywhere in this repo) — selectableLineupSizes must not
    // invent formations to fill the gap, so football has exactly one
    // candidate: its own canonical maxPlayers.
    expect(FOOTBALL_V1_CONFIG.lineup.formations).toEqual([]);
    expect(selectableLineupSizes(FOOTBALL_V1_CONFIG)).toEqual([FOOTBALL_V1_CONFIG.lineup.maxPlayers]);
  });

  it('always includes the canonical maxPlayers even if no formation happens to produce it', () => {
    const synthetic: CompetitionConfig = {
      ...FUTSAL_V1_CONFIG,
      lineup: {
        ...FUTSAL_V1_CONFIG.lineup,
        maxPlayers: 9,
        formations: [
          { code: 'x', label: 'x', outfield: 4, slots: FUTSAL_V1_CONFIG.lineup.formations[0].slots },
        ],
      },
    };
    expect(selectableLineupSizes(synthetic)).toEqual([5, 9]);
  });
});

describe('buildLineupSizeConfig', () => {
  it('overrides only lineup.maxPlayers, keeping minPlayers/positions/formations/other sections identical', () => {
    const result = buildLineupSizeConfig(FUTSAL_V1_CONFIG, 5);
    expect(result.lineup.maxPlayers).toBe(5);
    expect(result.lineup.minPlayers).toBe(FUTSAL_V1_CONFIG.lineup.minPlayers);
    expect(result.lineup.positions).toBe(FUTSAL_V1_CONFIG.lineup.positions);
    expect(result.lineup.formations).toBe(FUTSAL_V1_CONFIG.lineup.formations);
    expect(result.periods).toBe(FUTSAL_V1_CONFIG.periods);
    expect(result.result).toBe(FUTSAL_V1_CONFIG.result);
    expect(result.tieBreak).toBe(FUTSAL_V1_CONFIG.tieBreak);
  });

  it('clamps minPlayers down defensively if it would otherwise exceed the chosen maxPlayers', () => {
    const result = buildLineupSizeConfig(FUTSAL_V1_CONFIG, 2);
    expect(result.lineup.maxPlayers).toBe(2);
    expect(result.lineup.minPlayers).toBe(2);
  });

  it('does not mutate the canonical preset object', () => {
    const before = JSON.stringify(FUTSAL_V1_CONFIG);
    buildLineupSizeConfig(FUTSAL_V1_CONFIG, 5);
    expect(JSON.stringify(FUTSAL_V1_CONFIG)).toBe(before);
  });
});
