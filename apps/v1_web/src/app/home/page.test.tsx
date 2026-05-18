import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));

describe('HomePage', () => {
  it('renders the v1 product home shell', () => {
    render(<HomePage />);

    expect(screen.getByText('03 홈 · 1차 디자인 완료')).toBeInTheDocument();
    expect(screen.getByText('teameet')).toBeInTheDocument();
  });
});
