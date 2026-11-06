import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingV4Parallax } from './landing-v4-now-fx';

function renderedSrc(src: string, illustration: boolean) {
  const { container } = render(<LandingV4Parallax src={src} illustration={illustration} />);
  return container.querySelector('img')?.getAttribute('src') ?? '';
}

describe('LandingV4Parallax 이미지 경로', () => {
  it('업로드한 대회 사진도 원본이 아니라 최적화기를 거쳐 받는다', () => {
    const src = new URL(renderedSrc('/uploads/2026/11/tournament.webp', false), 'http://localhost');
    expect(src.pathname).toBe('/_next/image');
    expect(src.searchParams.get('url')).toBe('/uploads/2026/11/tournament.webp');
  });

  it('최적화기가 받아 올 수 없는 외부 사진 URL 은 그대로 둔다', () => {
    expect(renderedSrc('https://images.example.com/t.webp', false)).toBe('https://images.example.com/t.webp');
  });

  it('번들 일러스트도 최적화기를 거친다', () => {
    const src = new URL(renderedSrc('/illustrations/landing-hero-640.webp', true), 'http://localhost');
    expect(src.pathname).toBe('/_next/image');
  });
});
