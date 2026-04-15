import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import GuidePage from './page';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/landing/scroll-reveal', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/landing/landing-nav', () => ({
  LandingNav: () => <nav aria-label="메인 네비게이션" />,
}));

vi.mock('@/components/landing/landing-footer', () => ({
  LandingFooter: () => <footer>footer</footer>,
}));

describe('GuidePage', () => {
  it('shows above-the-fold CTA and quick links for the first-match path', () => {
    const { container } = render(<GuidePage />);

    expect(screen.getByRole('heading', { name: '이용 가이드', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '6단계 바로 보기' })).toHaveAttribute('href', '#guide-start');
    expect(screen.getByRole('link', { name: '바로 시작하기' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('heading', { name: '3분 안에 끝내는 핵심 체크' })).toBeInTheDocument();
    expect(screen.getByText('가입부터 첫 매치까지')).toBeInTheDocument();
    expect(screen.getByText('팀 매칭 흐름')).toBeInTheDocument();
    expect(screen.getByText('용병 / 장터 핵심')).toBeInTheDocument();
    expect(container.querySelector('#guide-start')).not.toBeNull();
  });
});
