import { describe, it, expect } from 'vitest';
import { getSportImage, getTeamImage, getListingImage } from '../sport-image';

describe('getSportImage', () => {
  it('returns provided imageUrl when available', () => {
    const customUrl = 'https://example.com/my-image.jpg';
    expect(getSportImage('soccer', customUrl)).toBe(customUrl);
  });

  it('returns sport-specific placeholder when no imageUrl', () => {
    const url = getSportImage('soccer');
    expect(url).toContain('unsplash.com');
  });

  it('returns different images for different sports', () => {
    const soccer = getSportImage('soccer');
    const basketball = getSportImage('basketball');
    expect(soccer).not.toBe(basketball);
  });

  it('returns fallback for unknown sport type', () => {
    const url = getSportImage('unknown_sport');
    expect(url).toContain('unsplash.com'); // falls back to soccer
  });

  it('ignores null imageUrl', () => {
    const url = getSportImage('tennis', null);
    expect(url).toContain('unsplash.com');
  });
});

describe('getTeamImage', () => {
  it('returns coverImageUrl when available', () => {
    const coverUrl = 'https://example.com/team-cover.jpg';
    expect(getTeamImage('futsal', coverUrl)).toBe(coverUrl);
  });

  it('returns sport-based fallback without coverImageUrl', () => {
    const url = getTeamImage('basketball');
    expect(url).toContain('unsplash.com');
  });
});

describe('getListingImage', () => {
  it('returns first imageUrl from array', () => {
    const urls = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];
    expect(getListingImage(urls)).toBe('https://example.com/1.jpg');
  });

  it('returns fallback for empty array', () => {
    const url = getListingImage([]);
    expect(url).toContain('unsplash.com');
  });

  it('returns fallback for undefined', () => {
    const url = getListingImage(undefined);
    expect(url).toContain('unsplash.com');
  });
});
