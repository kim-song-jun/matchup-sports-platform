import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' } },
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
      { method: 'HEAD', cache: 'no-store', headers: { accept: 'application/json' } },
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
        { cache: 'no-store', headers: { accept: 'application/json' } },
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
    ]);
  });
});
