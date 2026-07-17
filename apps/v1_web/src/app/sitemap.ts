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

export const revalidate = 300;

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/landing', priority: 1, changeFrequency: 'weekly' },
  { path: '/matches', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/teams', priority: 0.8, changeFrequency: 'daily' },
  { path: '/team-matches', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/tournaments', priority: 0.9, changeFrequency: 'daily' },
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
  ]);
  const matches = settledItems<V1Match>(results[0]);
  const teams = settledItems<V1Team>(results[1]);
  const teamMatches = settledItems<V1TeamMatch>(results[2]);
  const tournaments = settledItems<V1TournamentListItem>(results[3]);
  const notices = settledItems<V1Notice>(results[4]);

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
