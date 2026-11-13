import { optimizedImageSrc } from '@/lib/assets';

/** 카카오톡·페이스북·X 큰 카드가 받아 가는 가로 폭. */
const SOCIAL_IMAGE_WIDTH = 1200;

/** Next 메타데이터 이미지 라우트(`opengraph-image`·`twitter-image`)는 이미 공유 규격으로 그려진다. */
const METADATA_IMAGE_ROUTE = /(?:^|\/)(?:opengraph|twitter)-image(?:[?#]|$)/;

/**
 * og:image·twitter:image 로 내보낼 주소. 업로드 원본은 수 MB 라 같은 origin 경로는 `/_next/image` 사본으로 바꾼다.
 * 수집기는 Accept 에 webp 를 싣지 않아 사본은 원본 형식(JPEG·PNG·WebP)으로 온다.
 * 변환기가 받아 올 수 없는 주소(외부·data:·SVG 등)는 `optimizedImageSrc` 가 그대로 돌려준다.
 */
export function socialImageSrc(path: string): string {
  if (METADATA_IMAGE_ROUTE.test(path)) return path;
  // optimizedImageSrc 는 화면 폭의 2배 밀도 사본을 고르므로 절반을 넘긴다.
  return optimizedImageSrc(path, SOCIAL_IMAGE_WIDTH / 2);
}
