import { describe, expect, it } from 'vitest';
import { parseNextImageSrc } from '@/test/next-image';
import { socialImageSrc } from './og-image';
import { DEFAULT_SOCIAL_IMAGE } from './seo';

describe('socialImageSrc', () => {
  it('같은 origin 업로드·정적 이미지는 원본 대신 가로 1200·품질 75 사본 주소로 바꾼다', () => {
    expect(parseNextImageSrc(socialImageSrc('/uploads/2026/07/cover.jpg'))).toEqual({
      pathname: '/_next/image',
      url: '/uploads/2026/07/cover.jpg',
      w: '1200',
      q: '75',
    });
    expect(parseNextImageSrc(socialImageSrc('/images/team-logos/team-logo-02.jpg'))).toEqual({
      pathname: '/_next/image',
      url: '/images/team-logos/team-logo-02.jpg',
      w: '1200',
      q: '75',
    });
  });

  it('변환기가 받아 올 수 없는 주소는 감싸지 않는다 — 감싸면 수집기가 400 을 받는다', () => {
    for (const src of [
      'https://cdn.example.com/poster.png',
      '//cdn.example.com/poster.png',
      'data:image/png;base64,AAAA',
      '/api/v1/chat/rooms/r/messages/m/file',
      '/uploads/2026/07/emblem.svg',
    ]) {
      expect(socialImageSrc(src)).toBe(src);
    }
  });

  it('기본 미리보기 이미지는 이미 공유 규격으로 그려져 그대로 둔다', () => {
    expect(socialImageSrc(DEFAULT_SOCIAL_IMAGE.path)).toBe(DEFAULT_SOCIAL_IMAGE.path);
  });
});
