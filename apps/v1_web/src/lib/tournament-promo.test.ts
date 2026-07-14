import { describe, expect, it } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { getSortedTournamentPromos } from './tournament-promo';

function tournament(
  id: string,
  overrides: Partial<V1TournamentListItem> = {},
): V1TournamentListItem {
  return {
    id,
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: id,
    status: 'open',
    format: 'group_knockout',
    registrationDeadlineAt: null,
    scheduledAt: '2026-08-01T09:00:00.000Z',
    scheduledEndAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 8,
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
