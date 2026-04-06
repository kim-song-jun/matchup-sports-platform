import { describe, it, expect } from 'vitest';
import {
  getSportImage,
  getTeamImage,
  getListingImage,
  getSportImageSet,
  getListingImageSet,
  getVenueImageSet,
} from '../sport-image';

describe('getSportImage', () => {
  it('returns provided imageUrl when available', () => {
    const customUrl = 'https://example.com/my-image.jpg';
    expect(getSportImage('soccer', customUrl)).toBe(customUrl);
  });

  it('returns sport-specific placeholder when no imageUrl', () => {
    const url = getSportImage('soccer');
    expect(url).toContain('/mock/sports/');
  });

  it('returns different images for different sports', () => {
    const soccer = getSportImage('soccer');
    const basketball = getSportImage('basketball');
    expect(soccer).not.toBe(basketball);
  });

  it('returns fallback for unknown sport type', () => {
    const url = getSportImage('unknown_sport');
    expect(url).toContain('/mock/sports/soccer');
  });

  it('ignores null imageUrl', () => {
    const url = getSportImage('tennis', null);
    expect(url).toContain('/mock/sports/');
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

  it('returns listing gallery images', () => {
    const images = getListingImageSet(undefined, 'listing-1', 3);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
  });
});

describe('getVenueImageSet', () => {
  it('builds a venue gallery from sport images and fallbacks', () => {
    const images = getVenueImageSet('badminton', undefined, 'venue-1', 3);
    expect(images).toHaveLength(3);
    expect(new Set(images).size).toBe(3);
  });
});
