import { collectLlmsFullSnapshot } from '@/lib/llms-full';
import { renderLlmsFull } from '@/lib/llms-full-render';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';

// sitemap.ts·llms.txt 와 같은 이유 — 빌드 타임 프리렌더(빈 목록)를 배포 직후 서빙하지 않는다.
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const [snapshot, siteInfo] = await Promise.all([collectLlmsFullSnapshot(), fetchPublicSiteInfo()]);
  return new Response(renderLlmsFull(snapshot, { contactEmail: siteInfo.contactEmail }), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
