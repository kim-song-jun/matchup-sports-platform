import { describe, it, expect } from 'vitest';
import {
  getSportImage,
  getTeamImage,
  getTeamLogo,
  getListingImage,
  getSportImageSet,
  getSportDetailImageSet,
  getListingImageSet,
  getListingPreviewImages,
  getVenueImageSet,
} from '../sport-image';

describe('getSportImage', () => {
  it('returns provided imageUrl when available', () => {
    const customUrl = 'https://example.com/my-image.jpg';
    expect(getSportImage('soccer', customUrl)).toBe(customUrl);
  });

  it('returns sport-specific placeholder when no imageUrl', () => {
    const url = getSportImage('soccer');
    expect(url).toContain('/mock/photoreal/soccer/');
  });

  it('returns different images for different sports', () => {
    const soccer = getSportImage('soccer');
    const basketball = getSportImage('basketball');
    expect(soccer).not.toBe(basketball);
  });

  it('returns fallback for unknown sport type', () => {
    const url = getSportImage('unknown_sport');
    expect(url).toContain('/mock/photoreal/soccer/');
  });

  it('ignores null imageUrl', () => {
    const url = getSportImage('tennis', null);
    expect(url).toContain('/mock/photoreal/tennis/');
  });

  it('rotates sport variants when a stable key is provided', () => {
    const first = getSportImage('soccer', undefined, 'match-a');
    const second = getSportImage('soccer', undefined, 'match-b');
    expect(first).not.toBe(second);
  });

  it('returns a gallery set for detail pages', () => {
    const images = getSportImageSet('futsal', 'detail-1', 3);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
  });

  it('prefers uploaded images in a detail gallery while blending sport fallbacks', () => {
    const uploaded = ['https://example.com/detail-1.jpg', 'https://example.com/detail-2.jpg'];
    const images = getSportDetailImageSet('basketball', uploaded, 'detail-uploaded', 3);
    expect(images[0]).toBe(uploaded[0]);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
  });

  it('can build a larger futsal gallery from the expanded variant pool', () => {
    const images = getSportImageSet('futsal', 'detail-wide', 6);
    expect(images).toHaveLength(6);
    expect(new Set(images).size).toBe(6);
  });
});

describe('getTeamImage', () => {
  it('returns coverImageUrl when available', () => {
    const coverUrl = 'https://example.com/team-cover.jpg';
    expect(getTeamImage('futsal', coverUrl)).toBe(coverUrl);
  });

  it('returns sport-based fallback without coverImageUrl', () => {
    const url = getTeamImage('basketball');
    expect(url).toContain('/mock/');
  });
});

describe('getTeamLogo', () => {
  it('returns logoUrl when available', () => {
    const logoUrl = 'https://example.com/team-logo.png';
    expect(getTeamLogo('서울 레인저스', 'futsal', logoUrl)).toBe(logoUrl);
  });

  it('returns a generated logo data uri when logoUrl is absent', () => {
    const logo = getTeamLogo('서울 레인저스', 'futsal', undefined, 'team-a');
    expect(logo).toContain('data:image/svg+xml');
  });

  it('returns deterministic but different generated logos for different keys', () => {
    const first = getTeamLogo('서울 레인저스', 'futsal', undefined, 'team-a');
    const second = getTeamLogo('서울 레인저스', 'futsal', undefined, 'team-b');
    expect(first).not.toBe(second);
  });
});

describe('getListingImage', () => {
  it('returns first imageUrl from array', () => {
    const urls = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
    expect(getListingImage(urls)).toBe('https://example.com/1.jpg');
  });

  it('returns fallback for empty array', () => {
    const url = getListingImage([]);
    expect(url).toContain('/mock/');
  });

  it('returns fallback for undefined', () => {
    const url = getListingImage(undefined);
    expect(url).toContain('/mock/');
  });

  it('falls back when imageUrls only contain empty values', () => {
    const url = getListingImage(['', '']);
    expect(url).toContain('/mock/photoreal/marketplace/');
  });

  it('returns listing gallery images', () => {
    const images = getListingImageSet(undefined, 'listing-1', 3);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
  });

  it('returns preview images for empty creation flows', () => {
    const images = getListingPreviewImages('listing-preview', 3);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
    images.forEach((image) => expect(image).toContain('/mock/photoreal/'));
  });
});

describe('getVenueImageSet', () => {
  it('builds a venue gallery from sport images and fallbacks', () => {
    const images = getVenueImageSet('badminton', undefined, 'venue-1', 3);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
  });
});
