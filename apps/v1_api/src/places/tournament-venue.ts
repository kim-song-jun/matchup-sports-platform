import type { PlaceProvider, PlaceSnapshot } from './place-snapshot';

export const TOURNAMENT_VENUE_SELECT = {
  venue: true,
  venueAddress: true,
  latitude: true,
  longitude: true,
  venueProvider: true,
  venueProviderId: true,
} as const;

export interface TournamentVenueRow {
  venue: string | null;
  venueAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  venueProvider: string | null;
  venueProviderId: string | null;
}

/**
 * 대회(리그)의 기본 장소를 경기용 스냅샷으로 옮긴다. 출처 없이 좌표만 있는 옛 행(서버 추측 지오코딩 시절)은
 * 핀을 버리고 이름·주소만 가져간다 — `resolvePlaceSnapshot` 의 "넷 다 있거나 넷 다 없다" 규칙을 지키기 위해서다.
 */
export function tournamentVenueSnapshot(row: TournamentVenueRow): PlaceSnapshot | null {
  const name = row.venue?.trim();
  if (!name) return null;
  const pinned =
    row.venueProvider === 'kakao' && row.venueProviderId !== null && row.latitude !== null && row.longitude !== null;
  return {
    name,
    address: row.venueAddress,
    latitude: pinned ? row.latitude : null,
    longitude: pinned ? row.longitude : null,
    provider: pinned ? (row.venueProvider as PlaceProvider) : null,
    providerPlaceId: pinned ? row.venueProviderId : null,
  };
}
