import { afterEach, describe, expect, it, vi } from 'vitest';
import type { V1PublicTournamentCampaign } from '@/types/tournament-campaign';
import {
  TournamentCampaignLoadError,
  loadPublicTournamentCampaign,
} from './load-public-tournament-campaign';

const campaign = { id: 'campaign-1', slug: 'summer-futsal-cup' } as V1PublicTournamentCampaign;

describe('loadPublicTournamentCampaign', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns published campaign data from the server-side v1 endpoint', async () => {
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://v1-api.internal:8121');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: campaign }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadPublicTournamentCampaign('summer-futsal-cup')).resolves.toEqual({
      kind: 'found',
      campaign,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://v1-api.internal:8121/api/v1/tournaments/campaigns/summer-futsal-cup',
      { cache: 'no-store', headers: { accept: 'application/json' } },
    );
  });

  it('preserves an API 404 as a not-found route result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(loadPublicTournamentCampaign('missing-campaign')).resolves.toEqual({ kind: 'not_found' });
  });

  it('does not turn a server failure into a fake not-found success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(loadPublicTournamentCampaign('summer-futsal-cup')).rejects.toBeInstanceOf(
      TournamentCampaignLoadError,
    );
  });
});
