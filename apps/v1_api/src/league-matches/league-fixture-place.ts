import { resolvePlaceSnapshot, type PlaceSnapshot } from '../places/place-snapshot';
import { TOURNAMENT_VENUE_SELECT, tournamentVenueSnapshot } from '../places/tournament-venue';
import { findTournamentOnSurface, LEAGUE_KINDS, type TournamentSurfaceClient } from '../tournaments/tournament-surface-lookup';

export const DEFAULT_FIXTURE_PLACE_NAME = '장소 미정';

/** 요청 DTO 가 싣는 장소 입력(`LeaguePlaceSnapshotDto` + `placeName`). */
export interface LeagueFixturePlaceInput {
  placeName?: string | null;
  placeAddress?: string | null;
  placeLatitude?: number | null;
  placeLongitude?: number | null;
  placeProvider?: string | null;
  placeProviderId?: string | null;
}

export function leaguePlaceFromInput(input: LeagueFixturePlaceInput): PlaceSnapshot | null {
  return resolvePlaceSnapshot({
    name: input.placeName,
    address: input.placeAddress,
    latitude: input.placeLatitude,
    longitude: input.placeLongitude,
    provider: input.placeProvider,
    providerPlaceId: input.placeProviderId,
  });
}

/**
 * 새 경기의 장소: 요청에 장소 이름이 있으면 그 스냅샷, 비면 리그의 기본 장소(대회 `venue`) 스냅샷,
 * 기본 장소도 없으면 '장소 미정'(좌표 없음).
 */
export async function resolveLeagueFixturePlace(
  db: TournamentSurfaceClient,
  leagueId: string,
  input: LeagueFixturePlaceInput,
): Promise<PlaceSnapshot> {
  const own = leaguePlaceFromInput(input);
  if (own !== null) return own;
  const league = await findTournamentOnSurface(db, LEAGUE_KINDS, {
    where: { id: leagueId },
    select: TOURNAMENT_VENUE_SELECT,
  });
  const inherited = league === null ? null : tournamentVenueSnapshot(league);
  return (
    inherited ?? {
      name: DEFAULT_FIXTURE_PLACE_NAME,
      address: null,
      latitude: null,
      longitude: null,
      provider: null,
      providerPlaceId: null,
    }
  );
}
