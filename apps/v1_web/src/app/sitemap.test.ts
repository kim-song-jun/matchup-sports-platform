import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_SITE_ROUTES } from '@/lib/public-site/routes';

// 목록 API 는 전부 404(null) — 정적 경로만 남는 상황에서도 공개 도움말 페이지는 빠지면 안 된다.
vi.mock('@/lib/seo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/seo')>()),
  fetchPublicV1: vi.fn(async () => null),
}));

const { default: sitemap } = await import('./sitemap');

describe('sitemap', () => {
  it('도움말·이용 대상·문의 페이지를 전부 싣고, 콘텐츠 갱신일을 lastModified 로 준다', async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    for (const route of PUBLIC_SITE_ROUTES) {
      const entry = byUrl.get(`https://teameet.co.kr${route.path}`);
      expect(entry, `${route.path} 가 sitemap 에 없다`).toBeDefined();
      if (route.lastModified) expect(entry!.lastModified).toEqual(new Date(route.lastModified));
      else expect(entry).not.toHaveProperty('lastModified');
    }
  });
});
