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

export function resolveTeamLogoUrl({
  teamId,
  logoUrl,
}: {
  teamId?: string | null;
  logoUrl?: string | null;
}): string | null {
  const savedLogoUrl = logoUrl?.trim();
  if (savedLogoUrl) return savedLogoUrl;

  const stableTeamId = teamId?.trim();
  if (!stableTeamId) return null;

  let hash = 2166136261;
  for (let index = 0; index < stableTeamId.length; index += 1) {
    hash = Math.imul(hash ^ stableTeamId.charCodeAt(index), 16777619);
  }
  return TEAM_LOGO_PRESETS[(hash >>> 0) % TEAM_LOGO_PRESETS.length];
}

export function isTeamLogoPreset(url: string | null | undefined): url is string {
  return Boolean(url && TEAM_LOGO_PRESETS.includes(url));
}
