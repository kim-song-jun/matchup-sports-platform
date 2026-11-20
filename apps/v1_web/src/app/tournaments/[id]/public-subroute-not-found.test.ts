import { beforeEach, describe, expect, it, vi } from 'vitest';
import TournamentAwardsPage from './awards/page';
import TournamentBracketPage from './bracket/page';
import TournamentResultsPage from './results/page';
import TournamentReviewsPage from './reviews/page';
import { fetchPublicV1 } from '@/lib/seo';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/seo')>();
  return {
    ...original,
    fetchPublicV1: vi.fn(),
  };
});

vi.mock('./awards/awards-page-client', () => ({
  AwardsPageClient: () => null,
}));

vi.mock('./bracket/bracket-page-client', () => ({
  BracketPageClient: () => null,
}));

vi.mock('./results/results-page-client', () => ({
  ResultsPageClient: () => null,
}));

vi.mock('./reviews/reviews-page-client', () => ({
  TournamentReviewsPageClient: () => null,
}));

const MISSING_TOURNAMENT_ID = '00000000-0000-4000-8000-ffffffffffff';

describe('public tournament subroutes', () => {
  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
  });

  it.each([
    ['bracket', TournamentBracketPage],
    ['results', TournamentResultsPage],
    ['awards', TournamentAwardsPage],
    ['reviews', TournamentReviewsPage],
  ])('returns a true 404 when the tournament is missing on %s', async (_route, page) => {
    await expect(page({
      params: Promise.resolve({ id: MISSING_TOURNAMENT_ID }),
    })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
