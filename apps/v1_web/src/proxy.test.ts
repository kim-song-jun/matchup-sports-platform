import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_FETCH_TIMEOUT_MS } from '@/lib/server-fetch-timeout';
import { config, proxy } from './proxy';

function campaignRequest(slug: string, method = 'GET'): NextRequest {
  return new NextRequest(`http://localhost/tournaments/campaigns/${slug}`, { method });
}

function detailRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('tournament campaign proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['GET', 'HEAD'])('sets %s campaign requests to a real 404 for unavailable slugs', async (method) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const response = await proxy(campaignRequest('archived-campaign', method));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('continues a published campaign with the normal route status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const response = await proxy(campaignRequest('published-campaign'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([429, 500, 503])('does not turn upstream status %s into a fake campaign 404', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));

    const response = await proxy(campaignRequest('temporarily-unavailable'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('propagates an availability transport failure instead of returning a fake campaign 404', async () => {
    const transportError = new TypeError('campaign availability request failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(transportError));

    await expect(proxy(campaignRequest('temporarily-unavailable'))).rejects.toBe(transportError);
  });

  it('preflights the encoded slug through the configured internal v1 API origin', async () => {
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://v1-api.internal:8121/');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await proxy(campaignRequest('summer%20futsal%20cup'));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://v1-api.internal:8121/api/v1/tournaments/campaigns/summer%20futsal%20cup/availability',
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
    );
  });

  it('uses NEXT_PUBLIC_API_URL only as the existing internal-origin fallback', async () => {
    vi.stubEnv('INTERNAL_API_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://public-api.internal:8121/api/v1');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await proxy(campaignRequest('summer-cup'));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://public-api.internal:8121/api/v1/tournaments/campaigns/summer-cup/availability',
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
    );
  });

  it('preflights public detail routes while preserving create routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const missing = await proxy(detailRequest('/matches/00000000-0000-4000-8000-ffffffffffff'));
    const create = await proxy(detailRequest('/matches/new'));

    expect(missing.status).toBe(404);
    expect(create.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not turn the notices RSS feed into a 404 just because it sits under /notices/:id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(config.matcher).toContain('/notices/:id');
    const response = await proxy(detailRequest('/notices/feed.xml'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed public detail ids without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(detailRequest('/teams/not-a-valid-id'));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['bracket', 'results', 'awards', 'reviews'])(
    'sets missing tournament %s pages to a real 404 through the tournament detail contract',
    async (subroute) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
      vi.stubGlobal('fetch', fetchMock);
      const id = '00000000-0000-4000-8000-ffffffffffff';

      const response = await proxy(detailRequest(`/tournaments/${id}/${subroute}`));

      expect(response.status).toBe(404);
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:8121/api/v1/tournaments/${id}`,
        { cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
      );
    },
  );

  it('matches campaign and public entity detail routes', () => {
    expect(config.matcher).toEqual([
      '/matches/:id',
      '/teams/:id',
      '/team-matches/:id',
      '/tournaments/:id',
      '/tournaments/:id/bracket',
      '/tournaments/:id/results',
      '/tournaments/:id/awards',
      '/tournaments/:id/reviews',
      '/tournaments/campaigns/:slug',
      '/notices/:id',
      '/tournaments/:id/matches/:fixtureId',
      '/league-matches/:leagueId/fixtures/:fixtureId',
    ]);
  });
});

const TOURNAMENT_ID = '525bd67a-e54b-41ad-a9bb-31415b882ced';
const LEAGUE_ID = '6a1f3c2e-8d4b-4f70-9a52-0c1d2e3f4a5b';
const FIXTURE_ID = '00000000-0000-4000-8000-ffffffffffff';
const OTHER_FIXTURE_ID = '11111111-1111-4111-8111-111111111111';

const teamMatchBody = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ status: 'success', data, timestamp: '2026-11-13T00:00:00.000Z' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('tournament match detail proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const path = (tournamentId: string, fixtureId: string) => `/tournaments/${tournamentId}/matches/${fixtureId}`;

  it('sets a missing tournament match to a real 404 and keeps an existing one as 200', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(null, { status: url.endsWith(FIXTURE_ID) ? 404 : 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const missing = await proxy(detailRequest(path(TOURNAMENT_ID, FIXTURE_ID)));
    const existing = await proxy(detailRequest(path(TOURNAMENT_ID, OTHER_FIXTURE_ID)));

    expect(missing.status).toBe(404);
    expect(existing.status).toBe(200);
    expect(existing.headers.get('x-middleware-next')).toBe('1');
  });

  it('asks the public match API with HEAD because only the status code is needed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await proxy(detailRequest(path(TOURNAMENT_ID, FIXTURE_ID)));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8121/api/v1/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}`,
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
    );
  });

  it.each([429, 500, 503])('does not turn upstream status %s into a fake match 404', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(detailRequest(path(TOURNAMENT_ID, FIXTURE_ID)));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([
    ['fixture id', path(TOURNAMENT_ID, 'fixture-x')],
    ['tournament id', path('not-a-uuid', FIXTURE_ID)],
  ])('rejects a malformed %s without calling the API', async (_label, requestPath) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(detailRequest(requestPath));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the campaign prefix and the tournament detail contract unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const bracket = await proxy(detailRequest(`/tournaments/${TOURNAMENT_ID}/bracket`));
    const campaign = await proxy(campaignRequest('archived-campaign'));

    expect(bracket.status).toBe(404);
    expect(campaign.status).toBe(404);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://localhost:8121/api/v1/tournaments/${TOURNAMENT_ID}`,
      { cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8121/api/v1/tournaments/campaigns/archived-campaign/availability',
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
    );
  });
});

describe('league fixture detail proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const path = (leagueId: string, fixtureId: string) => `/league-matches/${leagueId}/fixtures/${fixtureId}`;
  const API = 'http://localhost:8121/api/v1';
  const TEAM_MATCH_URL = `${API}/team-matches/${FIXTURE_ID}`;
  const leagueUrl = (leagueId: string) => `${API}/league-matches/${leagueId}`;
  const leagueFixture = () => teamMatchBody({ teamMatchId: FIXTURE_ID, league: { leagueId: LEAGUE_ID, title: '리그' } });

  // 두 조회에 주소별로 답한다. 모르는 주소는 던져서, 엉뚱한 리그로 묻는 코드를 그대로 드러낸다.
  function stubApi(handlers: { teamMatch: () => Response; league?: (url: string) => Response }) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === TEAM_MATCH_URL) return handlers.teamMatch();
      if (url.startsWith(`${API}/league-matches/`) && handlers.league) return handlers.league(url);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('sets a missing team match to a real 404', async () => {
    const fetchMock = stubApi({ teamMatch: () => new Response(null, { status: 404 }) });

    const response = await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(TEAM_MATCH_URL, { cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) });
  });

  it('sets a fixture whose league has no public page to a real 404 and asks the fixture\'s own league', async () => {
    const fetchMock = stubApi({
      teamMatch: leagueFixture,
      league: () => new Response(null, { status: 404 }),
    });

    const response = await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      leagueUrl(LEAGUE_ID),
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' }, signal: expect.any(AbortSignal) },
    );
  });

  it('keeps a fixture whose league has a public page as 200', async () => {
    stubApi({ teamMatch: leagueFixture, league: () => new Response(null, { status: 200 }) });

    const response = await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('judges by the fixture only: a wrong league id in the URL still opens the real league', async () => {
    const fetchMock = stubApi({ teamMatch: leagueFixture, league: () => new Response(null, { status: 200 }) });

    const wrongLeague = await proxy(detailRequest(path('wrong-league', FIXTURE_ID)));

    expect(wrongLeague.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(leagueUrl(LEAGUE_ID), expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(leagueUrl('wrong-league'), expect.anything());
  });

  it('judges a wrong league id in the URL by the real league even when that league is gone', async () => {
    stubApi({ teamMatch: leagueFixture, league: () => new Response(null, { status: 404 }) });

    const response = await proxy(detailRequest(path('wrong-league', FIXTURE_ID)));

    expect(response.status).toBe(404);
  });

  it('encodes the league id taken from the API response before putting it in the URL', async () => {
    const fetchMock = stubApi({
      teamMatch: () => teamMatchBody({ teamMatchId: FIXTURE_ID, league: { leagueId: '../x?y=1', title: '리그' } }),
      league: () => new Response(null, { status: 200 }),
    });

    await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(fetchMock).toHaveBeenNthCalledWith(2, leagueUrl('..%2Fx%3Fy%3D1'), expect.anything());
  });

  it.each([429, 500, 503])('does not turn league lookup status %s into a fake fixture 404', async (status) => {
    const fetchMock = stubApi({ teamMatch: leagueFixture, league: () => new Response(null, { status }) });

    const response = await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('propagates a league lookup transport failure instead of returning a fake 404', async () => {
    const transportError = new TypeError('league lookup failed');
    stubApi({
      teamMatch: leagueFixture,
      league: () => { throw transportError; },
    });

    await expect(proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)))).rejects.toBe(transportError);
  });

  it.each([
    ['without a league key', { teamMatchId: FIXTURE_ID }],
    ['with a null league', { teamMatchId: FIXTURE_ID, league: null }],
  ])('sets a friendly team match %s to a real 404 without asking for a league', async (_label, data) => {
    const fetchMock = stubApi({ teamMatch: () => teamMatchBody(data) });

    const response = await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 503])('does not turn upstream status %s into a fake fixture 404', async (status) => {
    const fetchMock = stubApi({ teamMatch: () => new Response(null, { status }) });

    const response = await proxy(detailRequest(path(LEAGUE_ID, FIXTURE_ID)));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects a malformed fixture id without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(detailRequest(path(LEAGUE_ID, 'fixture-x')));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('proxy API timeout', () => {
  const API = 'http://localhost:8121/api/v1';

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // fetch 가 signal 이 끊길 때까지 영원히 기다리는 API 를 흉내 낸다.
  function stubHangingApi() {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  // 4초를 실제로 기다리지 않도록 제한 시간만 줄인다. 시간 제한을 쓰는지는 이 신호가 끊겨야 드러난다.
  function shortenTimeout(ms = 20) {
    const real = AbortSignal.timeout.bind(AbortSignal);
    return vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => real(ms));
  }

  it('asks every API with the shared timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await proxy(detailRequest(`/matches/${FIXTURE_ID}`));

    expect(timeoutSpy).toHaveBeenCalledWith(SERVER_FETCH_TIMEOUT_MS);
    expect(SERVER_FETCH_TIMEOUT_MS).toBe(4000);
  });

  it.each([
    ['public detail', `/matches/${FIXTURE_ID}`],
    ['campaign', '/tournaments/campaigns/summer-cup'],
    ['tournament match', `/tournaments/${TOURNAMENT_ID}/matches/${FIXTURE_ID}`],
    ['league fixture', `/league-matches/${LEAGUE_ID}/fixtures/${FIXTURE_ID}`],
  ])('lets a %s request through when the API never answers', async (_label, requestPath) => {
    shortenTimeout();
    stubHangingApi();

    const response = await proxy(detailRequest(requestPath));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets a league fixture through when the league lookup stalls after the fixture answered', async () => {
    shortenTimeout();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === `${API}/team-matches/${FIXTURE_ID}`) {
        return Promise.resolve(teamMatchBody({ teamMatchId: FIXTURE_ID, league: { leagueId: LEAGUE_ID, title: '리그' } }));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(detailRequest(`/league-matches/${LEAGUE_ID}/fixtures/${FIXTURE_ID}`));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it('does not hide a non-timeout transport failure behind the timeout pass-through', async () => {
    const transportError = new TypeError('fetch failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(transportError));

    await expect(proxy(detailRequest(`/matches/${FIXTURE_ID}`))).rejects.toBe(transportError);
  });

  it('closes the detail response body instead of leaving the JSON unread', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, body: { cancel } }));

    const response = await proxy(detailRequest(`/matches/${FIXTURE_ID}`));

    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
