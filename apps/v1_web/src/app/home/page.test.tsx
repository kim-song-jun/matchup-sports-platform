import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '../providers';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));

describe('HomePage', () => {
  it('renders the componentized first-design home shell', () => {
    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    // 'teameet' appears in both the mobile topbar and the desktop nav brand link —
    // use getAllByText and assert at least one match is in the document.
    expect(screen.getAllByText('teameet').length).toBeGreaterThan(0);
    expect(screen.getByText('안녕하세요, 정민님')).toBeInTheDocument();
    expect(screen.getByText('오늘의 추천')).toBeInTheDocument();
    expect(screen.getByText('공지사항')).toBeInTheDocument();
  });
});
