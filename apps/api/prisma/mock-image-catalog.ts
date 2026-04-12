import type { SportType } from '@prisma/client';

const sportImages: Record<string, string[]> = {
  soccer: [
    '/mock/photoreal/soccer/soccer-01.jpg',
    '/mock/photoreal/soccer/soccer-02.jpg',
    '/mock/photoreal/soccer/soccer-03.jpg',
    '/mock/photoreal/soccer/soccer-04.jpg',
    '/mock/photoreal/soccer/soccer-05.jpg',
    '/mock/photoreal/soccer/soccer-06.jpg',
  ],
  futsal: [
    '/mock/photoreal/futsal/futsal-01.jpg',
    '/mock/photoreal/futsal/futsal-02.jpg',
    '/mock/photoreal/futsal/futsal-03.jpg',
    '/mock/photoreal/futsal/futsal-04.jpg',
    '/mock/photoreal/futsal/futsal-05.jpg',
    '/mock/photoreal/futsal/futsal-06.jpg',
    '/mock/photoreal/futsal/futsal-07.jpg',
    '/mock/photoreal/futsal/futsal-08.jpg',
    '/mock/photoreal/futsal/futsal-09.jpg',
    '/mock/photoreal/futsal/futsal-10.jpg',
  ],
  basketball: [
    '/mock/photoreal/basketball/basketball-01.jpg',
    '/mock/photoreal/basketball/basketball-02.jpg',
    '/mock/photoreal/basketball/basketball-03.jpg',
    '/mock/photoreal/basketball/basketball-04.jpg',
    '/mock/photoreal/basketball/basketball-05.jpg',
    '/mock/photoreal/basketball/basketball-06.jpg',
  ],
  badminton: [
    '/mock/photoreal/badminton/badminton-01.jpg',
    '/mock/photoreal/badminton/badminton-02.jpg',
    '/mock/photoreal/badminton/badminton-03.jpg',
    '/mock/photoreal/badminton/badminton-04.jpg',
    '/mock/photoreal/badminton/badminton-05.jpg',
  ],
  ice_hockey: [
    '/mock/photoreal/ice-hockey/ice-hockey-01.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-02.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-03.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-04.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-05.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-06.jpg',
  ],
  swimming: [
    '/mock/photoreal/swimming/swimming-01.jpg',
    '/mock/photoreal/swimming/swimming-02.jpg',
    '/mock/photoreal/swimming/swimming-03.jpg',
    '/mock/photoreal/swimming/swimming-04.jpg',
    '/mock/photoreal/swimming/swimming-05.jpg',
  ],
  tennis: [
    '/mock/photoreal/tennis/tennis-01.jpg',
    '/mock/photoreal/tennis/tennis-02.jpg',
  ],
  baseball: [
    '/mock/photoreal/baseball/baseball-01.jpg',
    '/mock/photoreal/baseball/baseball-02.jpg',
    '/mock/photoreal/baseball/baseball-03.jpg',
    '/mock/photoreal/baseball/baseball-04.jpg',
    '/mock/photoreal/baseball/baseball-05.jpg',
  ],
  volleyball: [
    '/mock/photoreal/volleyball/volleyball-01.jpg',
    '/mock/photoreal/volleyball/volleyball-02.jpg',
    '/mock/photoreal/volleyball/volleyball-03.jpg',
    '/mock/photoreal/volleyball/volleyball-04.jpg',
    '/mock/photoreal/volleyball/volleyball-05.jpg',
  ],
  figure_skating: [
    '/mock/photoreal/figure-skating/figure-skating-01.jpg',
    '/mock/photoreal/figure-skating/figure-skating-02.png',
    '/mock/photoreal/figure-skating/figure-skating-03.jpg',
  ],
  short_track: [
    '/mock/photoreal/short-track/short-track-01.jpg',
    '/mock/photoreal/short-track/short-track-03.jpg',
    '/mock/photoreal/short-track/short-track-04.jpg',
    '/mock/photoreal/short-track/short-track-05.jpg',
    '/mock/photoreal/short-track/short-track-06.jpg',
  ],
};

const teamFallbackImages = [
  '/mock/photoreal/team/team-01.jpg',
  '/mock/photoreal/team/team-02.jpg',
  '/mock/photoreal/team/team-03.jpg',
  '/mock/photoreal/team/team-04.jpg',
  '/mock/photoreal/team/team-05.jpg',
];

const venueFallbackImages = [
  '/mock/photoreal/venue/venue-01.jpg',
  '/mock/photoreal/venue/venue-02.jpg',
  '/mock/photoreal/venue/venue-03.webp',
];

const marketplaceImages = [
  '/mock/photoreal/marketplace/marketplace-01.jpg',
  '/mock/photoreal/marketplace/marketplace-02.jpg',
  '/mock/photoreal/marketplace/marketplace-03.jpg',
];

function hashKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function rotate<T>(items: T[], key: string): T[] {
  if (items.length <= 1) return items;
  const offset = hashKey(key) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function unique(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

export function isLocalMockAsset(url?: string | null) {
  return Boolean(url?.startsWith('/mock/'));
}

function getSportCatalog(sportType: string) {
  const normalized = sportImages[sportType] ? sportType : 'soccer';
  return sportImages[normalized] || sportImages.soccer;
}

function buildImageSet(primary: string[], fallback: string[], key: string, limit: number) {
  return unique([...rotate(primary, key), ...rotate(fallback, `${key}-fallback`)]).slice(0, limit);
}

export function getVenueSeedImages(sportTypes: Array<SportType | string>, key: string, limit = 4) {
  const primary = unique(sportTypes.flatMap((sportType) => getSportCatalog(String(sportType))));
  return buildImageSet(primary, venueFallbackImages, key, limit);
}

export function getMatchSeedImage(
  sportType: SportType | string,
  venueImages: string[],
  key: string,
) {
  const primary = unique([...venueImages, ...getSportCatalog(String(sportType))]);
  return buildImageSet(primary, venueFallbackImages, key, 4)[0];
}

export function getLessonSeedImages(
  sportType: SportType | string,
  venueImages: string[],
  key: string,
  limit = 4,
) {
  const primary = unique([...venueImages, ...getSportCatalog(String(sportType))]);
  return buildImageSet(primary, venueFallbackImages, key, limit);
}

export function getListingSeedImages(sportType: SportType | string, key: string, limit = 4) {
  const primary = unique([...marketplaceImages, ...getSportCatalog(String(sportType))]);
  return buildImageSet(primary, marketplaceImages, key, limit);
}

export function getTeamCoverSeedImage(sportType: SportType | string, key: string) {
  const primary = unique([...getSportCatalog(String(sportType)), ...teamFallbackImages]);
  return buildImageSet(primary, teamFallbackImages, key, 3)[0];
}

export function getTeamPhotoSeedImages(sportType: SportType | string, key: string, limit = 3) {
  const primary = unique([...getSportCatalog(String(sportType)), ...teamFallbackImages]);
  return buildImageSet(primary, teamFallbackImages, key, limit);
}
