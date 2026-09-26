/**
 * `next build`는 v1_api 컨테이너에 못 닿는 CI 러너에서 돈다. `export const revalidate`가
 * 양수(예: 300)면 Next가 이 라우트를 빌드 타임에 정적/ISR 프리렌더하고, fetchSeoCursorPage /
 * fetchSeoMasterSports / fetchPublicV1이 실패해 빈 목록을 그 정적 HTML에 구워 버린다 —
 * 배포 직후 첫 ISR 캐시 HIT까지 실제 유저·크롤러가 그 빈 결과를 본다
 * (메모: isr-serves-build-time-empty-cache).
 *
 * revalidate=0은 "항상 요청 시점에 렌더"를 뜻해 빌드 타임 프리렌더 자체가 없어진다 —
 * fetchPublicV1 내부 fetch가 여전히 쓰는 `next: { revalidate: 300 }`가 5분 캐시를 대신 맡는다.
 * 이 테스트는 그 설정이 조용히 300 등으로 되돌아가는 회귀를 잡는다.
 */
import { describe, expect, it } from 'vitest';

describe('목록/사이트맵 라우트는 빌드 타임 정적 프리렌더 대상이 아니다', () => {
  it('teams/page.tsx: revalidate === 0', async () => {
    const mod = await import('./teams/page');
    expect(mod.revalidate).toBe(0);
  });

  it('matches/page.tsx: revalidate === 0', async () => {
    const mod = await import('./matches/page');
    expect(mod.revalidate).toBe(0);
  });

  it('team-matches/page.tsx: revalidate === 0', async () => {
    const mod = await import('./team-matches/page');
    expect(mod.revalidate).toBe(0);
  });

  it('sitemap.ts: revalidate === 0', async () => {
    const mod = await import('./sitemap');
    expect(mod.revalidate).toBe(0);
  });

  it('llms.txt/route.ts: revalidate === 0', async () => {
    const mod = await import('./llms.txt/route');
    expect(mod.revalidate).toBe(0);
  });

  it('notices/feed.xml/route.ts: revalidate === 0', async () => {
    const mod = await import('./notices/feed.xml/route');
    expect(mod.revalidate).toBe(0);
  });
});
