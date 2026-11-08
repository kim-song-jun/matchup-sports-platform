import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentCampaignMedia } from './tournament-campaign-media';

function widths(img: HTMLImageElement) {
  return (img.getAttribute('srcset') ?? '').split(',').filter(Boolean)
    .map((entry) => Number(new URL(entry.trim().split(' ')[0], 'http://localhost').searchParams.get('w')));
}

describe('TournamentCampaignMedia sizes', () => {
  it('sizes 를 넘기면 그 폭에 맞는 후보를 고르게 한다', () => {
    const { container } = render(
      <TournamentCampaignMedia src="/uploads/2026/11/card.png" sportCode="futsal" alt="" sizes="(min-width: 1024px) 352px, 100vw" />,
    );
    const img = container.querySelector('img')!;

    expect(img.getAttribute('sizes')).toBe('(min-width: 1024px) 352px, 100vw');
    // sizes 가 없으면 srcset 이 1600 의 1x/2x(1920·3840) 둘뿐이라 모바일 카드도 4K 를 받는다.
    expect(widths(img)).toEqual(expect.arrayContaining([640, 828, 1200]));
  });

  it('sizes 를 빠뜨려도 콘텐츠 열 폭 기준이라 4K 하나만 받지 않는다', () => {
    const { container } = render(<TournamentCampaignMedia src="/uploads/2026/11/hero.png" sportCode="futsal" alt="" />);
    const img = container.querySelector('img')!;

    expect(img.getAttribute('sizes')).toBe('(min-width: 1024px) 1072px, (min-width: 768px) 600px, (min-width: 480px) 480px, 100vw');
    expect(Math.min(...widths(img))).toBeLessThanOrEqual(828);
  });

  it('외부 URL 은 최적화 서버가 받아 올 수 없어 원본 주소 그대로 그린다', () => {
    const { container } = render(<TournamentCampaignMedia src="https://cdn.example.com/hero.jpg" sportCode="futsal" alt="" />);
    const img = container.querySelector('img')!;

    expect(img.getAttribute('src')).toBe('https://cdn.example.com/hero.jpg');
    expect(img.getAttribute('srcset')).toBeNull();
  });

  it('사진이 없을 때의 종목 그래픽은 160px 안에서만 그려지므로 그 폭으로 받는다', () => {
    const { container } = render(<TournamentCampaignMedia src={null} sportCode="futsal" alt="" />);
    const img = container.querySelector('img')!;

    expect(img.getAttribute('sizes')).toBe('160px');
    // 160px 의 2x 에 맞는 256 후보가 있어야 640 원본(또는 그 2배)만 받지 않는다.
    expect(widths(img)).toContain(256);
  });
});
