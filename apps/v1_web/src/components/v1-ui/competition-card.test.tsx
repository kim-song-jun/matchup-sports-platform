import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompetitionThumbnail } from './competition-card';

/** `srcset` 의 후보를 { 원본 경로, 폭 } 으로 푼다. */
function candidates(img: HTMLImageElement) {
  return (img.getAttribute('srcset') ?? '').split(',').filter(Boolean).map((entry) => {
    const url = new URL(entry.trim().split(' ')[0], 'http://localhost');
    return { pathname: url.pathname, url: url.searchParams.get('url'), w: Number(url.searchParams.get('w')) };
  });
}

describe('CompetitionThumbnail 이미지 요청', () => {
  it('업로드한 커버를 원본이 아니라 56px 칸에 맞는 최적화 후보로 받는다', () => {
    const { container } = render(<CompetitionThumbnail sportCode="futsal" imageUrl="/uploads/2026/11/cover.png" />);
    const img = container.querySelector('img')!;

    // 원본(unoptimized)이면 src 가 /uploads/… 그대로이고 srcset 이 비어 있다.
    expect(img.getAttribute('src')).toMatch(/^\/_next\/image\?/);
    expect(img.getAttribute('sizes')).toBe('56px');
    const widths = candidates(img);
    expect(widths.every((c) => c.pathname === '/_next/image' && c.url === '/uploads/2026/11/cover.png')).toBe(true);
    // 56px 칸의 1x(64)·2x(128)·3x(256) 후보가 있어 브라우저가 화면 밀도에 맞는 것을 고른다.
    expect(widths.map((c) => c.w)).toEqual(expect.arrayContaining([64, 128, 256]));
  });

  it('최적화 서버가 받아 올 수 없는 외부 주소는 원본 그대로 그린다', () => {
    const { container } = render(<CompetitionThumbnail sportCode="futsal" imageUrl="https://cdn.example.com/cover.png" />);
    const img = container.querySelector('img')!;

    expect(img.getAttribute('src')).toBe('https://cdn.example.com/cover.png');
    expect(img.getAttribute('srcset')).toBeNull();
  });

  it('이미지가 없으면 종목 그라디언트와 글리프를 그린다', () => {
    const { container } = render(<CompetitionThumbnail sportCode="futsal" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
