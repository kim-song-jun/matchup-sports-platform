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
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
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

  /**
   * schedule 은 더 이상 자기 화면을 그리지 않는다 — 통합 허브 `/bracket` 으로 접혔다.
   * 그래서 여기서 404 를 내지 않고 **조건 없이 리다이렉트**한다. 없는 대회는 그 다음
   * 홉인 `/bracket` 이 404 로 받는다(위 표가 그걸 지킨다).
   */
  it('schedule 은 대회 존재 여부와 무관하게 bracket 으로 접힌다', async () => {
    await expect(
      TournamentSchedulePage({
        params: Promise.resolve({ id: MISSING_TOURNAMENT_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(`NEXT_REDIRECT:/tournaments/${MISSING_TOURNAMENT_ID}/bracket`);
  });

  it('딥링크 쿼리는 그대로 넘긴다', async () => {
    await expect(
      TournamentSchedulePage({
        params: Promise.resolve({ id: 't-1' }),
        searchParams: Promise.resolve({ round: '결승', group: ['A', 'B'] }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/tournaments/t-1/bracket?round=%EA%B2%B0%EC%8A%B9&group=A&group=B');
  });
});
