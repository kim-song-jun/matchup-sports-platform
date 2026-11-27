import { resolveTeamLogoUrl, TEAM_LOGO_PRESETS } from './team-logo-presets';

describe('팀 로고 기본 마크 (웹 resolveTeamLogoUrl 과 같은 값)', () => {
  it('기본 마크는 10개의 서로 다른 사이트 경로', () => {
    expect(TEAM_LOGO_PRESETS).toHaveLength(10);
    expect(new Set(TEAM_LOGO_PRESETS).size).toBe(10);
    expect(TEAM_LOGO_PRESETS.every((url) => url.startsWith('/images/team-logos/'))).toBe(true);
  });

  it('저장된 로고가 있으면 기본 마크보다 먼저, 앞뒤 공백은 정리', () => {
    expect(resolveTeamLogoUrl('team-stable-42', ' /uploads/team-logo.png ')).toBe('/uploads/team-logo.png');
  });

  it('로고가 비면 팀 id 로 같은 마크를 고른다 — 웹과 같은 값(알파 한강 로버스·마포 포함)', () => {
    expect(resolveTeamLogoUrl('team-stable-42', null)).toBe(resolveTeamLogoUrl('team-stable-42', ''));
    expect(resolveTeamLogoUrl(null, null)).toBeNull();
    expect(resolveTeamLogoUrl('  ', '  ')).toBeNull();
    expect(resolveTeamLogoUrl('team-stable-42', null)).toBe('/images/team-logos/team-logo-02.jpg');
    expect(resolveTeamLogoUrl('ad300000-0000-4000-8000-000000000003', null)).toBe('/images/team-logos/team-logo-07.jpg');
    expect(resolveTeamLogoUrl('ad300000-0000-4000-8000-000000000001', null)).toBe('/images/team-logos/team-logo-09.jpg');
  });
});
