/**
 * 루트 레이아웃 metadata 는 모듈 평가 시점에 env 를 읽는다 — 매 케이스 모듈을 새로 불러온다.
 * 레이아웃은 셸 컴포넌트 전체를 끌고 와서 첫 import 가 병렬 실행 중엔 5초를 넘길 수 있다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadLayoutMetadata() {
  vi.resetModules();
  return (await import('./layout')).metadata;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('루트 레이아웃 metadata', { timeout: 30_000 }, () => {
  it('소유확인 코드가 하나도 없으면 verification 을 아예 내보내지 않는다', async () => {
    vi.stubEnv('NAVER_SITE_VERIFICATION', '');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', '');
    vi.stubEnv('BING_SITE_VERIFICATION', '');
    const metadata = await loadLayoutMetadata();
    expect(metadata.verification).toBeUndefined();
  });

  it('값이 있으면 naver-site-verification 메타로 싣는다', async () => {
    vi.stubEnv('NAVER_SITE_VERIFICATION', '  abc123def  ');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', '');
    vi.stubEnv('BING_SITE_VERIFICATION', '');
    const metadata = await loadLayoutMetadata();
    expect(metadata.verification).toEqual({ other: { 'naver-site-verification': 'abc123def' } });
  });

  it('구글은 google 필드로, 빙은 msvalidate.01 로 네이버와 함께 싣는다', async () => {
    vi.stubEnv('NAVER_SITE_VERIFICATION', 'nv');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', 'gg');
    vi.stubEnv('BING_SITE_VERIFICATION', 'bb');
    const metadata = await loadLayoutMetadata();
    expect(metadata.verification).toEqual({
      google: 'gg',
      other: { 'naver-site-verification': 'nv', 'msvalidate.01': 'bb' },
    });
  });

  it('구글만 있으면 other 없이 google 만 싣는다', async () => {
    vi.stubEnv('NAVER_SITE_VERIFICATION', '');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', 'gg');
    vi.stubEnv('BING_SITE_VERIFICATION', '');
    const metadata = await loadLayoutMetadata();
    expect(metadata.verification).toEqual({ google: 'gg' });
  });

  it('공지 RSS 를 자동 발견 링크로 알린다', async () => {
    const metadata = await loadLayoutMetadata();
    expect(metadata.alternates?.types).toEqual({
      'application/rss+xml': [{ url: '/notices/feed.xml', title: 'Teameet 공지사항' }],
    });
  });

  // Next 는 alternates 를 세그먼트마다 통째로 교체한다 — canonical 을 선언한 페이지가 RSS 링크를 다시 싣지 않으면 사라진다.
  it('canonical 을 선언한 공개 페이지도 레이아웃과 같은 RSS 링크를 싣는다', async () => {
    const metadata = await loadLayoutMetadata();
    const { buildPublicMetadata } = await import('@/lib/seo');
    const page = buildPublicMetadata({ title: '대회', description: '설명', path: '/tournaments/abc' });
    expect(page.alternates?.canonical).toBe('/tournaments/abc');
    expect(page.alternates?.types).toEqual(metadata.alternates?.types);
  });
});
