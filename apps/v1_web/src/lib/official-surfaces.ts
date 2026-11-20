import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/app-store-links';

export const OFFICIAL_INSTAGRAM = {
  handle: '@teameet_official',
  url: 'https://www.instagram.com/teameet_official/',
} as const;

/** 실제로 운영 중인 공식 표면만 넣는다 — 없는 계정을 적으면 엔티티 신뢰가 깨진다. */
export const OFFICIAL_SURFACES = [OFFICIAL_INSTAGRAM.url, IOS_APP_STORE_URL, ANDROID_PLAY_STORE_URL] as const;
