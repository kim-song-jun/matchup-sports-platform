/**
 * 랜딩 v2(B안 "불편 → 해결 이야기") 계약. A안(/landing)과 검색에서 겹치지 않는지, 이야기 순서가
 * 기승전결로 서 있는지, 예전/이제 비교가 사람이 누를 때만 바뀌는지, 사실과 다른 문구가 없는지를 잡는다.
 */
import { fireEvent, render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';
import LandingV2Page, { metadata } from './page';

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

const DESTINATIONS = ['/matches', '/teams', '/tournaments'];

async function renderPage() {
  const page = await LandingV2Page();
  return render(<ThemeProvider>{page}</ThemeProvider>);
}

describe('LandingV2Page', () => {
  beforeEach(() => {
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
    siteInfo.fetchPublicSiteInfo.mockResolvedValue(
      normalizeSiteInfo({ businessRegistrationNumber: '000-00-00000', contactEmail: 'help@example.com' }),
    );
  });

  it('푸터는 A안과 같은 공용 푸터이고, 사업자 정보는 어드민 설정 값을 그린다', async () => {
    const { container } = await renderPage();
    const footer = container.querySelector('footer')!;
    const hrefs = within(footer).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/help', '/faq', '/contact', '/terms?document=privacy']));
    expect(footer.closest('[data-mobile-cta-hide]')).not.toBeNull();
    expect(footer.textContent).toContain('000-00-00000');
  });

  it('검색에 따로 잡히지 않고 정본을 A안(/landing)으로 가리킨다', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/landing');
    // 미리보기 캐시가 A안과 섞이지 않게 og:url 은 자기 주소
    expect(metadata.openGraph?.url).toBe('/landing/v2');
  });

  it('공감 → 해결 → 신뢰 → 종목 → 이용 방법 순서로 섹션이 서고, 키워드 다음은 제목이다', async () => {
    const { container } = await renderPage();
    const kws = [...container.querySelectorAll('.tm-landing-section-kw')].map((el) => el.textContent);
    expect(kws).toEqual(['공감', '해결', '신뢰', '종목', '이용 방법']);
    for (const kw of container.querySelectorAll('.tm-landing-section-kw')) {
      expect(kw.nextElementSibling?.tagName).toBe('H2');
    }
    // 반전 띠는 공감과 해결 사이에 한 번만 온다(강조 배경은 페이지에 하나)
    const pain = container.querySelector('#pain')!;
    const pivots = container.querySelectorAll('.tm-landing-v2-pivot');
    expect(pivots).toHaveLength(1);
    expect(pain.nextElementSibling).toBe(pivots[0]);
    expect(pivots[0].nextElementSibling?.id).toBe('story');
  });

  it('불편 넷이 각자 풀리는 챕터로 이어지고, 챕터마다 예전·지금 두 면이 모두 마크업에 있다', async () => {
    const { container } = await renderPage();
    const fixes = [...container.querySelectorAll('.tm-landing-v2-pain-fix')].map((a) => a.getAttribute('href'));
    expect(fixes).toEqual(['#ch1', '#ch2', '#ch3', '#ch4']);
    // 내비·불편 카드의 페이지 내 링크가 모두 실제 목적지를 가진다
    for (const a of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(container.querySelector(a.getAttribute('href')!), a.getAttribute('href')!).not.toBeNull();
    }
    const chapters = [...container.querySelectorAll('.tm-landing-v2-chapter')];
    expect(chapters.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3', 'ch4']);
    for (const chapter of chapters) {
      expect(chapter.querySelector('[data-face="before"] .tm-landing-v2-before')).not.toBeNull();
      expect(chapter.querySelector('[data-face="after"] .tm-landing-device')?.getAttribute('aria-label')).toContain('예시');
    }
  });

  it('예전/이제 토글은 누를 때만 바뀌고 aria-pressed 로 상태를 알린다', async () => {
    const { container } = await renderPage();
    const chapter = container.querySelector('#ch1') as HTMLElement;
    const compare = chapter.querySelector('.tm-landing-v2-compare')!;
    const before = within(chapter).getByRole('button', { name: '예전엔' });
    const after = within(chapter).getByRole('button', { name: '이제는' });
    expect(compare.getAttribute('data-view')).toBe('after');
    expect(after).toHaveAttribute('aria-pressed', 'true');
    expect(before).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(before);
    expect(compare.getAttribute('data-view')).toBe('before');
    expect(before).toHaveAttribute('aria-pressed', 'true');
    expect(after).toHaveAttribute('aria-pressed', 'false');
    // 다른 챕터는 따라 바뀌지 않는다
    expect(container.querySelector('#ch2 .tm-landing-v2-compare')!.getAttribute('data-view')).toBe('after');

    fireEvent.click(after);
    expect(compare.getAttribute('data-view')).toBe('after');
    expect(after).toHaveAttribute('aria-pressed', 'true');
  });

  it('역할별 목적지는 탭이 아니라 서버가 그리는 링크 셋이고, 챕터 사이마다 목적지 CTA 가 있다', async () => {
    const { container } = await renderPage();
    const roles = container.querySelector('.tm-landing-v2-roles') as HTMLElement;
    const hrefs = within(roles).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(DESTINATIONS);
    expect(roles.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
    for (const chapter of container.querySelectorAll('.tm-landing-v2-chapter')) {
      const cta = chapter.querySelector('.tm-landing-v2-chapter-cta');
      expect(DESTINATIONS).toContain(cta?.getAttribute('href'));
    }
  });

  it('정책과 다르거나 확인되지 않은 문구, 운영자를 놀리는 밈 장면을 싣지 않는다', async () => {
    const { container } = await renderPage();
    // 평가는 작성자 닉네임이 공개된다(익명 아님). 매치 정원은 화면이 저절로 갱신되지 않는다.
    // 가짜 파일명·수식 오류 같은 장면은 대회 운영자에게 자기 업무 조롱으로 읽힌다.
    const forbidden = /익명|#REF|#N\/A|실시간|최종_|IMG_\d|AI|장터|강좌|결제|준비 중|앱 알림|다운로드/;
    expect(container.textContent).not.toMatch(forbidden);
    expect(String(metadata.title)).not.toMatch(forbidden);
    expect(metadata.description).not.toMatch(forbidden);
    // 검증 가능한 공개 정책은 그대로 적는다
    expect(container.textContent).toContain('평가를 남긴 사람의 닉네임이 함께 보여요');
  });
});
