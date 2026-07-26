import { describe, expect, it, vi } from 'vitest';
import { notFound } from 'next/navigation';
import {
  createV1PublicTournamentCampaignFixture,
  createV1TournamentCampaignFixture,
} from '@/test/msw/tournament-campaign-fixtures';
import { loadPublicTournamentCampaign } from './load-public-tournament-campaign';
import TournamentCampaignPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('./load-public-tournament-campaign', () => ({
  loadPublicTournamentCampaign: vi.fn(),
}));

describe('TournamentCampaignPage', () => {
  it('uses the Next server notFound boundary for an unpublished or missing campaign', async () => {
    vi.mocked(loadPublicTournamentCampaign).mockResolvedValue({ kind: 'not_found' });

    await expect(
      TournamentCampaignPage({
        params: Promise.resolve({ slug: 'unpublished-campaign' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('preserves a safe events filter in the campaign back link', async () => {
    const campaign = createV1PublicTournamentCampaignFixture(
      createV1TournamentCampaignFixture('published'),
    );
    if (!campaign) throw new Error('Published campaign fixture must be public');

    vi.mocked(loadPublicTournamentCampaign).mockResolvedValue({
      kind: 'found',
      campaign,
    });

    const page = await TournamentCampaignPage({
      params: Promise.resolve({ slug: 'seoul-futsal-open' }),
      searchParams: Promise.resolve({ from: 'events', sport: 'futsal' }),
    });

    expect((page.props as { backHref: string }).backHref).toBe('/events?sport=futsal');
  });
});
