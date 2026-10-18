/**
 * 랜딩(/landing)의 고정 무대·"지금 팀밋에서" 섹션이 쓰는 실데이터 요약.
 * 서버 전용 — fetchSeoSeed 는 실패해도 던지지 않고 null 을 돌려주므로, 이 파일도 null 을
 * 그대로 전파한다(빈 배열로 메우면 "0건"과 "못 받음"이 섞인다).
 */
import { fetchSeoSeed } from '@/lib/seo-list';
import { getStatus } from '@/components/team-matches/team-matches.card-model';
import { formatCardDate, formatCardTime, formatTournamentDateMedium } from '@/lib/date-utils';
import { competitionFormatLabel } from '@/lib/competition-kind';
import { resolveTournamentCapacity, resolveTournamentRegistrationBlock } from '@/lib/tournament-registration-availability';
import type { CursorPage, PageInfo, V1Team, V1TeamMatch, V1TournamentListItem, V1TournamentListPage } from '@/types/api';

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
  readonly imageUrl: string | null;
  readonly formatLabel: string;
  /** 랜딩 정원 표시는 모집 중인 정규 대회 카드에만 제공한다. 리그 카드는 별도 상태 안내를 유지한다. */
  readonly slots: { readonly confirmed: number; readonly total: number; readonly remaining: number } | null;
  readonly href: string;
};

export type LandingLiveTeamMatch = {
  readonly kind: 'team_match';
  readonly id: string;
  readonly hostName: string;
  readonly opponentName: string;
  readonly hostLogoUrl: string | null;
  readonly opponentLogoUrl: string | null;
  readonly region: string | null;
  readonly place: string | null;
  readonly dateTimeText: string;
  readonly formatText: string | null;
  readonly levelLabel: string | null;
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
  /** 진행 중 > 모집 중 > 모집 마감 순, 최대 TOURNAMENT_LIMIT 개. 첫 장이 큰 카드다. */
  readonly tournaments: readonly LandingLiveTournament[];
  /** 상대가 확정된 다가오는 팀 매치, 시작 시각 순 최대 TEAM_MATCH_LIMIT 개. */
  readonly teamMatches: readonly LandingLiveTeamMatch[];
};

const TOURNAMENT_LIMIT = 3;
const TEAM_MATCH_LIMIT = 6;

export async function fetchLandingV4Data(): Promise<LandingV4Data> {
  const [teamMatches, tournaments, teams] = await Promise.all([
    fetchAllPages<V1TeamMatch>('/team-matches', 'landing-v4 team-matches', { cache: 'no-store' }),
    fetchAllPages<V1TournamentListItem>('/tournaments', 'landing-v4 tournaments', { cache: 'no-store' }),
    fetchAllPages<V1Team>('/teams', 'landing-v4 teams'),
  ]);
  return summarizeLandingData(teamMatches, tournaments, teams, new Date());
}

/* 종목별 수치는 전체를 세야 맞다 — 첫 페이지만 세면 종목 비율이 틀린다(alpha 팀 85개 중 50개만 세던 결함).
 * MAX_PAGES 를 넘으면 hasNext 를 남겨 "N개 이상"으로 표기한다. 중간 페이지를 못 받으면 받은 데까지 쓰고 hasNext 로 표시한다. */
const MAX_PAGES = 4;

/** 여러 페이지를 이어 붙인 목록. 서버는 최상위 nextCursor 를 채우지 않아 읽을 땐 pageInfo 를 믿고, 돌려줄 땐 둘을 같게 둔다. */
export type MergedPage<T> = { items: T[]; nextCursor: string | null; pageInfo: PageInfo };

export async function fetchAllPages<T>(
  path: string,
  label: string,
  options: { cache?: 'no-store' } = {},
): Promise<MergedPage<T> | null> {
  const items: T[] = [];
  let cursor: string | null = null;
  const merged = (hasNext: boolean): MergedPage<T> => {
    const nextCursor = hasNext ? cursor : null;
    return { items, nextCursor, pageInfo: { nextCursor, hasNext } };
  };
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const query = new URLSearchParams({ limit: String(LIST_LIMIT) });
    if (cursor) query.set('cursor', cursor);
    const page = await fetchSeoSeed<CursorPage<T>>(`${path}?${query.toString()}`, label, options);
    if (!page) return pageIndex === 0 ? null : merged(true);
    items.push(...page.items);
    cursor = page.pageInfo?.nextCursor ?? null;
    if (!page.pageInfo?.hasNext || !cursor) return merged(false);
  }
  return merged(true);
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

  const openCount = tournaments.filter((item) => landingTournamentStatus(item, now) === 'open').length;

  return {
    counts: {
      teamMatches: toCount(teamMatchesPage, teamMatches.length),
      tournaments: toCount(tournamentsPage, tournaments.length),
      // 조회한 목록 안의 모집 중 개수다. hasNext 는 "더 있을 수도" 라는 신호를
      // 그대로 물려받는다(다음 페이지에 모집 중이 더 있을 수 있다는 뜻으로만 쓴다).
      tournamentsOpen: tournamentsPage ? { value: openCount, more: openCount > 0 && tournamentsPage.pageInfo.hasNext } : null,
      teams: toCount(teamsPage, teams.length),
    },
    bySport,
    hasAnyData: teamMatchesPage !== null || tournamentsPage !== null || teamsPage !== null,
    tournaments: liveTournaments(tournaments, now),
    teamMatches: liveTeamMatches(teamMatches, now),
  };
}

function toCount(page: { pageInfo?: { hasNext: boolean } } | null, length: number): LandingCount {
  if (!page) return null;
  return { value: length, more: page.pageInfo?.hasNext ?? false };
}

function landingTournamentStatus(item: V1TournamentListItem, now: Date): LandingTournamentLiveStatus | null {
  if (!isLiveStatus(item.status)) return null;
  if (item.status !== 'open') return item.status;

  // An API `open` status can remain after admission stops. The shared resolver also
  // preserves the league's distinct deadline/maxTeams contract and treats a missing
  // league deadline as unavailable; do not derive labels from stored status alone.
  const tournamentWithCapacity = item as V1TournamentListItem & { teamCount: number };
  return resolveTournamentRegistrationBlock(tournamentWithCapacity, now) === null ? 'open' : 'closed';
}

function liveTournaments(items: readonly V1TournamentListItem[], now: Date): LandingLiveTournament[] {
  return items
    .flatMap((item) => {
      const status = landingTournamentStatus(item, now);
      return item.promoHomeEnabled && status !== null ? [{ item, status }] : [];
    })
    .sort((a, b) =>
      TOURNAMENT_STATUS_PRIORITY[a.status] - TOURNAMENT_STATUS_PRIORITY[b.status] || a.item.promoHomePriority - b.item.promoHomePriority,
    )
    .slice(0, TOURNAMENT_LIMIT)
    .map(({ item, status }) => {
      const capacity =
        status === 'open' && item.kind !== 'regular_league' && typeof item.teamCount === 'number'
          ? resolveTournamentCapacity(item as V1TournamentListItem & { teamCount: number })
          : null;
      const slots =
        capacity && Number.isFinite(capacity.teamCount) && capacity.teamCount > 0
          ? { confirmed: capacity.confirmedCount, total: capacity.teamCount, remaining: capacity.remainingCount }
          : null;

      return {
        kind: 'tournament' as const,
        id: item.id,
        title: item.title,
        status,
        statusLabel: TOURNAMENT_STATUS_LABEL[status],
        dateText: item.promoHomeDateText ?? formatTournamentDateMedium(item.scheduledAt),
        location: item.promoHomeLocationText,
        teamsText: item.promoHomeTeamsText,
        prizeText: item.promoHomePrizeText,
        imageUrl: item.promoHomeImageUrl ?? item.coverImageUrl ?? null,
        formatLabel: competitionFormatLabel(item),
        slots,
        href: `/tournaments/${item.id}`,
      };
    });
}

function liveTeamMatches(items: readonly V1TeamMatch[], now: Date): LandingLiveTeamMatch[] {
  const eligible: { item: V1TeamMatch; host: NonNullable<V1TeamMatch['hostTeam']>; opponent: NonNullable<V1TeamMatch['approvedOpponentTeam']> }[] = [];
  for (const item of items) {
    if (getStatus(item) !== 'matched') continue;
    const host = item.hostTeam;
    const opponent = item.approvedOpponentTeam;
    if (!host?.name || !opponent?.name) continue;
    if (new Date(item.startsAt).getTime() <= now.getTime()) continue;
    eligible.push({ item, host, opponent });
  }
  return eligible
    .sort((a, b) => new Date(a.item.startsAt).getTime() - new Date(b.item.startsAt).getTime())
    .slice(0, TEAM_MATCH_LIMIT)
    .map(({ item, host, opponent }) => ({
      kind: 'team_match' as const,
      id: item.teamMatchId ?? item.id,
      hostName: host.name,
      opponentName: opponent.name,
      hostLogoUrl: host.logoUrl ?? null,
      opponentLogoUrl: opponent.logoUrl ?? null,
      region: item.region?.name ?? item.regionName ?? null,
      place: item.place?.name ?? (item.placeName || null),
      dateTimeText: `${formatCardDate(item.startsAt)} ${formatCardTime(item.startsAt)}`,
      formatText: item.matchFormat || null,
      levelLabel: item.levelLabel || null,
      isLeague: Boolean(item.league),
      href: `/team-matches/${item.teamMatchId ?? item.id}`,
    }));
}

/** 운영 종목 — 어느 수치에도 없는 종목을 "준비 중"으로 이름을 남기려고 고정 목록을 둔다. */
export const LANDING_SPORTS = ['풋살', '축구', '러닝', '수영'] as const;

export type LandingSportChip = { readonly name: string; readonly count: number };

/** 이 지표가 1 이상인 종목만 많은 순으로. */
export function sportChips(bySport: LandingBySport, key: keyof LandingBySport[string]): LandingSportChip[] {
  return Object.entries(bySport)
    .map(([name, counts]) => ({ name, count: counts[key] }))
    .filter((chip) => chip.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * 팀 매치·대회·팀이 모두 0 인 운영 종목을 한 줄로("러닝·수영 준비 중"). 없으면 null.
 * 목록을 하나라도 못 받았으면 0 이 "없음"인지 "못 셈"인지 모르므로 단정하지 않고 null 이다.
 */
export function idleSportsText({ bySport, counts }: Pick<LandingV4Data, 'bySport' | 'counts'>): string | null {
  if (!counts.teamMatches || !counts.tournaments || !counts.teams) return null;
  const idle = LANDING_SPORTS.filter((name) => {
    const s = bySport[name];
    return !s || s.teamMatches + s.tournaments + s.teams === 0;
  });
  return idle.length > 0 ? `${idle.join('·')} 준비 중` : null;
}
