/**
 * 팀매치 목록 화면이 API 응답(`V1TeamMatch`)을 카드 모델로 옮기는 순수 변환 로직.
 *
 * `matches.card-model.ts` 와 같은 이유로 `'use client'` 를 붙이지 않는다 — 팀매치 목록도
 * 크롤러가 받는 HTML 이 비어 있었고, 서버 컴포넌트가 같은 변환을 돌려 첫 화면을 미리
 * 그려야 한다.
 */
import type { TeamMatchListViewModel, TeamMatchModel } from './team-matches.types';
import type { V1Sport, V1TeamMatch, V1TeamMatchApiStatus, V1TeamMatchViewerState } from '@/types/api';

// 경기조건은 구조화 필드(matchFormat/matchStyle/uniformColor, levelLabel)가 진실이다. `fallback`은
// 화면 스켈레톤용 하드코딩 목업(team-matches.view-model.ts)일 뿐 이 매치의 실제 조건이 아니므로
// grade/format/style/uniform에는 쓰지 않는다 — 실제 매치에 다른 매치의 목업 문구("A등급",
// "11:11" 등)를 그대로 노출하는 회귀였다(리뷰 지적).
//
// 백필 CLI 실행 전(구조화 컬럼 3종이 전부 비어 있는) 레거시 row는 서버가 만든 표시 전용 파생값인
// rulesText(formatMatchConditionsRulesText, team-matches.service.ts 참고 — 그 케이스에서는
// formatNote 원문을 그대로 담아 내려준다)를 style 한 칸에 그대로 보여준다. rulesText를 ' · '로
// 재-split해 grade/format/style/uniform 네 칸에 다시 배정하지는 않는다(예전 parseRules가 이
// 방식이었다) — 원래 저장 로직이 filter(Boolean)으로 빈 필드를 건너뛰고 이어붙여 위치를 보존하지
// 않았기 때문에 재분해는 값을 엉뚱한 칸에 잘못 배정할 수 있다(team-match-conditions-backfill.ts
// 문서 주석 참고, 동일한 근거). style 한 칸에 그대로 두면 값을 잃지도, 틀린 라벨을 붙이지도 않는다.
// exported for direct unit coverage (see team-matches-client.test.tsx) — a pure mapping
// function, cheaper to test directly than by plumbing new testids through the mocked
// page-view component tree.
export function toTeamMatch(match: V1TeamMatch, fallback: TeamMatchModel): TeamMatchModel {
  const status = statusToCardStatus(getStatus(match), getViewerState(match));
  const costs = parseCosts(match.costNote);
  const hasStructuredConditions = Boolean(match.matchFormat) || (match.matchStyle?.length ?? 0) > 0 || Boolean(match.uniformColor);
  const legacyNote = !hasStructuredConditions ? match.rulesText ?? '' : '';

  return {
    ...fallback,
    id: match.teamMatchId ?? match.id ?? fallback.id,
    title: match.title,
    imageUrl: match.imageUrl ?? fallback.imageUrl,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    hostTeam: match.hostTeam?.name ?? match.hostTeamName ?? fallback.hostTeam,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    region: match.region?.name ?? match.regionName ?? fallback.region,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    endTime: match.endsAt ? formatTime(match.endsAt) : undefined,
    grade: match.levelLabel || '',
    format: match.matchFormat || '',
    style: match.matchStyle?.length ? match.matchStyle.join(' · ') : legacyNote,
    cost: costs.cost,
    opponentCost: costs.opponentCost,
    league: match.league ?? null,
    uniform: match.uniformColor || '',
    gender: match.genderRule ?? fallback.gender,
    // V1TeamMatch(hostTeam)는 신뢰상태(trustState, 등급 문자열)만 내려줄 뿐 매너 평점·승수 같은
    // 숫자 통계는 API 어디에도 없다 — `...fallback` 스프레드에 맡겨두면 매치마다 다른 실제 팀인데도
    // 항상 같은 목업(매너 4.8·승 23 등)이 그대로 노출됐다(실사고 원인). 0으로 채우는 것도
    // "매너 0점·0승"이라는 새 거짓말이라(실제로 잘하는 팀이 최악으로 보인다) null 로 두고
    // 화면이 그 줄을 감춘다 — 값이 생기면(백엔드가 팀 통계를 내려주면) 그때 다시 채우면 된다.
    manner: null,
    wins: null,
    status,
  };
}

export function buildSportChips({
  base,
  params,
  sports,
  matches,
  selectedSportId,
}: {
  base: TeamMatchListViewModel;
  params: URLSearchParams;
  sports?: Array<{ id: string; name: string }>;
  matches: V1TeamMatch[];
  selectedSportId?: string;
}): TeamMatchListViewModel['sports'] {
  const fixedSports = sports?.length
    ? sports.slice(0, 4)
    : base.sports.slice(1, 5).map((sport) => ({ id: sport.label, name: sport.label }));

  return [
    {
      label: base.sports[0]?.label ?? '전체',
      count: matches.length,
      active: !selectedSportId,
      href: buildTeamMatchHref(params, { sportId: null, filter: null }),
    },
    ...fixedSports.map((sport) => ({
      label: sport.name,
      count: matches.filter((match) => {
        const matchSport = match.sport;
        return matchSport?.sportId === sport.id || matchSport?.name === sport.name || match.sportName === sport.name;
      }).length,
      active: selectedSportId === sport.id,
      href: buildTeamMatchHref(params, { sportId: sport.id, filter: null }),
    })),
  ];
}

export function buildTeamMatchHref(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  const queryString = next.toString();
  return queryString ? `/team-matches?${queryString}` : '/team-matches';
}

export function getStatus(match: V1TeamMatch): V1TeamMatchApiStatus {
  return (match.displayState as V1TeamMatchApiStatus | undefined) ?? (match.status as V1TeamMatchApiStatus);
}

export function getViewerState(match: V1TeamMatch): V1TeamMatchViewerState {
  return match.viewer?.state ?? match.viewerState ?? 'none';
}

export function statusToCardStatus(status: V1TeamMatchApiStatus, viewerState: V1TeamMatchViewerState = 'none'): TeamMatchModel['status'] {
  if (viewerState === 'host_team') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved') return 'approved';
  if (status === 'matched' || status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired') return 'closed';
  return 'open';
}

export function parseCosts(value: string | null | undefined) {
  const amounts = value?.match(/\d[\d,]*/g)?.map((item) => Number(item.replace(/,/g, ''))) ?? [];
  // costNote가 없으면(호스트가 비용을 안 적었으면) 이 매치의 실제 비용은 "모른다"이지, 다른
  // 목업 매치의 280,000원/140,000원이 아니다. 0으로 채우면 '무료초청' 배지가 붙어 "공짜다"라는
  // 또 다른 거짓말이 되므로(리그 대진처럼 costNote가 항상 비는 매치가 통째로 무료초청으로
  // 표시된다), 모르는 값은 null 로 두고 화면이 그 자리를 감추게 한다.
  return {
    cost: amounts[0] ?? null,
    opponentCost: amounts[1] ?? null,
  };
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
