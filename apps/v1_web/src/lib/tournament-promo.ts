import type { V1TournamentListItem } from '@/types/api';

export type TournamentPromoSurface = 'home' | 'list';

/** 목록 썸네일(cover), 상세(detail), 홈/목록 홍보 카드의 이미지 자리. */
export type TournamentImageSlot = 'cover' | 'detail' | 'home' | 'list';

export type TournamentImageSource = {
  coverImageUrl?: string | null;
  listImageUrl?: string | null;
  showDetailImage?: boolean;
  promoHomeImageUrl?: string | null;
  promoListImageUrl?: string | null;
};

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 기본 목록은 목록→상세 사진을 공유하고, 상세는 상세→목록 사진을 공유한다.
 * 홈/목록 홍보 카드의 기존 전용 이미지는 우선 보존하며 없으면 기본 사진을 사용한다.
 * 상세 숨김은 목록·홍보 사진을 삭제하거나 가리지 않는다.
 *
 * 폴백을 DB 에 복사해 두지 않고 읽는 시점에 고르는 이유는, 커버만 교체해도 비워 둔
 * 자리가 함께 따라오게 하고 "기본 이미지 사용"과 "개별 지정"을 계속 구분하기 위해서다.
 */
export function resolveTournamentImage(
  source: TournamentImageSource,
  slot: TournamentImageSlot,
): string | null {
  const cover = trimmedOrNull(source.coverImageUrl);
  const listImage = trimmedOrNull(source.listImageUrl);
  const home = trimmedOrNull(source.promoHomeImageUrl);
  const list = trimmedOrNull(source.promoListImageUrl);

  // 상세는 홍보 전용 이미지로 대체하지 않는다. 기본 종목 그래픽은 미디어 컴포넌트가 맡는다.
  if (slot === 'detail') return source.showDetailImage === false ? null : cover ?? listImage;
  if (slot === 'cover') return listImage ?? cover ?? home ?? list;
  if (slot === 'home') return home ?? listImage ?? cover ?? list;
  return list ?? listImage ?? cover ?? home;
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
