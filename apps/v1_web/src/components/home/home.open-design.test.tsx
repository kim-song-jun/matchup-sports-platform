import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HomePageView } from './home-page';
import { getHomeViewModel } from './home.view-model';

describe('home Open Design contract', () => {
  it('renders discovery header, metric cards, supported CTAs, and notice links', () => {
    render(<HomePageView model={getHomeViewModel()} />);

    const page = screen.getByTestId('home-open-design');
    expect(page).toHaveClass('tm-home-open-design');
    expect(within(page).getByText('오늘 가능한 경기')).toBeInTheDocument();
    expect(within(page).getAllByText('이번 달 활동')[0]?.closest('.tm-metric-card')).toBeInTheDocument();
    expect(within(page).getByRole('link', { name: '매치' })).toHaveAttribute('href', '/matches');
    expect(within(page).getByRole('link', { name: '팀매치' })).toHaveAttribute('href', '/team-matches');
    expect(within(page).getByRole('link', { name: /공지사항 전체보기/ })).toHaveAttribute('href', '/notices');
  });

  it('renders the Open Design desktop home section map with v1 routes only', () => {
    const model = getHomeViewModel();

    render(<HomePageView model={model} />);

    const page = screen.getByTestId('home-open-design');
    const hero = within(page).getByTestId('home-od-hero');
    expect(within(hero).getByRole('link', { name: /오늘 매치 보기/ })).toHaveAttribute('href', '/matches');
    expect(within(hero).getByTestId('home-od-stats')).toBeInTheDocument();

    const sports = within(page).getByTestId('home-od-sports');
    expect(within(sports).getByRole('link', { name: '전체' })).toHaveAttribute('href', '/matches');
    expect(within(sports).getByRole('link', { name: '축구' })).toHaveAttribute('href', '/matches?q=%EC%B6%95%EA%B5%AC');
    expect(within(sports).getByRole('link', { name: '풋살' })).toHaveAttribute('href', '/matches?q=%ED%92%8B%EC%82%B4');
    expect(within(sports).queryAllByRole('button')).toHaveLength(0);
    expect(within(sports).queryByRole('button')).not.toBeInTheDocument();

    const recommended = within(page).getByTestId('home-od-recommended');
    expect(within(recommended).getAllByTestId('home-od-match-card')).toHaveLength(model.recommendedMatches.length);
    expect(within(page).getByTestId('home-od-team-live')).toBeInTheDocument();
    expect(within(page).getByTestId('home-od-right-rail')).toBeInTheDocument();

    const renderedHrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(renderedHrefs).toEqual(expect.arrayContaining(['/matches', '/team-matches', '/teams', '/my', '/chat', '/notifications']));
    expect(renderedHrefs.filter((href) => href.endsWith('.html') || href.startsWith('file:') || href === '#')).toEqual([]);
  });

  it('keeps network fallback honest inside the Open Design shell', () => {
    const retry = vi.fn();
    const model = { ...getHomeViewModel(), network: true, retry };

    render(<HomePageView model={model} />);

    const page = screen.getByTestId('home-open-design');
    const retryPanel = within(page).getByTestId('home-od-network-retry');
    expect(within(retryPanel).getByRole('button', { name: '다시 불러오기' })).toBeEnabled();
    expect(within(page).queryByTestId('home-od-match-card')).not.toBeInTheDocument();
  });

  it('uses general recommendation copy for signed-out visitors', () => {
    const model = { ...getHomeViewModel(), signedOut: true, viewerName: null };

    render(<HomePageView model={model} />);

    const summary = within(screen.getByTestId('home-open-design')).getByTestId('home-od-signed-out-summary');
    expect(summary).toHaveTextContent('로그인하면');
    expect(summary).not.toHaveTextContent('정민');
    expect(summary).not.toHaveTextContent('상위');
  });

  it('keeps AppChrome mobile navigation while desktop rail is CSS-gated', () => {
    render(<HomePageView model={getHomeViewModel()} />);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toHaveClass('tm-bottom-nav');
    expect(screen.getByLabelText('데스크탑 주요 메뉴')).toHaveClass('tm-desktop-nav');
    expect(within(screen.getByTestId('home-open-design')).getByTestId('home-od-right-rail')).toHaveAttribute('data-desktop-only', 'true');
  });
});
