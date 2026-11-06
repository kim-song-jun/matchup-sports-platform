import { describe, expect, it } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { getSortedTournamentPromos, resolveTournamentImage } from './tournament-promo';

function tournament(
  id: string,
  overrides: Partial<V1TournamentListItem> = {},
): V1TournamentListItem {
  return {
    id,
    entryFeeConfigured: true,
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: id,
    status: 'open',
    format: 'group_knockout',
    kind: 'regular_tournament',
    registrationDeadlineAt: null,
    scheduledAt: '2026-08-01T09:00:00.000Z',
    scheduledEndAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 8,
    genderCategory: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: true,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: true,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    confirmedCount: 0,
    pendingPaymentCount: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getSortedTournamentPromos', () => {
  it('returns every enabled open home promo with priority 0 first, then creation order', () => {
    const items = [
      tournament('later-priority', { promoHomePriority: 1 }),
      tournament('disabled', { promoHomePriority: 100, promoHomeEnabled: false }),
      tournament('closed', { promoHomePriority: 100, status: 'closed' }),
      tournament('first-created-later', { promoHomePriority: 0, createdAt: '2026-07-02T09:00:00.000Z' }),
      tournament('first-created-first', { promoHomePriority: 0, createdAt: '2026-07-01T09:00:00.000Z' }),
    ];

    expect(getSortedTournamentPromos(items, 'home').map((item) => item.id)).toEqual([
      'first-created-first',
      'first-created-later',
      'later-priority',
    ]);
  });

  it('uses list-specific enablement and priority', () => {
    const items = [
      tournament('home-only', { promoHomePriority: 100, promoListEnabled: false }),
      tournament('list-first', { promoListPriority: 0 }),
      tournament('list-second', { promoListPriority: 1 }),
    ];

    expect(getSortedTournamentPromos(items, 'list').map((item) => item.id)).toEqual([
      'list-first',
      'list-second',
    ]);
  });
});

describe('resolveTournamentImage', () => {
  it('커버만 올려도 홈·목록 홍보 카드가 함께 채워진다', () => {
    const source = {
      coverImageUrl: '/uploads/cover.webp',
      promoHomeImageUrl: null,
      promoListImageUrl: null,
    };

    expect(resolveTournamentImage(source, 'cover')).toBe('/uploads/cover.webp');
    expect(resolveTournamentImage(source, 'home')).toBe('/uploads/cover.webp');
    expect(resolveTournamentImage(source, 'list')).toBe('/uploads/cover.webp');
  });

  it('자리마다 지정한 이미지는 커버 폴백보다 우선한다', () => {
    const source = {
      coverImageUrl: '/uploads/cover.webp',
      promoHomeImageUrl: '/uploads/home.webp',
      promoListImageUrl: '/uploads/list.webp',
    };

    expect(resolveTournamentImage(source, 'home')).toBe('/uploads/home.webp');
    expect(resolveTournamentImage(source, 'list')).toBe('/uploads/list.webp');
  });

  it('커버가 없으면 다른 홍보 자리의 이미지로 폴백한다', () => {
    const source = {
      coverImageUrl: null,
      promoHomeImageUrl: '/uploads/home.webp',
      promoListImageUrl: null,
    };

    expect(resolveTournamentImage(source, 'cover')).toBe('/uploads/home.webp');
    expect(resolveTournamentImage(source, 'list')).toBe('/uploads/home.webp');
  });

  it('공백만 있는 값은 이미지가 없는 것으로 본다', () => {
    const source = {
      coverImageUrl: '   ',
      promoHomeImageUrl: '',
      promoListImageUrl: '/uploads/list.webp',
    };

    expect(resolveTournamentImage(source, 'home')).toBe('/uploads/list.webp');
    expect(
      resolveTournamentImage(
        { coverImageUrl: '  ', promoHomeImageUrl: null, promoListImageUrl: undefined },
        'home',
      ),
    ).toBeNull();
  });
});


describe('대회 목록·상세 2장', () => {
  const images = { coverImageUrl: '/uploads/detail.webp', listImageUrl: '/uploads/list.webp' };
  it('각 화면의 사진을 우선하고 하나만 있으면 공유한다', () => {
    expect(resolveTournamentImage(images, 'cover')).toBe(images.listImageUrl);
    expect(resolveTournamentImage(images, 'detail')).toBe(images.coverImageUrl);
    expect(resolveTournamentImage({ ...images, coverImageUrl: null }, 'detail')).toBe(images.listImageUrl);
    expect(resolveTournamentImage({ ...images, listImageUrl: null }, 'cover')).toBe(images.coverImageUrl);
  });
  it('상세 숨김은 목록 사진에 영향을 주지 않으며 홍보 이미지를 상세로 대체하지 않는다', () => {
    expect(resolveTournamentImage({ ...images, showDetailImage: false }, 'detail')).toBeNull();
    expect(resolveTournamentImage({ ...images, showDetailImage: false }, 'cover')).toBe(images.listImageUrl);
    expect(resolveTournamentImage({ promoHomeImageUrl: '/uploads/promo.webp' }, 'detail')).toBeNull();
  });
});
