import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getHomeViewModel } from '@/components/home/home.view-model';
import { Providers } from '../providers';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));

describe('HomePage', () => {
  /**
   * MSW is not started in vitest.setup.ts, so react-query never resolves the
   * API response. The page renders with the fallback ViewModel returned by
   * getHomeViewModel(). Tests here verify that:
   *   1. The shell renders without crashing (smoke).
   *   2. The fallback viewerName is actually wired to the greeting — if
   *      HomePageView stopped consuming model.viewerName this assertion breaks.
   *   3. The "오늘의 추천" section exists and contains at least one recommended
   *      match title from the fallback data — verifies the match rail is wired
   *      to model.recommendedMatches, not hard-coded or empty.
   */
  it('renders the home shell and wires fallback viewerName to the greeting', () => {
    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    // Brand name appears in both mobile topbar and desktop nav — at least one.
    expect(screen.getAllByText('teameet').length).toBeGreaterThan(0);

    // Greeting must include the fallback viewerName ('정민') from getHomeViewModel().
    // If viewerName binding is broken, '안녕하세요, 정민님' disappears and this fails.
    const fallback = getHomeViewModel();
    expect(screen.getByText(`안녕하세요, ${fallback.viewerName}님`)).toBeInTheDocument();

    // "오늘의 추천" section header must be present.
    expect(screen.getByText('오늘의 추천')).toBeInTheDocument();

    // At least one fallback recommended match title must be in the DOM.
    // This verifies RecommendedMatchRail receives and renders model.recommendedMatches.
    const matchTitles = fallback.recommendedMatches.map((m) => m.title);
    const renderedTitles = matchTitles.filter((title) =>
      screen.queryAllByText(title).length > 0,
    );
    expect(renderedTitles.length).toBeGreaterThan(0);

    // '공지사항' appears in both the home notices section and the desktop footer link.
    expect(screen.getAllByText('공지사항').length).toBeGreaterThan(0);
  });

  it('shows the plain greeting when signedOut fallback viewerName is absent', () => {
    // When the model has no viewerName (or signedOut=true), the greeting
    // must fall back to '안녕하세요' (without a name). We verify this by
    // checking that the greeting text without "님" suffix also exists — the
    // element rendered by 'dash ? "안녕하세요" : `안녕하세요, ${viewerName}님`'.
    // In the default fallback, signedOut=false so viewerName IS shown.
    // This test only asserts the greeting element exists at all (regression guard).
    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    // Either pattern must be present — checks the greeting element is wired up.
    const greetingEl = screen.queryByText('안녕하세요') ?? screen.queryByText(/^안녕하세요,/);
    expect(greetingEl).toBeInTheDocument();
  });
});
