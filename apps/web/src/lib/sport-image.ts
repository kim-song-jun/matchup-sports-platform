/**
 * Local mock image catalog used across cards and detail pages.
 * The selection is deterministic, so repeated lists still feel varied.
 */
import { getGeneratedTeamLogo } from './mock-visual-factory';

const staticSportImages: Record<string, string[]> = {
  soccer: [
    '/mock/photoreal/soccer/soccer-01.jpg',
    '/mock/photoreal/soccer/soccer-02.jpg',
    '/mock/photoreal/soccer/soccer-03.jpg',
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
  ],
  badminton: [
    '/mock/photoreal/badminton/badminton-01.jpg',
    '/mock/photoreal/badminton/badminton-02.jpg',
  ],
  ice_hockey: [
    '/mock/photoreal/ice-hockey/ice-hockey-01.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-02.jpg',
    '/mock/photoreal/ice-hockey/ice-hockey-03.jpg',
  ],
  swimming: [
    '/mock/photoreal/swimming/swimming-01.jpg',
    '/mock/photoreal/swimming/swimming-02.jpg',
  ],
  tennis: [
    '/mock/photoreal/tennis/tennis-01.jpg',
    '/mock/photoreal/tennis/tennis-02.jpg',
  ],
  baseball: [
    '/mock/photoreal/baseball/baseball-01.jpg',
    '/mock/photoreal/baseball/baseball-02.jpg',
  ],
  volleyball: [
    '/mock/photoreal/volleyball/volleyball-01.jpg',
    '/mock/photoreal/volleyball/volleyball-02.jpg',
  ],
  figure_skating: ['/mock/photoreal/figure-skating/figure-skating-01.jpg'],
  short_track: [
    '/mock/photoreal/short-track/short-track-01.jpg',
    '/mock/photoreal/short-track/short-track-03.jpg',
  ],
};

const teamFallbackImages = [
  '/mock/photoreal/team/team-01.jpg',
  '/mock/photoreal/team/team-02.jpg',
  '/mock/photoreal/team/team-03.jpg',
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

function unique(items: string[]) {
  return Array.from(new Set(items));
}

function compactUrls(items?: Array<string | null | undefined>) {
  return unique((items ?? []).filter((item): item is string => Boolean(item)));
}

function getSportCatalog(sportType: string) {
  const normalized = staticSportImages[sportType] ? sportType : 'soccer';
  return staticSportImages[normalized] || staticSportImages.soccer;
}

function pickFromCatalog(items: string[], key: string) {
  return rotate(items, key)[0];
}

function buildGallery(primary: string[], fallback: string[], key: string, limit: number) {
  const ordered = unique([
    ...rotate(primary, key),
    ...rotate(fallback, `${key}-fallback`),
  ]);
  return ordered.slice(0, limit);
}

/** Returns a deterministic sport image, unless a custom image is provided. */
export function getSportImage(sportType: string, imageUrl?: string | null, key = ''): string {
  if (imageUrl) return imageUrl;
  const catalog = getSportCatalog(sportType);
  return pickFromCatalog(catalog, key || sportType);
}

/** Returns a small gallery for sport-driven detail views. */
export function getSportImageSet(sportType: string, key = '', limit = 3): string[] {
  return buildGallery(getSportCatalog(sportType), venueFallbackImages, key || sportType, limit);
}

/** Returns a sport gallery that can blend uploaded media with local photoreal fallbacks. */
export function getSportDetailImageSet(
  sportType: string,
  imageUrls?: Array<string | null | undefined>,
  key = '',
  limit = 3,
): string[] {
  const photos = compactUrls(imageUrls);
  if (photos.length > 0) {
    return buildGallery(photos, getSportCatalog(sportType), key || sportType, limit);
  }
  return getSportImageSet(sportType, key, limit);
}

/** Returns a marketplace thumbnail, preferring uploaded images. */
export function getListingImage(imageUrls?: string[], key = ''): string {
  const photos = compactUrls(imageUrls);
  if (photos.length > 0) return photos[0];
  return pickFromCatalog(marketplaceImages, key || 'marketplace');
}

/** Returns a gallery for marketplace listings. */
export function getListingImageSet(imageUrls?: string[], key = '', limit = 3): string[] {
  const photos = compactUrls(imageUrls);
  if (photos.length > 0) {
    return buildGallery(photos, marketplaceImages, key || 'marketplace', limit);
  }
  return buildGallery(marketplaceImages, venueFallbackImages, key || 'marketplace', limit);
}

/** Returns sample marketplace images for empty-state and creation flows. */
export function getListingPreviewImages(key = 'marketplace-preview', limit = 3): string[] {
  return buildGallery(marketplaceImages, teamFallbackImages, key, limit);
}

/** Returns a team cover image, preferring uploaded images. */
export function getTeamImage(sportType: string, coverImageUrl?: string | null, key = ''): string {
  if (coverImageUrl) return coverImageUrl;
  return buildGallery(getSportCatalog(sportType), teamFallbackImages, key || sportType, 1)[0];
}

/** Returns a small gallery for team detail pages. */
export function getTeamImageSet(sportType: string, photos?: string[], key = '', limit = 3): string[] {
  const uploadedPhotos = compactUrls(photos);
  if (uploadedPhotos.length > 0) {
    return buildGallery(uploadedPhotos, teamFallbackImages, key || sportType, limit);
  }
  return buildGallery(getSportCatalog(sportType), teamFallbackImages, key || sportType, limit);
}

/** Returns a team logo, preferring the uploaded logo when available. */
export function getTeamLogo(teamName: string, sportType: string, logoUrl?: string | null, key = ''): string {
  if (logoUrl) return logoUrl;
  return getGeneratedTeamLogo(teamName, sportType, key || teamName || sportType);
}

/** Returns a small gallery for venue detail pages. */
export function getVenueImageSet(sportType: string, imageUrls?: string[], key = '', limit = 3): string[] {
  const photos = compactUrls(imageUrls);
  if (photos.length > 0) {
    return buildGallery(photos, venueFallbackImages, key || sportType, limit);
  }
  return buildGallery(getSportCatalog(sportType), venueFallbackImages, key || sportType, limit);
}
