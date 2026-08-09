import { beforeEach, describe, expect, it, vi } from 'vitest';
import TournamentAwardsPage from './awards/page';
import TournamentBracketPage from './bracket/page';
import TournamentResultsPage from './results/page';
import TournamentReviewsPage from './reviews/page';
import TournamentSchedulePage from './schedule-view/page';
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

vi.mock('./schedule-view/schedule-page-client', () => ({
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
    // schedule 은 형제와 같은 base-tournament 게이트를 쓰므로(force-dynamic·generateMetadata 내
    // notFound throw 는 제거해 형제와 구조 통일) 여기 포함해 페이지 컴포넌트의 notFound() 호출을
    // 계약으로 박제한다. (없는 대회의 실제 HTTP 200→404 확정은 프로덕션 런타임 동작이라 alpha 재측정 몫.)
    ['schedule', TournamentSchedulePage],
  ])('returns a true 404 when the tournament is missing on %s', async (_route, page) => {
    await expect(page({
      params: Promise.resolve({ id: MISSING_TOURNAMENT_ID }),
    })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
