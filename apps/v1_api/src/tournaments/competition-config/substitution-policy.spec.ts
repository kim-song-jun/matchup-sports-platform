import { FOOTBALL_V1_CONFIG, FUTSAL_V1_CONFIG } from './competition-config.presets';
import { validateCompetitionConfig } from './competition-config.validator';
import { SELECTABLE_SUBSTITUTION_MODES, buildSubstitutionPolicyConfig } from './substitution-policy';

describe('SELECTABLE_SUBSTITUTION_MODES', () => {
  it('is exactly the two modes the type/validator contract allows', () => {
    expect(SELECTABLE_SUBSTITUTION_MODES).toEqual(['limited', 'rolling']);
  });
});

describe('buildSubstitutionPolicyConfig', () => {
  it('overrides substitutions/maxSubstitutions, keeping every other section identical', () => {
    const result = buildSubstitutionPolicyConfig(FOOTBALL_V1_CONFIG, 'limited', 3);
    expect(result.lineup.substitutions).toBe('limited');
    expect(result.lineup.maxSubstitutions).toBe(3);
    expect(result.lineup.maxPlayers).toBe(FOOTBALL_V1_CONFIG.lineup.maxPlayers);
    expect(result.lineup.minPlayers).toBe(FOOTBALL_V1_CONFIG.lineup.minPlayers);
    expect(result.lineup.positions).toBe(FOOTBALL_V1_CONFIG.lineup.positions);
    expect(result.lineup.formations).toBe(FOOTBALL_V1_CONFIG.lineup.formations);
    expect(result.periods).toBe(FOOTBALL_V1_CONFIG.periods);
    expect(result.result).toBe(FOOTBALL_V1_CONFIG.result);
    expect(result.tieBreak).toBe(FOOTBALL_V1_CONFIG.tieBreak);
  });

  it('forces maxSubstitutions to null when mode is rolling, even if a count is passed in', () => {
    const result = buildSubstitutionPolicyConfig(FOOTBALL_V1_CONFIG, 'rolling', 5);
    expect(result.lineup.substitutions).toBe('rolling');
    expect(result.lineup.maxSubstitutions).toBeNull();
  });

  it('does not mutate the canonical preset object', () => {
    const before = JSON.stringify(FUTSAL_V1_CONFIG);
    buildSubstitutionPolicyConfig(FUTSAL_V1_CONFIG, 'limited', 4);
    expect(JSON.stringify(FUTSAL_V1_CONFIG)).toBe(before);
  });

  it('produces content that still passes validateCompetitionConfig for both modes', () => {
    expect(() => validateCompetitionConfig(buildSubstitutionPolicyConfig(FOOTBALL_V1_CONFIG, 'limited', 3))).not.toThrow();
    expect(() => validateCompetitionConfig(buildSubstitutionPolicyConfig(FUTSAL_V1_CONFIG, 'rolling', null))).not.toThrow();
  });
});
