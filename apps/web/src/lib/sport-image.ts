/**
 * Local mock image catalog used across cards and detail pages.
 * The selection is deterministic, so repeated lists still feel varied.
 */
const sportImages: Record<string, string[]> = {
  soccer: [
    '/mock/sports/soccer-sunrise.svg',
    '/mock/sports/soccer-midnight.svg',
  ],
  futsal: [
    '/mock/generated/futsal-rooftop.webp',
    '/mock/sports/futsal-rooftop.svg',
  ],
  basketball: [
    '/mock/generated/basketball-hardwood.webp',
    '/mock/sports/basketball-fastbreak.svg',
  ],
  badminton: [
    '/mock/generated/badminton-club.webp',
    '/mock/sports/badminton-service.svg',
  ],
  ice_hockey: [
    '/mock/generated/ice-hockey-arena.webp',
    '/mock/sports/ice-hockey-tunnel.svg',
  ],
  swimming: ['/mock/sports/swimming-lanes.svg'],
  tennis: ['/mock/sports/tennis-baseline.svg'],
  baseball: ['/mock/sports/baseball-diamond.svg'],
  volleyball: ['/mock/sports/volleyball-sand.svg'],
  figure_skating: ['/mock/sports/figure-skating-glide.svg'],
  short_track: ['/mock/sports/figure-skating-glide.svg'],
};

const teamFallbackImages = [
  '/mock/generated/team-huddle.webp',
  '/mock/generated/team-training.webp',
  '/mock/generic/team-huddle.svg',
  '/mock/generic/team-training.svg',
];

const venueFallbackImages = [
  '/mock/generated/venue-lights.webp',
  '/mock/generated/venue-clubhouse.webp',
  '/mock/generic/venue-lights.svg',
  '/mock/generic/venue-clubhouse.svg',
];

const marketplaceImages = [
  '/mock/generated/gear-flatlay.webp',
  '/mock/generated/shoes-display.webp',
  '/mock/generated/racket-stack.webp',
  '/mock/marketplace/gear-flatlay.svg',
  '/mock/marketplace/shoes-display.svg',
  '/mock/marketplace/racket-stack.svg',
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

function getSportCatalog(sportType: string) {
  return sportImages[sportType] || sportImages.soccer;
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

/** Returns a marketplace thumbnail, preferring uploaded images. */
export function getListingImage(imageUrls?: string[], key = ''): string {
  if (imageUrls && imageUrls.length > 0) return imageUrls[0];
  return pickFromCatalog(marketplaceImages, key || 'marketplace');
}

/** Returns a gallery for marketplace listings. */
export function getListingImageSet(imageUrls?: string[], key = '', limit = 3): string[] {
  if (imageUrls && imageUrls.length > 0) {
    return buildGallery(imageUrls, marketplaceImages, key || 'marketplace', limit);
  }
  return buildGallery(marketplaceImages, venueFallbackImages, key || 'marketplace', limit);
}

/** Returns a team cover image, preferring uploaded images. */
export function getTeamImage(sportType: string, coverImageUrl?: string | null, key = ''): string {
  if (coverImageUrl) return coverImageUrl;
  return buildGallery(getSportCatalog(sportType), teamFallbackImages, key || sportType, 1)[0];
}

/** Returns a small gallery for team detail pages. */
export function getTeamImageSet(sportType: string, photos?: string[], key = '', limit = 3): string[] {
  if (photos && photos.length > 0) {
    return buildGallery(photos, teamFallbackImages, key || sportType, limit);
  }
  return buildGallery(getSportCatalog(sportType), teamFallbackImages, key || sportType, limit);
}

/** Returns a small gallery for venue detail pages. */
export function getVenueImageSet(sportType: string, imageUrls?: string[], key = '', limit = 3): string[] {
  if (imageUrls && imageUrls.length > 0) {
    return buildGallery(imageUrls, venueFallbackImages, key || sportType, limit);
  }
  return buildGallery(getSportCatalog(sportType), venueFallbackImages, key || sportType, limit);
}
