import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppChrome } from './shell';

describe('AppChrome Open Design shell contract', () => {
  it('renders desktop navigation, top search, create CTA, and preserves mobile bottom nav', () => {
    const { container } = render(
      <AppChrome title="홈" activeTab="matches" showSearch>
        <div>본문</div>
      </AppChrome>,
    );

    const desktopNav = screen.getByLabelText('데스크탑 주요 메뉴');
    expect(desktopNav).toHaveClass('tm-desktop-nav');
    expect(within(desktopNav).getByText('teameet')).toBeInTheDocument();
    expect(within(desktopNav).getByRole('link', { name: '매치' })).toHaveAttribute('aria-current', 'page');
    expect(within(desktopNav).getByRole('link', { name: '매치 만들기' })).toHaveAttribute('href', '/matches/new');

    expect(container.firstElementChild).toHaveClass('tm-app-frame-wide');
    expect(screen.getByRole('searchbox', { name: '통합 검색' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toHaveClass('tm-bottom-nav');
    expect(screen.getByRole('main')).toHaveClass('tm-scroll-area');
  });

  it('uses the responsive wide frame for immersive routes without bottom navigation', () => {
    const { container } = render(
      <AppChrome title="채팅" activeTab="my" bottomNav={false}>
        <div>대화</div>
      </AppChrome>,
    );

    expect(container.firstElementChild).toHaveClass('tm-app-frame-wide');
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).not.toBeInTheDocument();
  });
});
