/**
 * /matches·/team-matches·/teams 첫 HTML 계약 — 비-JS 크롤러가 받는 HTML 에 첫 페이지 항목이 있어야 하고,
 * API 가 실패하면 "…가 없어요" 빈 상태를 사실처럼 그리지 않고 로딩 스켈레톤을 낸다.
 * API 경계(fetch)만 바꾸고 페이지 → 클라이언트 → React Query 는 실제 코드로 렌더한다.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Match, V1Sport, V1Team, V1TeamMatch } from '@/types/api';

const searchParamsState = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import MatchesPage from './matches/page';
import TeamMatchesPage from './team-matches/page';
import TeamsPage from './teams/page';

const FUTSAL = { id: 'sport-futsal-uuid', code: 'futsal', name: '풋살', levels: [] } as unknown as V1Sport;

const MATCH = {
  id: 'match-1', matchId: 'match-1', title: '금요일 저녁 풋살 한 판',
  sport: { id: 'sport-futsal-uuid', name: '풋살' }, place: { id: 'place-1', name: '강남 풋살파크' },
  region: { id: 'region-1', name: '서울 강남구' }, startsAt: '2026-10-02T10:00:00.000Z',
  endsAt: '2026-10-02T12:00:00.000Z', status: 'recruiting', participantCount: 6, capacity: 10,
} as unknown as V1Match;

/** 마감된 매치는 카드에서 뒤로 간다 — LD 가 서버 응답 순서가 아니라 카드 순서를 따르는지 가른다. */
const CLOSED_MATCH = {
  ...MATCH, id: 'match-0', matchId: 'match-0', title: '마감된 수요일 풋살', status: 'closed',
} as unknown as V1Match;

const TEAM_MATCH = {
  id: 'tm-1', teamMatchId: 'tm-1', title: '주말 풋살 친선전 상대 구해요',
  sport: { id: 'sport-futsal-uuid', name: '풋살' }, hostTeam: { id: 'team-1', name: '강남 유나이티드' },
  place: { id: 'place-1', name: '강남 풋살파크' }, region: { id: 'region-1', name: '서울 강남구' },
  startsAt: '2026-10-03T02:00:00.000Z', status: 'recruiting',
} as unknown as V1TeamMatch;

const TEAM = {
  id: 'team-1', teamId: 'team-1', name: '강남 유나이티드', sportId: 'sport-futsal-uuid', sportName: '풋살',
  regionName: '서울 강남구', memberCount: 12, trustState: 'none', joinPolicy: 'approval_required',
} as unknown as V1Team;

const requested: string[] = [];

function stubApi(respond: (path: string) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    requested.push(path);
    return respond(path);
  }));
}

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

function pageOf(items: unknown[]) {
  return { items, pageInfo: { nextCursor: null, hasNext: false, total: items.length } };
}

/** 목록 경로마다 한 항목짜리 첫 페이지, 마스터 종목은 풋살 하나. */
function healthyApi(path: string): Response {
  if (path === '/master/sports') return envelope([FUTSAL]);
  if (path === '/matches') return envelope(pageOf([CLOSED_MATCH, MATCH]));
  if (path === '/team-matches') return envelope(pageOf([TEAM_MATCH]));
  if (path === '/teams?limit=20') return envelope(pageOf([TEAM]));
  return new Response('unexpected', { status: 500 });
}

// 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다(fetchStatus 'idle',
// isLoading=false). 그 상태를 재현하지 않으면 로딩/빈 상태 단언이 실서버와 다르게 통과한다.
type ListPage = (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>;

async function serverHtml(page: ListPage, query = ''): Promise<string> {
  searchParamsState.value = new URLSearchParams(query);
  const node = await page({ searchParams: Promise.resolve(Object.fromEntries(searchParamsState.value)) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>,
  );
}

/** JSON-LD 는 따로 본다 — 본문 검사가 스크립트 안의 값으로 통과하면 안 된다. */
function markup(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

function itemList(html: string): Array<{ name: string; url: string }> | null {
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
  if (!match) return null;
  return (JSON.parse(match[1]) as { itemListElement: Array<{ name: string; url: string }> }).itemListElement;
}

/** 카드가 그린 상세 링크를 화면 순서대로. */
function detailPaths(html: string, prefix: string): string[] {
  const hrefs = [...markup(html).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(hrefs.filter((href) => new RegExp(`^${prefix}/[^/?]+$`).test(href) && !href.endsWith('/new')))];
}

function ldPaths(html: string): string[] {
  return (itemList(html) ?? []).map((entry) => new URL(entry.url).pathname);
}

beforeEach(() => {
  requested.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('공개 목록 첫 HTML — seed 성공', () => {
  beforeEach(() => stubApi(healthyApi));

  it('/matches 는 첫 페이지 매치와 상세 링크, 실제 종목 ID 칩을 그린다', async () => {
    const html = await serverHtml(MatchesPage);

    expect(html).toContain('금요일 저녁 풋살 한 판');
    expect(html).toContain('href="/matches/match-1"');
    expect(html).toContain('sportId=sport-futsal-uuid');
    expect(html).not.toContain('tm-skeleton-page');
    // ItemList 는 카드와 1:1 — 같은 순서(모집 중 먼저)·같은 상세 URL·같은 이름.
    expect(detailPaths(html, '/matches')).toEqual(['/matches/match-1', '/matches/match-0']);
    expect(ldPaths(html)).toEqual(detailPaths(html, '/matches'));
    expect(itemList(html)?.map((entry) => entry.name)).toEqual(['금요일 저녁 풋살 한 판', '마감된 수요일 풋살']);
  });

  it('/team-matches 는 첫 페이지 팀매치와 상세 링크, 실제 종목 ID 칩을 그린다', async () => {
    const html = await serverHtml(TeamMatchesPage);

    expect(html).toContain('주말 풋살 친선전 상대 구해요');
    expect(html).toContain('href="/team-matches/tm-1"');
    expect(html).toContain('sportId=sport-futsal-uuid');
    expect(html).not.toContain('tm-skeleton-page');
    expect(ldPaths(html)).toEqual(['/team-matches/tm-1']);
    expect(ldPaths(html)).toEqual(detailPaths(html, '/team-matches'));
    // 이름은 팀매치 제목만 — 호스트 팀 이름 같은 다른 입력이 섞이지 않는다.
    expect(itemList(html)?.map((entry) => entry.name)).toEqual(['주말 풋살 친선전 상대 구해요']);
  });

  it('/teams 는 첫 페이지 팀과 상세 링크, 실제 종목 ID 칩을 그린다', async () => {
    const html = await serverHtml(TeamsPage);

    expect(html).toContain('강남 유나이티드');
    expect(html).toContain('href="/teams/team-1"');
    expect(html).toContain('sportId=sport-futsal-uuid');
    expect(html).not.toContain('팀 목록 불러오는 중');
    expect(ldPaths(html)).toEqual(['/teams/team-1']);
    expect(ldPaths(html)).toEqual(detailPaths(html, '/teams'));
    expect(itemList(html)?.map((entry) => entry.name)).toEqual(['강남 유나이티드']);
  });

  it.each([
    ['/matches', MatchesPage, 'regionId=region-1'],
    ['/team-matches', TeamMatchesPage, 'kind=friendly'],
    ['/teams', TeamsPage, 'sportId=sport-futsal-uuid'],
  ] as const)('%s 는 필터가 걸린 주소에서 ItemList 를 내지 않는다', async (_path, page, query) => {
    const html = await serverHtml(page, query);

    expect(html).not.toContain('application/ld+json');
  });

  // 팀 목록은 필터가 걸리면 클라이언트가 seed 를 버린다 — 매치·팀매치는 무필터 전체 목록 쿼리가 seed 를 계속 쓴다.
  it('/teams 는 필터가 걸린 주소에서 버려질 목록 seed 를 요청하지 않는다', async () => {
    await serverHtml(TeamsPage, 'sportId=sport-futsal-uuid');
    expect(requested).not.toContain('/teams?limit=20');
  });

  it('/matches 는 필터가 걸려도 전체 목록 쿼리용 seed 를 받는다', async () => {
    await serverHtml(MatchesPage, 'regionId=region-1');
    expect(requested).toContain('/matches');
  });
});

describe('공개 목록 첫 HTML — API 실패', () => {
  beforeEach(() => stubApi(() => new Response('upstream down', { status: 503 })));

  it('/matches 는 빈 상태 대신 로딩 스켈레톤을 낸다', async () => {
    const html = await serverHtml(MatchesPage);

    expect(html).toContain('tm-skeleton-page');
    expect(html).not.toContain('조건에 맞는 매치가 없어요');
    expect(html).not.toContain('application/ld+json');
  });

  it('/team-matches 는 빈 상태 대신 로딩 스켈레톤을 낸다', async () => {
    const html = await serverHtml(TeamMatchesPage);

    expect(html).toContain('tm-skeleton-page');
    expect(html).not.toContain('조건에 맞는 팀매치가 없어요');
    expect(html).not.toContain('application/ld+json');
  });

  it('/teams 는 실패한 seed 를 빈 목록으로 넘기지 않고 로딩 스켈레톤을 낸다', async () => {
    const html = await serverHtml(TeamsPage);

    expect(html).toContain('팀 목록 불러오는 중');
    expect(html).not.toContain('조건에 맞는 팀이 없어요');
    expect(html).not.toContain('application/ld+json');
  });
});
