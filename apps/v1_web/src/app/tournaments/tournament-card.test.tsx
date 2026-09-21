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

describe('TournamentCard — 모집 상태와 하단 정보', () => {
  it.each([
    { status: 'open', confirmedCount: 14, pendingPaymentCount: 1, expected: '모집 중' },
    { status: 'open', confirmedCount: 11, pendingPaymentCount: 5, expected: '거의 마감' },
    { status: 'open', confirmedCount: 16, pendingPaymentCount: 0, expected: '거의 마감' },
    { status: 'open', confirmedCount: 19, pendingPaymentCount: 0, expected: '거의 마감' },
    { status: 'open', confirmedCount: 15, pendingPaymentCount: 5, expected: '모집 마감' },
    { status: 'closed', confirmedCount: 4, pendingPaymentCount: 0, expected: '모집 마감' },
    { status: 'in_progress', confirmedCount: 18, pendingPaymentCount: 0, expected: '진행 중' },
    { status: 'completed', confirmedCount: 20, pendingPaymentCount: 0, expected: '종료' },
    { status: 'cancelled', confirmedCount: 18, pendingPaymentCount: 0, expected: '취소' },
  ] as const)('$status · 확정 $confirmedCount + 대기 $pendingPaymentCount → $expected', ({ expected, ...values }) => {
    render(<TournamentCard item={buildItem({ ...values, teamCount: 20 })} />);
    expect(screen.getByRole('link')).toHaveAccessibleName(expect.stringContaining(`— ${expected}`));
    expect(screen.getAllByText(expected, { exact: true })).toHaveLength(1);
    if (expected !== '거의 마감') expect(screen.queryByText('거의 마감')).not.toBeInTheDocument();
  });

  it('입금 대기를 합산한 예약 수와 금액을 표시하고 막대는 하나만 유지한다', () => {
    render(<TournamentCard item={buildItem({ entryFee: 300000, confirmedCount: 11, pendingPaymentCount: 5, teamCount: 20 })} />);
    expect(screen.getByText('참가비', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('300,000원', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('16/20팀 예약', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('입금대기 5팀', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('대기 팀이 없으면 대기 안내 없이 확정 수만 보여준다', () => {
    render(<TournamentCard item={buildItem({ confirmedCount: 8, pendingPaymentCount: 0, teamCount: 20 })} />);
    expect(screen.getByText('8/20팀 확정', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/(?:입금|확인)대기/)).not.toBeInTheDocument();
  });

  it('무료 대회에는 입금대기 대신 확인대기를 표시한다', () => {
    render(<TournamentCard item={buildItem({ entryFee: 0, confirmedCount: 11, pendingPaymentCount: 5, teamCount: 20 })} />);
    expect(screen.getByText('무료', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('확인대기 5팀', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/입금대기/)).not.toBeInTheDocument();
  });
});
