/**
 * 랜딩은 landing-rhythm 모듈(키워드 → 타이틀 → 본문 → 그래픽)을 따른다(웨이브 1, 2026-09-04).
 * 히어로 그래픽이 빠지거나, 섹션 키워드가 사라지거나, 섹션 배경이 다시 교대로 바뀌면(강조 없음)
 * 여기서 잡는다. A안 재구성(2026-09-26) 이후로는 설명이 JS 없이 마크업에 다 있는지,
 * alpha 에 없는 기능을 약속하지 않는지도 여기서 잡는다.
 */
import { render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';
import LandingPage, { metadata } from './page';

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

async function renderLanding() {
  const page = await LandingPage();
  return render(<ThemeProvider>{page}</ThemeProvider>);
}

describe('LandingPage', () => {
  beforeEach(() => {
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
    siteInfo.fetchPublicSiteInfo.mockResolvedValue(
      normalizeSiteInfo({ businessRegistrationNumber: '000-00-00000', contactEmail: 'help@example.com' }),
    );
  });

  it('내비·푸터가 도움말·문의·이용 대상으로 이어지고, 사업자 정보는 어드민 설정 값을 그린다', async () => {
    const { container } = await renderLanding();
    const siteNav = container.querySelector<HTMLElement>('.tm-landing-nav-site')!;
    expect(within(siteNav).getByRole('link', { name: '도움말' })).toHaveAttribute('href', '/help');
    expect(within(siteNav).getByRole('link', { name: '문의' })).toHaveAttribute('href', '/contact');

    const footer = container.querySelector('footer')!;
    const hrefs = within(footer).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/help', '/faq', '/contact', '/for/players', '/for/teams', '/for/organizers',
        // 옛 랜딩 푸터가 걸던 약관 링크 — 공용 푸터로 바꾸며 빠지면 안 된다.
        '/terms?document=terms', '/terms?document=privacy',
      ]),
    );
    expect(footer.closest('[data-mobile-cta-hide]')).not.toBeNull();
    expect(footer.textContent).toContain('000-00-00000');
    expect(within(footer).getByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
  });

  it('히어로에 landing-hero 그래픽 웰이 있고 사실 스트립은 그 아래에 놓인다', async () => {
    const { container } = await renderLanding();
    const img = queryImageBySrc(container, '/illustrations/landing-hero-640.webp');
    expect(img).not.toBeNull();
    expect(img!.closest('.tm-landing-hero-graphic')).not.toBeNull();
    const aside = container.querySelector('.tm-landing-hero-aside')!;
    const children = [...aside.children].map((el) => el.className);
    expect(children[0]).toBe('tm-landing-hero-graphic');
    expect(children[1]).toContain('tm-landing-hero-facts');
  });

  it('히어로 스트립에 근거 없는 수치를 싣지 않는다', async () => {
    const { container } = await renderLanding();

    // 히어로 스트립은 데이터를 조회하지 않는다 — 여기 적힌 숫자는 전부 하드코딩 리터럴이 된다.
    // 방문자에게 확인해 줄 수 없는 값은 사실 문구로만 대체한다(2026-09-04 사용자 확정).
    const strip = container.querySelector('.tm-landing-hero-facts')!;
    expect(strip.textContent).not.toMatch(/\d/);
    expect(strip.textContent).toContain('운영 중인 종목');
  });

  it('섹션 헤더마다 키워드가 앞서고, 교대 배경(section-alt)은 없다', async () => {
    const { container } = await renderLanding();
    const kws = [...container.querySelectorAll('.tm-landing-section-kw')].map((el) => el.textContent);
    expect(kws).toEqual(['왜 팀밋', '기능', '편의 기능', '종목', '이용 방법']);
    for (const kw of container.querySelectorAll('.tm-landing-section-kw')) {
      expect(kw.nextElementSibling?.tagName).toBe('H2');
    }
    expect(container.querySelector('.tm-landing-section-alt')).toBeNull();
  });

  it('역할별 목적지는 탭이 아니라 서버가 그리는 링크 셋이다', async () => {
    const { container } = await renderLanding();
    const roles = container.querySelector('.tm-landing-roles')!;
    const hrefs = within(roles as HTMLElement).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/matches', '/teams', '/tournaments']);
    expect(roles.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
  });

  it('투어 다섯 장면과 예전/지금 두 문장이 상호작용 없이 모두 마크업에 있다', async () => {
    const { container } = await renderLanding();
    const titles = [...container.querySelectorAll('.tm-landing-tour-step h3')].map((el) => el.textContent);
    expect(titles).toHaveLength(5);
    expect(container.querySelectorAll('.tm-landing-pain-before')).toHaveLength(3);
    expect(container.querySelectorAll('.tm-landing-pain-after')).toHaveLength(3);
  });

  it('폰 목업은 이미지로 묶이고, 안의 팀·점수가 예시라는 것을 라벨로 알린다', async () => {
    const { container } = await renderLanding();
    const devices = [...container.querySelectorAll('.tm-landing-device')];
    expect(devices.length).toBeGreaterThan(0);
    for (const device of devices) {
      expect(device.getAttribute('role')).toBe('img');
      expect(device.getAttribute('aria-label')).toContain('예시');
    }
  });

  it('alpha 에 없는 기능이나 확인되지 않은 약속을 싣지 않는다', async () => {
    const { container } = await renderLanding();
    // 장터·강좌·결제·AI 매칭은 v1 에 없고, 앱 스토어 앱은 출시 전이며, 준비 중 종목은 근거가 없다.
    // 검색 결과에 보이는 제목·설명도 같은 약속이다(옛 description 이 "AI 기반 …" 이었다).
    const forbidden = /AI|장터|강좌|결제|준비 중|앱 알림|다운로드/;
    expect(container.textContent).not.toMatch(forbidden);
    expect(String(metadata.title)).not.toMatch(forbidden);
    expect(metadata.description).not.toMatch(forbidden);
  });
});
