import type { V1TournamentListItem } from '@/types/api';

export type TournamentPromoSurface = 'home' | 'list';

/** 대회가 가진 이미지 자리 — 커버(대표) + 홈/목록 홍보 카드. */
export type TournamentImageSlot = 'cover' | 'home' | 'list';

export type TournamentImageSource = {
  coverImageUrl?: string | null;
  promoHomeImageUrl?: string | null;
  promoListImageUrl?: string | null;
};

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 한 자리에 쓸 이미지를 고른다. 같은 대회 이미지를 세 번 올리게 하지 않으려고,
 * 비어 있는 자리는 커버(기본 이미지)로, 커버도 없으면 다른 홍보 자리로 폴백한다.
 * 개별 지정 값은 언제나 폴백보다 우선하므로 자리마다 다른 이미지도 쓸 수 있다.
 *
 * 폴백을 DB 에 복사해 두지 않고 읽는 시점에 고르는 이유는, 커버만 교체해도 비워 둔
 * 자리가 함께 따라오게 하고 "기본 이미지 사용"과 "개별 지정"을 계속 구분하기 위해서다.
 */
export function resolveTournamentImage(
  source: TournamentImageSource,
  slot: TournamentImageSlot,
): string | null {
  const cover = trimmedOrNull(source.coverImageUrl);
  const home = trimmedOrNull(source.promoHomeImageUrl);
  const list = trimmedOrNull(source.promoListImageUrl);

  if (slot === 'cover') return cover ?? home ?? list;
  if (slot === 'home') return home ?? cover ?? list;
  return list ?? cover ?? home;
}

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
      const priorityDifference = a[priorityKey] - b[priorityKey];
      if (priorityDifference !== 0) return priorityDifference;

      const createdAtDifference = a.createdAt.localeCompare(b.createdAt);
      if (createdAtDifference !== 0) return createdAtDifference;

      return a.id.localeCompare(b.id);
    });
}
