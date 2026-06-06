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

    expect(screen.getAllByText('teameet').length).toBeGreaterThan(0);
    expect(screen.getByText('안녕하세요, 정민님')).toBeInTheDocument();
    expect(screen.getByText('오늘의 추천')).toBeInTheDocument();
    expect(screen.getByText('공지사항')).toBeInTheDocument();
    expect(screen.getByLabelText('데스크탑 주요 메뉴')).toHaveClass('tm-desktop-nav');
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toHaveClass('tm-bottom-nav');
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('link', { name: /채팅 \d+개 읽지 않음/ })).toHaveAttribute('href', '/chat');
  });
});
