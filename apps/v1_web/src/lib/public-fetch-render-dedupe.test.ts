import { afterEach, describe, expect, it, vi } from 'vitest';
import { inServerRender, loadReactServerBuild } from '@/test/react-server-render';

vi.mock('react', () => loadReactServerBuild());

import { loadPublicTournamentCampaign } from '@/app/tournaments/campaigns/[slug]/load-public-tournament-campaign';
import { fetchPublicProfileForOg } from '@/app/users/[id]/card/fetch-profile';
import { fetchPublicV1 } from '@/lib/seo';

const react = loadReactServerBuild();

// generateMetadata and the page body both read the same API path in one render. A fetch with an
// AbortSignal is not memoized by Next, so the readers memoize themselves per render.
function apiAnswering(data: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'success', data }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('INTERNAL_API_ORIGIN', 'http://api.test');
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('public API reads inside one server render', () => {
  it('fetchPublicV1 calls the API once for the same path, and again for another path or cache mode', async () => {
    const fetchMock = apiAnswering({ id: 'm-1' });

    await inServerRender(react, async () => {
      await fetchPublicV1('/matches/m-1', { cache: 'no-store' });
      await fetchPublicV1('/matches/m-1', { cache: 'no-store' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await inServerRender(react, async () => {
      await fetchPublicV1('/matches/m-1', { cache: 'no-store' });
      await fetchPublicV1('/matches/m-1');
      await fetchPublicV1('/matches/m-2', { cache: 'no-store' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1 + 3);
  });

  it('does not share a read between two renders', async () => {
    const fetchMock = apiAnswering({ id: 'm-1' });

    await inServerRender(react, () => fetchPublicV1('/matches/m-1', { cache: 'no-store' }));
    await inServerRender(react, () => fetchPublicV1('/matches/m-1', { cache: 'no-store' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loadPublicTournamentCampaign calls the API once per slug', async () => {
    const fetchMock = apiAnswering({ id: 'campaign-1', slug: 'cup' });

    const [first, second] = await inServerRender(react, async () => [
      await loadPublicTournamentCampaign('cup'),
      await loadPublicTournamentCampaign('cup'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('fetchPublicProfileForOg treats an omitted strategy as the default one', async () => {
    const fetchMock = apiAnswering({ userId: 'u-1' });

    await inServerRender(react, async () => {
      await fetchPublicProfileForOg('u-1');
      await fetchPublicProfileForOg('u-1', 'revalidate');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
