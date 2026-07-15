import type { V1TournamentListItem } from '@/types/api';

export type TournamentPromoSurface = 'home' | 'list';

export function getSortedTournamentPromos(
  items: V1TournamentListItem[],
  surface: TournamentPromoSurface,
): V1TournamentListItem[] {
  const enabledKey = surface === 'home' ? 'promoHomeEnabled' : 'promoListEnabled';
  const priorityKey = surface === 'home' ? 'promoHomePriority' : 'promoListPriority';

  return items
    .filter((item) => item.status === 'open' && item[enabledKey])
    .slice()
    .sort((a, b) => {
      const priorityDifference = b[priorityKey] - a[priorityKey];
      if (priorityDifference !== 0) return priorityDifference;

      const createdAtDifference = a.createdAt.localeCompare(b.createdAt);
      if (createdAtDifference !== 0) return createdAtDifference;

      return a.id.localeCompare(b.id);
    });
}
