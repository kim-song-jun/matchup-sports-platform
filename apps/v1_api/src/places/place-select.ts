/** Prisma `select` 로 `toPlaceView()` 가 읽는 칸을 한 번에 고른다. */
export const PLACE_SELECT = {
  placeName: true,
  placeAddress: true,
  placeLatitude: true,
  placeLongitude: true,
  placeProvider: true,
  placeProviderId: true,
} as const;
