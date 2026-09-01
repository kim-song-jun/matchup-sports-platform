import type { MetadataRoute } from 'next';
import { absoluteSiteUrl, fetchPublicV1 } from '@/lib/seo';
import type {
  CursorPage,
  V1Match,
  V1Notice,
  V1NoticesResponse,
  V1Team,
  V1TeamMatch,
  V1TournamentListItem,
  V1TournamentListPage,
} from '@/types/api';
import type { V1PublicLeagueListItem, V1PublicLeagueListResponse } from '@/types/league-match';

export const revalidate = 300;

// 리그(/league-matches)는 대회(/tournaments)와 같은 "대회 유형" 축인데도 sitemap엔
// 아예 없었다 — 그룹 C 리그 발견성 감사(Task 153 Wave 3)에서 대회와 동급
// priority/changeFrequency로 등록한다.
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/landing', priority: 1, changeFrequency: 'weekly' },
  { path: '/matches', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/teams', priority: 0.8, changeFrequency: 'daily' },
  { path: '/team-matches', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/tournaments', priority: 0.9, changeFrequency: 'daily' },
  /* `/league-matches`(리그 전용 목록)는 **여기서 뺐다** — 이제 `/tournaments?kind=league` 로
     넘어가므로(2026-09-01) 리다이렉트하는 주소를 사이트맵에 올리면 크롤러가 한 번 더 돈다.
     ⚠️ **리그 개별 페이지(`/league-matches/:id`)는 그대로 살아 있고 아래에서 계속 싣는다** —
     넘어간 것은 목록 하나뿐이다. */
  { path: '/events', priority: 0.8, changeFrequency: 'daily' },
  { path: '/notices', priority: 0.5, changeFrequency: 'daily' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteSiteUrl(route.path),
    priority: route.priority,
    changeFrequency: route.changeFrequency,
  }));

  const results = await Promise.allSettled([
    fetchCursorItems<V1Match>('/matches'),
    fetchCursorItems<V1Team>('/teams'),
    fetchCursorItems<V1TeamMatch>('/team-matches'),
    fetchTournamentItems(),
    fetchNoticeItems(),
    fetchLeagueItems(),
  ]);
  const matches = settledItems<V1Match>(results[0]);
  const teams = settledItems<V1Team>(results[1]);
  const teamMatches = settledItems<V1TeamMatch>(results[2]);
  const tournaments = settledItems<V1TournamentListItem>(results[3]);
  const notices = settledItems<V1Notice>(results[4]);
  const leagues = settledItems<V1PublicLeagueListItem>(results[5]);

  return [
    ...staticEntries,
    ...matches.flatMap((item) => {
      const id = item.matchId ?? item.id;
      return id ? [sitemapEntry(`/matches/${id}`, 0.7, 'daily')] : [];
    }),
    ...teams.map((item) => sitemapEntry(`/teams/${item.id}`, 0.6, 'weekly')),
    ...teamMatches.flatMap((item) => {
      const id = item.teamMatchId ?? item.matchId ?? item.id;
      return id ? [sitemapEntry(`/team-matches/${id}`, 0.7, 'daily')] : [];
    }),
    ...tournaments.flatMap((item) => [
      sitemapEntry(`/tournaments/${item.id}`, 0.8, 'daily', item.updatedAt),
      sitemapEntry(`/tournaments/${item.id}/bracket`, 0.6, 'daily', item.updatedAt),
      sitemapEntry(`/tournaments/${item.id}/results`, 0.6, 'daily', item.updatedAt),
      sitemapEntry(`/tournaments/${item.id}/awards`, 0.5, 'weekly', item.updatedAt),
      sitemapEntry(`/tournaments/${item.id}/reviews`, 0.5, 'weekly', item.updatedAt),
      ...(item.campaignSlug
        ? [sitemapEntry(`/tournaments/campaigns/${item.campaignSlug}`, 0.9, 'daily', item.updatedAt)]
        : []),
    ]),
    ...notices.flatMap((item) => {
      const id = item.id ?? item.noticeId;
      return id ? [sitemapEntry(`/notices/${id}`, 0.4, 'monthly', item.publishedAt)] : [];
    }),
    // draft(준비 중) 리그도 포함한다 — 대회의 draft와 달리 다르다: 공개 목록 화면
    // (지금은 통합 목록 tournaments/page.tsx)이 '준비 중'을 정식 상태 필터 옵션으로 노출해서
    // 이미 로그인 없이 브라우징 가능하다(admin이 아직 공개 안 한 대회 draft와 다른 개념 —
    // 리그의 draft는 "팀은 모였지만 대진이 아직 안 생성된" 상태다). 로그인 없이 보이는
    // 화면을 sitemap에서만 숨기면 "브라우징은 되는데 검색은 안 되는" 불일치가 생긴다.
    ...leagues.map((item) => sitemapEntry(`/league-matches/${item.leagueId}`, 0.7, 'daily')),
  ];
}

function settledItems<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === 'fulfilled' ? result.value : [];
}

async function fetchCursorItems<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    const page = await fetchPublicV1<CursorPage<T>>(`${path}?${query.toString()}`);
    if (!page) break;
    items.push(...page.items);
    cursor = page.pageInfo
      ? (page.pageInfo.hasNext ? page.pageInfo.nextCursor : null)
      : page.nextCursor;
  } while (cursor);

  return items;
}

async function fetchTournamentItems(): Promise<V1TournamentListItem[]> {
  const items: V1TournamentListItem[] = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    const page = await fetchPublicV1<V1TournamentListPage>(`/tournaments?${query.toString()}`);
    if (!page) break;
    items.push(...page.items);
    cursor = page.pageInfo.hasNext ? page.pageInfo.nextCursor : null;
  } while (cursor);

  return items;
}

async function fetchNoticeItems(): Promise<V1Notice[]> {
  const page = await fetchPublicV1<V1NoticesResponse>('/notices');
  return page?.notices ?? [];
}

// fetchTournamentItems와 같은 이유로 fetchCursorItems<T>() 제네릭 대신 전용 함수를 쓴다 —
// V1PublicLeagueListResponse는 top-level nextCursor가 없고 pageInfo가 필수 필드다.
async function fetchLeagueItems(): Promise<V1PublicLeagueListItem[]> {
  const items: V1PublicLeagueListItem[] = [];
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    const page = await fetchPublicV1<V1PublicLeagueListResponse>(`/league-matches?${query.toString()}`);
    if (!page) break;
    items.push(...page.items);
    cursor = page.pageInfo.hasNext ? page.pageInfo.nextCursor : null;
  } while (cursor);

  return items;
}

function sitemapEntry(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
  lastModified?: string | null,
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteSiteUrl(path),
    priority,
    changeFrequency,
    ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
  };
}
