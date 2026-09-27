/**
 * 랜딩 v4(/landing/v4)가 "지금 열려 있어요"·"문 3개"·"종목" 섹션에 쓰는 실데이터 요약.
 * 서버 전용 — fetchSeoSeed 는 실패해도 던지지 않고 null 을 돌려주므로, 이 파일도 null 을
 * 그대로 전파한다(빈 배열로 메우면 "0건"과 "못 받음"이 섞인다).
 */
import { fetchSeoSeed } from '@/lib/seo-list';
import { getStatus } from '@/components/team-matches/team-matches.card-model';
import { formatCardDate, formatCardTime, formatTournamentDateMedium } from '@/lib/date-utils';
import type { CursorPage, V1Team, V1TeamMatch, V1TournamentListItem, V1TournamentListPage } from '@/types/api';

const LIST_LIMIT = 50;

/** null 이면 목록 자체를 못 받은 것 — 화면은 그 수치 줄을 렌더하지 않는다. */
export type LandingCount = { readonly value: number; readonly more: boolean } | null;

export type LandingBySport = Readonly<Record<string, { teamMatches: number; tournaments: number; teams: number }>>;

export type LandingTournamentLiveStatus = 'in_progress' | 'open' | 'closed';

export type LandingLiveTournament = {
  readonly kind: 'tournament';
  readonly id: string;
  readonly title: string;
  readonly status: LandingTournamentLiveStatus;
  readonly statusLabel: string;
  readonly dateText: string | null;
  readonly location: string | null;
  readonly teamsText: string | null;
  readonly prizeText: string | null;
  readonly href: string;
};

export type LandingLiveTeamMatch = {
  readonly kind: 'team_match';
  readonly id: string;
  readonly hostName: string;
  readonly opponentName: string;
  readonly region: string | null;
  readonly dateTimeText: string;
  readonly isLeague: boolean;
  readonly href: string;
};

export type LandingV4Data = {
  readonly counts: {
    readonly teamMatches: LandingCount;
    readonly tournaments: LandingCount;
    readonly tournamentsOpen: LandingCount;
    readonly teams: LandingCount;
  };
  readonly bySport: LandingBySport;
  /** 세 목록 중 하나라도 받았으면 true. false 면 종목 칸은 "0"이 아니라 이름만 보여준다. */
  readonly hasAnyData: boolean;
  readonly live: readonly (LandingLiveTournament | LandingLiveTeamMatch)[];
};

export async function fetchLandingV4Data(): Promise<LandingV4Data> {
  const [teamMatches, tournaments, teams] = await Promise.all([
    fetchSeoSeed<CursorPage<V1TeamMatch>>(`/team-matches?limit=${LIST_LIMIT}`, 'landing-v4 team-matches'),
    fetchSeoSeed<V1TournamentListPage>(`/tournaments?limit=${LIST_LIMIT}`, 'landing-v4 tournaments'),
    fetchSeoSeed<CursorPage<V1Team>>(`/teams?limit=${LIST_LIMIT}`, 'landing-v4 teams'),
  ]);
  return summarizeLandingData(teamMatches, tournaments, teams, new Date());
}

export function formatLandingCount(count: LandingCount): string | null {
  if (!count) return null;
  return count.more ? `${count.value}개 이상` : `${count.value}개`;
}

/* 대회 목록 뱃지(getTournamentStatusConfig)의 "마감"과 다르게 "모집 마감"을 쓴다 — 이 섹션은
 * 목록 카드가 아니라 짧은 홍보 문구라 배지 라벨을 그대로 재사용하면 뜻이 덜 분명하다. */
const TOURNAMENT_STATUS_PRIORITY = { in_progress: 0, open: 1, closed: 2 } as const satisfies Record<LandingTournamentLiveStatus, number>;
const TOURNAMENT_STATUS_LABEL = { in_progress: '진행 중', open: '모집 중', closed: '모집 마감' } as const satisfies Record<LandingTournamentLiveStatus, string>;

function isLiveStatus(status: string): status is LandingTournamentLiveStatus {
  return Object.hasOwn(TOURNAMENT_STATUS_PRIORITY, status);
}

export function summarizeLandingData(
  teamMatchesPage: CursorPage<V1TeamMatch> | null,
  tournamentsPage: V1TournamentListPage | null,
  teamsPage: CursorPage<V1Team> | null,
  now: Date,
): LandingV4Data {
  const teamMatches = teamMatchesPage?.items ?? [];
  const tournaments = tournamentsPage?.items ?? [];
  const teams = teamsPage?.items ?? [];

  const bySport: Record<string, { teamMatches: number; tournaments: number; teams: number }> = {};
  const bump = (name: string | undefined, key: 'teamMatches' | 'tournaments' | 'teams') => {
    if (!name) return;
    bySport[name] ??= { teamMatches: 0, tournaments: 0, teams: 0 };
    bySport[name][key] += 1;
  };
  if (teamMatchesPage) for (const item of teamMatches) bump(item.sport?.name ?? item.sportName, 'teamMatches');
  if (tournamentsPage) for (const item of tournaments) bump(item.sport?.name, 'tournaments');
  if (teamsPage) for (const item of teams) bump(item.sport?.name ?? item.sportName, 'teams');

  const openCount = tournaments.filter((item) => item.status === 'open').length;

  return {
    counts: {
      teamMatches: toCount(teamMatchesPage, teamMatches.length),
      tournaments: toCount(tournamentsPage, tournaments.length),
      // 이 페이지(최대 50건) 안의 모집 중 개수다. hasNext 는 "더 있을 수도" 라는 신호를
      // 그대로 물려받는다(다음 페이지에 모집 중이 더 있을 수 있다는 뜻으로만 쓴다).
      tournamentsOpen: tournamentsPage ? { value: openCount, more: openCount > 0 && tournamentsPage.pageInfo.hasNext } : null,
      teams: toCount(teamsPage, teams.length),
    },
    bySport,
    hasAnyData: teamMatchesPage !== null || tournamentsPage !== null || teamsPage !== null,
    live: [...liveTournaments(tournaments), ...liveTeamMatches(teamMatches, now)],
  };
}

function toCount(page: { pageInfo?: { hasNext: boolean } } | null, length: number): LandingCount {
  if (!page) return null;
  return { value: length, more: page.pageInfo?.hasNext ?? false };
}

function liveTournaments(items: readonly V1TournamentListItem[]): LandingLiveTournament[] {
  return items
    .flatMap((item) => (item.promoHomeEnabled && isLiveStatus(item.status) ? [{ item, status: item.status }] : []))
    .sort((a, b) =>
      TOURNAMENT_STATUS_PRIORITY[a.status] - TOURNAMENT_STATUS_PRIORITY[b.status] || a.item.promoHomePriority - b.item.promoHomePriority,
    )
    .slice(0, 2)
    .map(({ item, status }) => ({
      kind: 'tournament' as const,
      id: item.id,
      title: item.title,
      status,
      statusLabel: TOURNAMENT_STATUS_LABEL[status],
      dateText: item.promoHomeDateText ?? formatTournamentDateMedium(item.scheduledAt),
      location: item.promoHomeLocationText,
      teamsText: item.promoHomeTeamsText,
      prizeText: item.promoHomePrizeText,
      href: `/tournaments/${item.id}`,
    }));
}

function liveTeamMatches(items: readonly V1TeamMatch[], now: Date): LandingLiveTeamMatch[] {
  const eligible: { item: V1TeamMatch; host: string; opponent: string }[] = [];
  for (const item of items) {
    if (getStatus(item) !== 'matched') continue;
    const host = item.hostTeam?.name;
    const opponent = item.approvedOpponentTeam?.name;
    if (!host || !opponent) continue;
    if (new Date(item.startsAt).getTime() <= now.getTime()) continue;
    eligible.push({ item, host, opponent });
  }
  return eligible
    .sort((a, b) => new Date(a.item.startsAt).getTime() - new Date(b.item.startsAt).getTime())
    .slice(0, 2)
    .map(({ item, host, opponent }) => ({
      kind: 'team_match' as const,
      id: item.teamMatchId ?? item.id,
      hostName: host,
      opponentName: opponent,
      region: item.region?.name ?? item.regionName ?? null,
      dateTimeText: `${formatCardDate(item.startsAt)} ${formatCardTime(item.startsAt)}`,
      isLeague: Boolean(item.league),
      href: `/team-matches/${item.teamMatchId ?? item.id}`,
    }));
}
