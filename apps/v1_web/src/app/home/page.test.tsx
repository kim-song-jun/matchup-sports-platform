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
    // '공지사항' appears in both the home notices section and the desktop footer link —
    // assert at least one match (mirrors the 'teameet' getAllByText pattern above).
    expect(screen.getAllByText('공지사항').length).toBeGreaterThan(0);
  });
});
