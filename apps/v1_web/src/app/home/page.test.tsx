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

    expect(screen.getByText('teameet')).toBeInTheDocument();
    expect(screen.getByText('안녕하세요, 정민님')).toBeInTheDocument();
    expect(screen.getByText('오늘의 추천')).toBeInTheDocument();
    expect(screen.getByText('공지사항')).toBeInTheDocument();
  });
});
