/**
 * 랜딩은 landing-rhythm 모듈(키워드 → 타이틀 → 본문 → 그래픽)을 따른다(웨이브 1, 2026-09-04).
 * 히어로 그래픽이 빠지거나, 섹션 키워드가 사라지거나, 섹션 배경이 다시 교대로 바뀌면(강조 없음)
 * 여기서 잡는다.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import LandingPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe('LandingPage', () => {
  it('히어로에 landing-hero 그래픽 웰이 있고 stat 스트립은 그 아래에 놓인다', () => {
    const { container } = render(<LandingPage />);
    const img = queryImageBySrc(container, '/illustrations/landing-hero-640.webp');
    expect(img).not.toBeNull();
    expect(img!.closest('.tm-landing-hero-graphic')).not.toBeNull();
    const aside = container.querySelector('.tm-landing-hero-aside')!;
    const children = [...aside.children].map((el) => el.className);
    expect(children[0]).toBe('tm-landing-hero-graphic');
    expect(children[1]).toContain('tm-landing-hero-stats');
  });

  it('섹션 헤더마다 키워드가 앞서고, 교대 배경(section-alt)은 없다', () => {
    const { container } = render(<LandingPage />);
    const kws = [...container.querySelectorAll('.tm-landing-section-kw')].map((el) => el.textContent);
    expect(kws).toEqual(['기능', '종목', '이용 방법']);
    for (const kw of container.querySelectorAll('.tm-landing-section-kw')) {
      expect(kw.nextElementSibling?.tagName).toBe('H2');
    }
    expect(container.querySelector('.tm-landing-section-alt')).toBeNull();
  });
});
