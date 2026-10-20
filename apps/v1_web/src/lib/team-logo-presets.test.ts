import { describe, expect, it } from 'vitest';
import { getRandomTeamLogoPreset, isTeamLogoPreset, resolveTeamLogoUrl, TEAM_LOGO_PRESETS } from './team-logo-presets';

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

  it('uses a deterministic local preset only when a real team identity has no saved logo', () => {
    const first = resolveTeamLogoUrl({ teamId: 'team-stable-42', logoUrl: null });
    const second = resolveTeamLogoUrl({ teamId: 'team-stable-42', logoUrl: '' });

    expect(first).toMatch(/^\/images\/team-logos\/team-logo-\d{2}\.jpg$/);
    expect(TEAM_LOGO_PRESETS).toContain(first);
    expect(second).toBe(first);
    expect(resolveTeamLogoUrl({ teamId: null, logoUrl: null })).toBeNull();
    expect(resolveTeamLogoUrl({ teamId: '  ', logoUrl: '  ' })).toBeNull();
  });

  it('preserves a stored upload URL ahead of the local preset choice', () => {
    expect(resolveTeamLogoUrl({ teamId: 'team-stable-42', logoUrl: ' /uploads/team-logo.png ' })).toBe('/uploads/team-logo.png');
  });
});
