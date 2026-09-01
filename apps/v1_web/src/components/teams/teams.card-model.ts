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
  // 마스터 종목 목록이 없으면(서버 프리렌더 등) fallback 칩의 id 는 **라벨 문자열**이다.
  // 그대로 sportId 쿼리에 넣으면 `?sportId=풋살` 같은 URL 이 HTML 에 나가는데, 실제 API 필터는
  // ID 를 받으므로 아무 것도 걸리지 않는 링크다 — 크롤러가 그런 URL 을 수집하게 두지 않는다.
  const hasMasterSportIds = Boolean(masterSports?.length);
  const fixedSports = hasMasterSportIds
    ? masterSports!.slice(0, 4)
    : fallback.chips.slice(1, 5).map((chip) => ({ id: chip.label, name: chip.label.replace(/\s+\d+$/, '') }));

  return [
    { label: fallback.chips[0]?.label.replace(/\s+\d+$/, '') ?? '전체', count: items.length, active: !selectedSportId, href: buildTeamHref(params, { sportId: null }) },
    ...fixedSports.map((sport) => ({
      label: sport.name,
      count: items.filter((team) => {
        const teamSport = team.sport;
        return teamSport?.sportId === sport.id || teamSport?.name === sport.name || team.sportName === sport.name;
      }).length,
      active: selectedSportId === sport.id,
      href: buildTeamHref(params, { sportId: hasMasterSportIds ? sport.id : null }),
    })),
  ];
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
