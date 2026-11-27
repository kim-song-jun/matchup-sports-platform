/**
 * 팀 로고가 비어 있을 때 팀 페이지가 보여 주는 기본 마크 — `apps/v1_web/src/lib/team-logo-presets.ts` 의 `resolveTeamLogoUrl` 과
 * **같은 알고리즘**이다(FNV-1a 해시 → 10개 중 하나). 위젯이 팀 페이지와 같은 마크를 쓰게 하려고 서버에서도 같은 값을 계산한다.
 * 웹 쪽 규칙을 바꾸면 이 파일과 `team-logo-presets.spec.ts` 의 기대값도 같이 바꾼다.
 */
export const TEAM_LOGO_PRESETS: readonly string[] = Array.from(
  { length: 10 },
  (_, index) => `/images/team-logos/team-logo-${String(index + 1).padStart(2, '0')}.jpg`,
);

/** 저장된 로고가 있으면 그것, 없으면 팀 id 로 고른 기본 마크. 팀을 모르면 null. 사이트 기준 경로(`/…`)나 업로드 주소 그대로 — 앞에 도메인을 붙이는 건 받는 쪽이다. */
export function resolveTeamLogoUrl(teamId: string | null | undefined, logoUrl: string | null | undefined): string | null {
  const saved = logoUrl?.trim();
  if (saved) return saved;
  const stableId = teamId?.trim();
  if (!stableId) return null;
  let hash = 2166136261;
  for (let index = 0; index < stableId.length; index += 1) {
    hash = Math.imul(hash ^ stableId.charCodeAt(index), 16777619);
  }
  return TEAM_LOGO_PRESETS[(hash >>> 0) % TEAM_LOGO_PRESETS.length];
}
