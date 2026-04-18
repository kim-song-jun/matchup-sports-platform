import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import AboutPage from './page';

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
  ScrollReveal: ({ children }: { children: ReactNode }) => (
    <div data-testid="scroll-reveal">{children}</div>
  ),
}));

vi.mock('@/components/landing/landing-nav', () => ({
  LandingNav: () => <nav aria-label="메인 네비게이션" />,
}));

vi.mock('@/components/landing/landing-footer', () => ({
  LandingFooter: () => <footer>footer</footer>,
}));

describe('AboutPage', () => {
  it('shows immediate hero CTAs and next-step summaries above the fold', () => {
    render(<AboutPage />);

    const heroHeading = screen.getByRole('heading', {
      name: 'Teameet을 만든 이유, 그리고 바로 할 수 있는 일',
      level: 1,
    });
    const heroSection = heroHeading.closest('section');

    expect(heroHeading).toBeInTheDocument();
    expect(heroSection).not.toBeNull();

    const hero = within(heroSection as HTMLElement);

    expect(hero.getByRole('link', { name: '지금 시작하기' })).toHaveAttribute('href', '/login');
    expect(hero.getByRole('link', { name: '이용 가이드 보기' })).toHaveAttribute('href', '/guide');
    expect(hero.getByText('실력 맞는 상대 연결')).toBeInTheDocument();
    expect(hero.getByText('노쇼를 줄이는 신뢰 구조')).toBeInTheDocument();
    expect(
      hero.getByText(/먼저 이용 흐름을 확인하고 싶다면 가이드를 보고, 준비가 됐다면 바로 매칭을/)
    ).toBeInTheDocument();
  });

  it('keeps hero heading and summary outside ScrollReveal wrappers', () => {
    render(<AboutPage />);

    const heroHeading = screen.getByRole('heading', {
      name: 'Teameet을 만든 이유, 그리고 바로 할 수 있는 일',
      level: 1,
    });
    const heroSummary = screen.getByText(
      '주말 아침, 풋살화 끈을 묶는 설렘이 상대를 못 찾아 실망으로 바뀌는 순간이 반복됐습니다. Teameet은 그 시간을 줄이고, 비슷한 수준의 사람끼리 더 쉽게 경기를 성사시키기 위해 시작했습니다.'
    );

    expect(heroHeading.closest('[data-testid="scroll-reveal"]')).toBeNull();
    expect(heroSummary.closest('[data-testid="scroll-reveal"]')).toBeNull();
  });
});
