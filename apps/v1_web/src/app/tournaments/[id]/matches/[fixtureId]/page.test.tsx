/**
 * 대회 경기 상세의 대표 주소 계약 — 같은 경기가 두 주소로 열려도 canonical·og:url·SportsEvent url·
 * 이동 경로 마지막 항목이 한 주소를 가리켜야 한다. 정규 리그 경기는 리그 경기 주소가 대표다
 * (사이트맵·llms·팀 매치 이동이 모두 그 주소를 쓴다). API 경계(fetch)만 바꾸고 page·메타·LD 는 실제 코드로 돈다.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicMatchDetail } from '@/components/public-game-records/types';
import TournamentMatchPage, { generateMetadata } from './page';

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('./match-page-client', () => ({ MatchPageClient: () => null }));

const LEAGUE_ID = 'lg-1';
const TOURNAMENT_ID = 't-1';
const UNKIND_ID = 't-old';
const FIXTURE_ID = 'f-1';

const matchOf = (tournamentId: string): PublicMatchDetail => ({
  tournamentId, tournamentTitle: '송파 풋살', fixtureId: FIXTURE_ID, round: '결승', fixtureNumber: 1,
  scheduledAt: '2026-10-10T05:00:00.000Z', venue: '송파 풋살파크', fieldName: null,
  home: { registrationId: 'r-1', teamId: 'team-a', teamName: '송파 유나이티드' },
  away: { registrationId: 'r-2', teamId: 'team-b', teamName: '한강 로버스' },
  status: 'scheduled', scoreStatus: 'unavailable', score: null,
}) as unknown as PublicMatchDetail;

const KINDS: Record<string, 'regular_league' | 'regular_tournament' | null> = {
  [LEAGUE_ID]: 'regular_league',
  [TOURNAMENT_ID]: 'regular_tournament',
  [UNKIND_ID]: null,
};

let requestedPaths: string[];

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

beforeEach(() => {
  requestedPaths = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    requestedPaths.push(path);
    const match = path.match(/^\/tournaments\/([^/]+)\/matches\/([^/]+)$/);
    if (match) return match[2] === FIXTURE_ID && match[1] in KINDS ? envelope(matchOf(match[1])) : new Response(null, { status: 404 });
    const detail = path.match(/^\/tournaments\/([^/]+)$/);
    if (detail && detail[1] in KINDS) return envelope({ id: detail[1], kind: KINDS[detail[1]] });
    return new Response(null, { status: 404 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const params = (id: string, fixtureId = FIXTURE_ID) => ({ params: Promise.resolve({ id, fixtureId }) });

const LEAGUE_FIXTURE_PATH = `/league-matches/${LEAGUE_ID}/fixtures/${FIXTURE_ID}`;
const TOURNAMENT_FIXTURE_PATH = `/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}`;

describe('대회 경기 상세 메타데이터의 대표 주소', () => {
  it('정규 리그 경기는 canonical 과 og:url 이 리그 경기 주소다', async () => {
    const metadata = await generateMetadata(params(LEAGUE_ID));

    expect(metadata.alternates?.canonical).toBe(LEAGUE_FIXTURE_PATH);
    expect(metadata.openGraph?.url).toBe(LEAGUE_FIXTURE_PATH);
  });

  it('리그가 아닌 대회 경기는 자기 주소가 canonical 이다 (리그만 고치다 대회까지 옮기지 않는다)', async () => {
    const metadata = await generateMetadata(params(TOURNAMENT_ID));

    expect(metadata.alternates?.canonical).toBe(TOURNAMENT_FIXTURE_PATH);
    expect(metadata.openGraph?.url).toBe(TOURNAMENT_FIXTURE_PATH);
  });

  it('대회 종류가 비어 있는 옛 행은 대회로 본다', async () => {
    const metadata = await generateMetadata(params(UNKIND_ID));

    expect(metadata.alternates?.canonical).toBe(`/tournaments/${UNKIND_ID}/matches/${FIXTURE_ID}`);
  });

  it('없는 경기는 종류를 묻지 않고 noindex 로 떨어진다', async () => {
    const metadata = await generateMetadata(params(LEAGUE_ID, 'missing'));

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
    expect(requestedPaths).not.toContain(`/tournaments/${LEAGUE_ID}`);
  });
});

function jsonLdNodes(html: string): Array<Record<string, unknown> & { itemListElement?: Array<{ name: string; item: string }> }> {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

describe('대회 경기 상세의 구조화 데이터', () => {
  it('정규 리그 경기는 SportsEvent url 과 이동 경로 마지막 항목이 canonical 과 같은 리그 경기 주소다', async () => {
    const nodes = jsonLdNodes(renderToStaticMarkup(await TournamentMatchPage(params(LEAGUE_ID))));
    const event = nodes.find((node) => node['@type'] === 'SportsEvent');
    const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');
    const canonical = `https://teameet.co.kr${(await generateMetadata(params(LEAGUE_ID))).alternates?.canonical}`;

    expect(canonical).toBe(`https://teameet.co.kr${LEAGUE_FIXTURE_PATH}`);
    expect(event).toMatchObject({ url: canonical, '@id': `${canonical}#event` });
    const items = breadcrumb?.itemListElement ?? [];
    expect(items.at(-1)?.item).toBe(canonical);
    // 앞 항목(대회 → 대회 상세)은 그대로다 — 바뀌는 것은 마지막 항목의 주소뿐이다.
    expect(items.slice(0, 2).map((entry) => entry.item)).toEqual([
      'https://teameet.co.kr/tournaments',
      `https://teameet.co.kr/tournaments/${LEAGUE_ID}`,
    ]);
  });

  it('리그가 아닌 대회 경기는 SportsEvent url 과 이동 경로가 대회 경기 주소 그대로다', async () => {
    const nodes = jsonLdNodes(renderToStaticMarkup(await TournamentMatchPage(params(TOURNAMENT_ID))));
    const event = nodes.find((node) => node['@type'] === 'SportsEvent');
    const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');

    expect(event?.url).toBe(`https://teameet.co.kr${TOURNAMENT_FIXTURE_PATH}`);
    expect(breadcrumb?.itemListElement?.at(-1)?.item).toBe(`https://teameet.co.kr${TOURNAMENT_FIXTURE_PATH}`);
  });

  it('대회 종류는 한 번만 구해 SportsEvent 와 이동 경로가 함께 쓴다', async () => {
    renderToStaticMarkup(await TournamentMatchPage(params(LEAGUE_ID)));

    expect(requestedPaths.filter((path) => path === `/tournaments/${LEAGUE_ID}`)).toHaveLength(1);
  });
});

describe('대회 경기 상세 페이지의 404', () => {
  it('없는 경기(숨긴 경기와 같은 응답)는 notFound 로 이어진다', async () => {
    await expect(TournamentMatchPage(params(TOURNAMENT_ID, 'missing'))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
