import { beforeEach, describe, expect, it, vi } from 'vitest';
import TournamentAwardsPage from './awards/page';
import TournamentBracketPage from './bracket/page';
import TournamentResultsPage from './results/page';
import TournamentReviewsPage from './reviews/page';
import TournamentSchedulePage from './schedule/page';
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

vi.mock('./schedule/schedule-page-client', () => ({
  SchedulePageClient: () => null,
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
    // schedule 은 예전에 하위 엔드포인트로 게이트해 없는 대회에서도 200 을 반환했다. 이제
    // 형제와 같은 base-tournament 게이트를 쓰므로 여기 포함해 notFound() 호출을 계약으로 박제한다.
    ['schedule', TournamentSchedulePage],
  ])('returns a true 404 when the tournament is missing on %s', async (_route, page) => {
    await expect(page({
      params: Promise.resolve({ id: MISSING_TOURNAMENT_ID }),
    })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
