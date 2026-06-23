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

  it('홈 진입 시 인사 문구 요소가 렌더된다 (greeting wired-up 회귀 가드)', () => {
    // 기본 렌더(signedOut=false)에서는 '안녕하세요, {이름}님' 형태가 노출된다.
    // signedOut/이름 부재 분기를 단독으로 셋업해 검증하는 테스트가 아니라,
    // 인사 요소('안녕하세요' 또는 '안녕하세요, …')가 항상 wired-up임을 보장하는 회귀 가드다.
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
