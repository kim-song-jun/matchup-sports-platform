import type { V1PlaceView } from '@/types/api';

/** 두 장소가 같은 곳인가 — 카카오 장소 id 가 둘 다 있으면 id 로, 아니면 이름으로 비교한다. */
export function isSamePlace(a: V1PlaceView | null | undefined, b: V1PlaceView | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.providerPlaceId && b.providerPlaceId) {
    return a.provider === b.provider && a.providerPlaceId === b.providerPlaceId;
  }
  return a.name.trim() === b.name.trim();
}
