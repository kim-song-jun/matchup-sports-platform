export const TEAM_LOGO_PRESETS = Array.from(
  { length: 10 },
  (_, index) => `/images/team-logos/team-logo-${String(index + 1).padStart(2, '0')}.jpg`,
) as readonly string[];

export function getRandomTeamLogoPreset(random: () => number = Math.random) {
  const index = Math.min(
    TEAM_LOGO_PRESETS.length - 1,
    Math.max(0, Math.floor(random() * TEAM_LOGO_PRESETS.length)),
  );
  return TEAM_LOGO_PRESETS[index];
}

export function isTeamLogoPreset(url: string | null | undefined): url is string {
  return Boolean(url && TEAM_LOGO_PRESETS.includes(url));
}
