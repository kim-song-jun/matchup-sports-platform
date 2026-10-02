/**
 * @vitest-environment node
 *
 * satori 산출물을 sharp 로 넘기려면 Node 의 Uint8Array 가 필요하다(jsdom 에서는 거부된다).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMetadataRoute } from 'next/dist/lib/metadata/get-metadata-route';
import { describe, expect, it, vi } from 'vitest';
import { buildPublicMetadata, DEFAULT_SOCIAL_IMAGE } from '@/lib/seo';
import * as defaultOgImage from './opengraph-image';

/** PNG IHDR 청크의 가로·세로(빅엔디언 4바이트씩, 오프셋 16·20). */
function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('기본 링크 미리보기 이미지', () => {
  it('커버가 없는 페이지는 1200x630 기본 이미지 경로로 폴백하고 큰 카드로 공유된다', () => {
    const metadata = buildPublicMetadata({ title: '공지', description: '설명', path: '/notices/n-1', image: null });

    expect(metadata.openGraph?.images).toEqual([
      { url: '/opengraph-image', width: 1200, height: 630, alt: '공지' },
    ]);
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', images: ['/opengraph-image'] });
  });

  it('커버가 있으면 커버를 쓰고, 모르는 커버 크기를 지어내지 않는다', () => {
    const metadata = buildPublicMetadata({ title: '대회', description: '설명', path: '/tournaments/t-1', image: '/uploads/cover.png' });

    expect(metadata.openGraph?.images).toEqual([{ url: '/uploads/cover.png', alt: '대회' }]);
  });

  it('정사각 이미지(팀 로고)는 X 에서 작은 카드로 보낸다 — 큰 카드는 위아래를 잘라낸다', () => {
    const metadata = buildPublicMetadata({ title: '팀', description: '설명', path: '/teams/t-1', image: '/uploads/logo.png', squareImage: true });

    expect(metadata.twitter).toMatchObject({ card: 'summary', images: ['/uploads/logo.png'] });
  });

  it('메타데이터가 가리키는 경로가 Next 가 이 파일을 서빙하는 경로와 같다', () => {
    // 라우트 그룹·병렬 라우트 아래로 옮기면 Next 가 해시 접미사를 붙여 폴백 경로가 404 가 된다.
    const file = fileURLToPath(new URL('./opengraph-image.tsx', import.meta.url));
    const page = `/${path.relative(file.slice(0, file.lastIndexOf('/src/app/') + '/src/app'.length), file)}`.replace(/\.tsx$/, '');

    expect(normalizeMetadataRoute(page)).toBe(`${DEFAULT_SOCIAL_IMAGE.path}/route`);
    expect(defaultOgImage.contentType).toBe('image/png');
  });

  it('실제로 1200x630 PNG 를 그린다 — 한글 카피·로고 마크를 읽는 경로가 깨지지 않았다', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await defaultOgImage.default();
    const png = Buffer.from(await response.arrayBuffer());

    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    // 폰트·로고 로더는 실패 시 console.error 후 축소판으로 떨어진다 — 조용한 폴백을 잡는다.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  }, 30_000);
});
