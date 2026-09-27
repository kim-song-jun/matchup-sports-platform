/**
 * 랜딩 v3 = A안(/landing)의 내용·순서 그대로 + 768 이상에서 sticky 투어 대신 정적 행.
 * A안과 검색에서 겹치지 않는지, 섹션 순서가 A안과 같은지, 투어가 스텝마다 설명과 화면을 한 행에
 * 두는지, 스텝 동기화 표식이 없는지, 그리고 A안은 여전히 sticky 투어인지(회귀 방향)를 잡는다.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';
import LandingPage from '../page';
import LandingV3Page, { metadata } from './page';

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

const STAGE_MARKERS = '[data-tour], [data-tour-stage], [data-tour-step], [data-tour-dot], .tm-landing-tour-stage';

async function renderPage(Page: () => Promise<React.ReactElement>) {
  const page = await Page();
  return render(<ThemeProvider>{page}</ThemeProvider>);
}

const texts = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((el) => el.textContent);

describe('LandingV3Page', () => {
  beforeEach(() => {
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
    siteInfo.fetchPublicSiteInfo.mockResolvedValue(normalizeSiteInfo({ businessRegistrationNumber: '000-00-00000' }));
  });

  it('검색에 따로 잡히지 않고 정본을 A안(/landing)으로 가리킨다', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/landing');
    expect(metadata.openGraph?.url).toBe('/landing/v3');
  });

  it('섹션 키워드·제목·투어 스텝 순서가 A안과 같다', async () => {
    const v1 = (await renderPage(LandingPage)).container;
    const v3 = (await renderPage(LandingV3Page)).container;
    expect(texts(v3, '.tm-landing-section-kw')).toEqual(texts(v1, '.tm-landing-section-kw'));
    expect(texts(v3, 'main h2')).toEqual(texts(v1, 'main h2'));
    expect(texts(v3, '.tm-landing-tour-title')).toEqual(texts(v1, '.tm-landing-tour-step .tm-landing-tour-title'));
    expect(texts(v3, '.tm-landing-tour-title')).toHaveLength(5);
  });

  it('투어는 스텝마다 설명과 그 스텝 전용 폰 화면이 한 행에 있다', async () => {
    const { container } = await renderPage(LandingV3Page);
    const rows = [...container.querySelectorAll('.tm-landing-v3-tour-row')];
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const [copy, shot] = [...row.children];
      expect(copy.querySelector('h3')).not.toBeNull();
      const devices = shot.querySelectorAll('.tm-landing-device');
      expect(devices).toHaveLength(1);
      expect(devices[0].querySelectorAll('[data-screen]')).toHaveLength(1);
    }
  });

  it('sticky 무대와 스텝 동기화 표식이 없고, 루트가 v3 규칙을 받는다', async () => {
    const { container } = await renderPage(LandingV3Page);
    expect(container.querySelector(STAGE_MARKERS)).toBeNull();
    expect(container.querySelector('.tm-landing')).toHaveClass('tm-landing-v3');
  });

  it('A안(/landing)은 그대로 sticky 무대와 v3 가 아닌 루트를 쓴다', async () => {
    const { container } = await renderPage(LandingPage);
    expect(container.querySelector('[data-tour] [data-tour-stage]')).not.toBeNull();
    expect(container.querySelectorAll('[data-tour-step]')).toHaveLength(5);
    expect(container.querySelector('.tm-landing')).not.toHaveClass('tm-landing-v3');
    expect(container.querySelector('.tm-landing-v3-tour')).toBeNull();
  });
});
