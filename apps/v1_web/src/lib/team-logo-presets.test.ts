import { describe, expect, it } from 'vitest';
import { getRandomTeamLogoPreset, isTeamLogoPreset, TEAM_LOGO_PRESETS } from './team-logo-presets';

describe('team logo presets', () => {
  it('exposes ten unique public image paths', () => {
    expect(TEAM_LOGO_PRESETS).toHaveLength(10);
    expect(new Set(TEAM_LOGO_PRESETS).size).toBe(10);
    expect(TEAM_LOGO_PRESETS.every((url) => url.startsWith('/images/team-logos/'))).toBe(true);
  });

  it('maps a random value to one stable preset choice', () => {
    expect(getRandomTeamLogoPreset(() => 0)).toBe(TEAM_LOGO_PRESETS[0]);
    expect(getRandomTeamLogoPreset(() => 0.9999)).toBe(TEAM_LOGO_PRESETS[9]);
  });

  it('distinguishes bundled presets from uploaded images', () => {
    expect(isTeamLogoPreset(TEAM_LOGO_PRESETS[3])).toBe(true);
    expect(isTeamLogoPreset('/uploads/2026/07/custom.jpg')).toBe(false);
    expect(isTeamLogoPreset(null)).toBe(false);
  });
});
