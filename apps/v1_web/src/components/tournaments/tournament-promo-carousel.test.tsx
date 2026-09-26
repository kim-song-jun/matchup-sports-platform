import { act, fireEvent, render, screen } from '@testing-library/react';
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
