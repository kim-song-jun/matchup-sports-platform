import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentPromoCarousel } from './tournament-promo-carousel';

function promo(id: string, priority: number, enabled = true): V1TournamentListItem {
  return {
    id,
    title: id,
    status: 'open',
    scheduledAt: '2026-08-01T09:00:00.000Z',
    promoListEnabled: enabled,
    promoListPriority: priority,
    promoListTitle: `홍보 ${id}`,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
  } as V1TournamentListItem;
}

describe('TournamentPromoCarousel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders every enabled promo with priority 0 first and carousel controls', () => {
    render(
      <TournamentPromoCarousel
        items={[
          promo('second', 1),
          promo('hidden', 100, false),
          promo('first', 0),
          promo('third', 2),
        ]}
      />,
    );

    expect(screen.getByRole('region', { name: '추천 대회' })).toHaveAttribute('aria-roledescription', 'carousel');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('홍보 first'),
      expect.stringContaining('홍보 second'),
      expect.stringContaining('홍보 third'),
    ]);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    const dots = screen.getAllByRole('button', { name: /번째 추천 대회 보기/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('button', { name: '이전 추천 대회' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 추천 대회' })).not.toBeInTheDocument();

    fireEvent.click(dots[1]);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(dots[0]).not.toHaveAttribute('aria-current');
    expect(dots[1]).toHaveAttribute('aria-current', 'true');
  });

  it('advances to the next promo every 5 seconds and loops to the first', () => {
    vi.useFakeTimers();
    render(<TournamentPromoCarousel items={[promo('first', 30), promo('second', 20)]} />);

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('shows a retry action instead of hiding an API failure', () => {
    render(<TournamentPromoCarousel items={[]} error onRetry={() => undefined} />);

    expect(screen.getByRole('alert')).toHaveTextContent('추천 대회를 불러오지 못했어요.');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
  });

  /* WCAG 2.2.2(Pause, Stop, Hide) — 5초 자동 전환에 정지 수단이 없던 결함.
     마우스 hover 만으로 멈출 수 있어야 한다(포커스 없이도). */
  it('마우스가 캐러셀 위에 있는 동안은 자동 전환을 멈춘다', () => {
    vi.useFakeTimers();
    render(<TournamentPromoCarousel items={[promo('first', 30), promo('second', 20)]} />);

    const body = screen.getByText('1 / 2').closest('.tm-tournament-promo-carousel-body') as HTMLElement;
    fireEvent.mouseEnter(body);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.mouseLeave(body);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('명시적 정지 토글 버튼을 누르면 마우스를 치워도 자동 전환이 멈춘 채로 유지된다', () => {
    vi.useFakeTimers();
    render(<TournamentPromoCarousel items={[promo('first', 30), promo('second', 20)]} />);

    const pauseButton = screen.getByRole('button', { name: '자동 전환 멈추기' });
    fireEvent.click(pauseButton);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    const resumeButton = screen.getByRole('button', { name: '자동 전환 다시 시작' });
    expect(resumeButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(resumeButton);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('캐러셀 밖에 있을 때는 aria-live를 꺼서 스크린리더가 다른 콘텐츠를 읽는 걸 방해하지 않는다', () => {
    render(<TournamentPromoCarousel items={[promo('first', 30), promo('second', 20)]} />);
    const liveRegion = screen.getByText('1 / 2');
    expect(liveRegion).toHaveAttribute('aria-live', 'off');

    const body = liveRegion.closest('.tm-tournament-promo-carousel-body') as HTMLElement;
    fireEvent.mouseEnter(body);
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('links a promoted tournament to its published campaign when a campaign slug exists', () => {
    render(
      <TournamentPromoCarousel
        items={[
          { ...promo('campaign-tournament', 0), campaignSlug: 'summer-futsal-cup' },
          promo('detail-tournament', 1),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: '홍보 campaign-tournament 자세히 보기' })).toHaveAttribute(
      'href',
      '/tournaments/campaigns/summer-futsal-cup',
    );
    expect(screen.getByRole('link', { name: '홍보 detail-tournament 자세히 보기' })).toHaveAttribute(
      'href',
      '/tournaments/detail-tournament',
    );
  });
});

/**
 * 슬라이드 배경은 `background: url(…) center/cover` 단축 속성이라 jsdom 이 파싱하지 못하고 버린다.
 * 서버 렌더 마크업의 `style` 속성에는 컴포넌트가 낸 값이 그대로 남으므로 그쪽에서 읽는다.
 */
function slideBackgrounds(items: V1TournamentListItem[]) {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(<TournamentPromoCarousel items={items} />), 'text/html');
  return [...doc.querySelectorAll('.tm-tournament-promo-card')].map((card) => card.getAttribute('style') ?? '');
}

function imageRequest(background: string) {
  const quoted = /url\("([^"]+)"\)/.exec(background);
  if (!quoted) return null;
  const url = new URL(quoted[1], 'http://localhost');
  return { pathname: url.pathname, url: url.searchParams.get('url') ?? quoted[1], w: url.searchParams.get('w') };
}

describe('TournamentPromoCarousel 홍보 이미지', () => {
  it('업로드한 홍보 이미지는 원본이 아니라 1920 폭 최적화 주소로 받는다', () => {
    const [background] = slideBackgrounds([{ ...promo('with-photo', 0), promoListImageUrl: '/uploads/2026/11/banner.png' }]);

    expect(background).toContain('center/cover');
    expect(imageRequest(background)).toEqual({ pathname: '/_next/image', url: '/uploads/2026/11/banner.png', w: '1920' });
  });

  it('최적화 서버가 받아 올 수 없는 외부 주소는 원본 그대로 둔다', () => {
    const [background] = slideBackgrounds([{ ...promo('external', 0), promoListImageUrl: 'https://cdn.example.com/banner.png' }]);

    expect(imageRequest(background)).toEqual({ pathname: '/banner.png', url: 'https://cdn.example.com/banner.png', w: null });
  });

  it('이미지가 없으면 브랜드 그라디언트를 쓴다', () => {
    const [background] = slideBackgrounds([promo('no-photo', 0)]);

    expect(imageRequest(background)).toBeNull();
    expect(background).toContain('var(--brand-hero-gradient)');
  });
});
