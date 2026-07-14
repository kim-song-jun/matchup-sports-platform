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

  it('renders every enabled promo in priority order with carousel controls', () => {
    render(
      <TournamentPromoCarousel
        items={[
          promo('second', 10),
          promo('hidden', 100, false),
          promo('first', 20),
          promo('third', 1),
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
});
