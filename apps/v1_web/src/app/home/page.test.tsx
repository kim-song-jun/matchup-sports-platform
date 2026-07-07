import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getHomeViewModel } from '@/components/home/home.view-model';
import { Providers } from '../providers';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));

describe('HomePage', () => {
  it('renders the home shell without showing sample home content while API data is empty', () => {
    const fallback = getHomeViewModel();

    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    expect(screen.getAllByText('teameet').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain(fallback.viewerName);
    expect(screen.getAllByText('공지사항').length).toBeGreaterThan(0);
    expect(screen.getByText('새 공지사항이 없어요.')).toBeInTheDocument();

    for (const match of fallback.recommendedMatches) {
      expect(screen.queryByText(match.title)).not.toBeInTheDocument();
    }

    for (const notice of fallback.notices) {
      expect(screen.queryByText(notice.title)).not.toBeInTheDocument();
    }
  });
});
