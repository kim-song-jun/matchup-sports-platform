import { render } from '@testing-library/react';
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
    // publicAssetPath()를 거쳐 렌더링되므로 원본 문자열을 그대로 하드코딩하지 않고
    // 같은 함수로 기대값을 계산한다(NEXT_PUBLIC_BASE_PATH가 설정된 환경에서도 안전).
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/cover-real.jpg'));
  });
});
