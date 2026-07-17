import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publicAssetPath } from '@/lib/assets';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentCard } from './tournament-card';

function buildItem(overrides: Partial<V1TournamentListItem> = {}): V1TournamentListItem {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '2026 서울 풋살 오픈',
    status: 'open',
    format: 'knockout',
    registrationDeadlineAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 16,
    genderCategory: 'mixed',
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    confirmedCount: 0,
    pendingPaymentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as V1TournamentListItem;
}

describe('TournamentCard — 커버 이미지 fallback', () => {
  it('renders a sport-glyph SVG fallback (no <img>) when coverImageUrl is missing', () => {
    const { container } = render(<TournamentCard item={buildItem({ coverImageUrl: null })} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('still renders the real <img> when coverImageUrl is present (regression guard)', () => {
    const { container } = render(
      <TournamentCard item={buildItem({ coverImageUrl: '/uploads/cover-real.jpg' })} />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/cover-real.jpg'));
  });

  it('falls back to promoHomeImageUrl when coverImageUrl is missing but a promo photo exists', () => {
    const { container } = render(
      <TournamentCard
        item={buildItem({ coverImageUrl: null, promoHomeImageUrl: '/uploads/promo-home.jpg' })}
      />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/promo-home.jpg'));
  });

  it('prefers coverImageUrl over promoHomeImageUrl when both are present', () => {
    const { container } = render(
      <TournamentCard
        item={buildItem({
          coverImageUrl: '/uploads/cover-real.jpg',
          promoHomeImageUrl: '/uploads/promo-home.jpg',
        })}
      />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/cover-real.jpg'));
  });

  it('renders the sport-glyph fallback when neither coverImageUrl nor promoHomeImageUrl exist', () => {
    const { container } = render(
      <TournamentCard item={buildItem({ coverImageUrl: null, promoHomeImageUrl: null })} />,
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows the tournament gender category without guessing for legacy rows', () => {
    const { rerender } = render(
      <TournamentCard item={buildItem({ genderCategory: 'female' })} />,
    );

    expect(screen.getByLabelText('성별 카테고리: 여성부')).toBeInTheDocument();
    rerender(<TournamentCard item={buildItem({ genderCategory: null })} />);
    expect(screen.getByLabelText('성별 카테고리: 성별 구분 없음')).toBeInTheDocument();
  });
});
