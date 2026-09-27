/**
 * 랜딩 v4 = A안(/landing)의 내용·순서 그대로 + 히어로(만져 보는 폰)·투어(고정 폰) 교체.
 * 검색에서 A안과 겹치지 않는지, 섹션 순서가 v3 와 같은지, 헤드라인이 SSR 텍스트로 있는지,
 * 그리고 v1·v3 루트가 v4 규칙을 받지 않는지(회귀 방향)를 잡는다.
 */
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';
import LandingPage from '../page';
import LandingV3Page from '../v3/page';
import LandingV4Page, { metadata } from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => false }));

const siteInfo = vi.hoisted(() => ({ fetchPublicSiteInfo: vi.fn() }));
vi.mock('@/lib/public-site/site-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/public-site/site-info')>()),
  fetchPublicSiteInfo: siteInfo.fetchPublicSiteInfo,
}));

async function renderPage(Page: () => Promise<React.ReactElement>) {
  const page = await Page();
  return render(<ThemeProvider>{page}</ThemeProvider>);
}

const texts = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((el) => el.textContent);

/* 히어로 데모에는 스크린리더용 영역 제목(h2.sr-only)이 하나 있어 섹션 제목 비교에서 뺀다 */
const sectionHeadings = (root: ParentNode) =>
  [...root.querySelectorAll('main h2')].filter((el) => !el.closest('.tm-landing-hero')).map((el) => el.textContent);

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, '');

describe('LandingV4Page', () => {
  beforeEach(() => {
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
    siteInfo.fetchPublicSiteInfo.mockResolvedValue(normalizeSiteInfo({ businessRegistrationNumber: '000-00-00000' }));
  });

  it('검색에 따로 잡히지 않고 정본을 A안(/landing)으로 가리킨다', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/landing');
    expect(metadata.openGraph?.url).toBe('/landing/v4');
  });

  it('섹션 키워드·제목·투어 스텝 순서가 v3 와 같다', async () => {
    const v3 = (await renderPage(LandingV3Page)).container;
    const v4 = (await renderPage(LandingV4Page)).container;
    expect(texts(v4, '.tm-landing-section-kw')).toEqual(texts(v3, '.tm-landing-section-kw'));
    expect(sectionHeadings(v4)).toEqual(sectionHeadings(v3));
    expect(sectionHeadings(v3)).toEqual(texts(v3, 'main h2'));
    expect(texts(v4, '.tm-landing-tour-title')).toEqual(texts(v3, '.tm-landing-tour-title'));
    expect(texts(v4, '.tm-landing-tour-title')).toHaveLength(5);
  });

  it('히어로 헤드라인은 서버 HTML 에 A안과 같은 문장으로 있다', async () => {
    const html = renderToString(<ThemeProvider>{await LandingV4Page()}</ThemeProvider>);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1#hero-heading');
    const v1 = (await renderPage(LandingPage)).container;
    expect(squash(heading?.textContent)).toBe('매치부터대회까지,한앱에서끝까지');
    expect(squash(heading?.textContent)).toBe(squash(v1.querySelector('h1#hero-heading')?.textContent));
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('v4 루트만 tm-landing-v4 규칙을 받고, v1·v3 루트는 그대로다', async () => {
    const v4 = (await renderPage(LandingV4Page)).container;
    expect(v4.querySelector('.tm-landing')).toHaveClass('tm-landing-v4');
    expect(v4.querySelector('.tm-landing')).not.toHaveClass('tm-landing-v3');
    for (const Page of [LandingPage, LandingV3Page]) {
      const { container, unmount } = await renderPage(Page);
      expect(container.querySelector('.tm-landing')).not.toHaveClass('tm-landing-v4');
      expect(container.querySelector('.tm-landing-v4-hero, [data-v4-tour-pin]')).toBeNull();
      unmount();
    }
  });
});
