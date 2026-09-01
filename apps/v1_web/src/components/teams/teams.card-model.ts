/**
 * 팀 목록 화면이 API 응답(`V1Team`)을 카드 모델로 옮기는 순수 변환 로직.
 *
 * `matches.card-model.ts` 와 같은 이유로 `'use client'` 를 붙이지 않는다 — 팀 목록도
 * 크롤러가 받는 HTML 이 비어 있었고, 서버 컴포넌트가 같은 변환을 돌려 첫 화면을 미리
 * 그려야 한다.
 */
import type { TeamListViewModel, TeamModel } from './teams.types';
import type { V1Team } from '@/types/api';

export function toTeam(team: V1Team, fallback: TeamModel): TeamModel {
  const id = team.teamId ?? team.id;
  const sportName = team.sport?.name ?? team.sportName;
  const regionName = formatTeamRegion(team.region, team.regionName);
  const levelTag = formatTeamLevelTag(team);
  const genderRule = team.genderRule ?? '';
  const full = isTeamAtCapacity(team.memberCount, team.memberGoalCount);

  return {
    id,
    name: team.name,
    logo: team.name.slice(0, 1),
    logoUrl: team.logoUrl ?? null,
    coverImageUrl: team.coverImageUrl ?? null,
    sport: sportName,
    sports: [sportName],
    region: regionName,
    members: team.memberCount,
    capacity: team.memberGoalCount ?? 0,
    status: team.joinPolicy === 'closed' || full ? 'closed' : 'open',
    statusLabel: team.joinPolicy === 'closed' ? '가입 닫힘' : full ? '정원 마감' : '가입 신청 가능',
    tags: [levelTag, genderRule].filter(Boolean),
    genderRule,
    ownerName: team.owner?.displayName,
    managerName: team.manager?.displayName ?? null,
    intro: team.introductionPreview ?? `${regionName}에서 활동하는 ${sportName} 팀이에요.`,
    next: team.activitySummary ?? team.activityAreaText ?? '',
  };
}

export function formatTeamLevelTag(team: V1Team) {
  const explicitLabel = team.levelLabel?.trim() || team.skillLevelText?.trim();
  if (explicitLabel) return explicitLabel;
  const minName = team.minLevel?.name?.trim();
  const maxName = team.maxLevel?.name?.trim();
  if (minName && maxName) return minName === maxName ? minName : `${minName}-${maxName}`;
  return minName ?? maxName ?? '레벨 미설정';
}

export function formatTeamRegion(region?: { name: string; parentName?: string | null } | null, fallback?: string | null) {
  if (region?.parentName) return `${region.parentName} ${region.name}`;
  return region?.name ? `${region.name} 전체` : fallback ?? '지역 미정';
}

export function splitTeamRegion(region?: { name: string; parentName?: string | null } | null) {
  if (region?.parentName) return { city: region.parentName, county: region.name };
  const trimmed = region?.name?.trim();
  if (!trimmed) return { city: '', county: '지역 미정' };
  const [city, ...countyParts] = trimmed.split(/\s+/);
  if (countyParts.length === 0) return { city, county: '전체' };
  return { city, county: countyParts.join(' ') };
}

export function isTeamAtCapacity(memberCount: number, memberGoalCount?: number | null) {
  return memberGoalCount != null && memberCount >= memberGoalCount;
}

export function buildTeamSportChips(
  items: V1Team[],
  fallback: TeamListViewModel,
  params: URLSearchParams,
  selectedSportId?: string,
  masterSports?: Array<{ id: string; name: string }>,
) {
  // 마스터 종목 목록이 있으면 그것이 정답이다 — 링크에 실을 **종목 ID** 가 거기에만 있다.
  //
  // 없을 때(서버 프리렌더에서 마스터 조회까지 실패한 경우) 예전에는 `fallback.chips` 를 썼는데,
  // 그 값은 종목이 아니라 '가입 가능 / 내 주변 / 초보-중수 / 주 1회' 다 — 종목 필터 자리에
  // 종목이 아닌 라벨이 들어가 크롤러가 틀린 내용을 읽는다. 실제 팀 목록에서 종목명을 세어
  // 상위 4개를 쓰고, ID 를 모르므로 **링크는 아예 붙이지 않는다**(걸리지 않는 URL 을 만들지 않는다).
  const fixedSports: Array<{ id?: string; name: string }> = masterSports?.length
    ? masterSports.slice(0, 4).map((sport) => ({ id: sport.id, name: sport.name }))
    : topSportNames(items).map((name) => ({ name }));

  return [
    { label: fallback.chips[0]?.label.replace(/\s+\d+$/, '') ?? '전체', count: items.length, active: !selectedSportId, href: buildTeamHref(params, { sportId: null }) },
    ...fixedSports.map((sport) => ({
      label: sport.name,
      count: items.filter((team) => {
        const teamSport = team.sport;
        return (sport.id !== undefined && teamSport?.sportId === sport.id) || teamSport?.name === sport.name || team.sportName === sport.name;
      }).length,
      active: sport.id !== undefined && selectedSportId === sport.id,
      ...(sport.id === undefined ? {} : { href: buildTeamHref(params, { sportId: sport.id }) }),
    })),
  ];
}

/** 팀 목록에 실제로 있는 종목을 많은 순으로 최대 4개. 마스터 조회가 실패했을 때만 쓴다. */
function topSportNames(items: V1Team[]): string[] {
  const counts = new Map<string, number>();
  for (const team of items) {
    const name = team.sport?.name ?? team.sportName;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);
}

export function buildTeamHref(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  const queryString = next.toString();
  return queryString ? `/teams?${queryString}` : '/teams';
}
