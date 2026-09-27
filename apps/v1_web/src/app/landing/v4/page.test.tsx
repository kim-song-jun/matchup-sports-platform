/**
 * 랜딩 v4 = 새 위계(GNB → 히어로 → 문 3개 → 지금 열려 있어요 → 3단계 → 종목 → FAQ → CTA → 푸터).
 * 검색에서 A안과 겹치지 않는지, 헤드라인이 SSR 텍스트로 있는지, 실데이터가 각 섹션에 실제로
 * 반영되는지, v1·v3 루트가 v4 규칙을 받지 않는지(회귀 방향)를 잡는다.
 */
import { renderToString } from 'react-dom/server';
import { render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';
import type { LandingV4Data } from '@/lib/landing/landing-v4-data';
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

const FIXTURE: LandingV4Data = {
  counts: {
    teamMatches: { value: 41, more: false },
    tournaments: { value: 16, more: false },
    tournamentsOpen: { value: 7, more: false },
    teams: { value: 74, more: true },
  },
  bySport: {
    축구: { teamMatches: 20, tournaments: 5, teams: 30 },
    풋살: { teamMatches: 21, tournaments: 11, teams: 44 },
    러닝: { teamMatches: 0, tournaments: 0, teams: 0 },
  },
  hasAnyData: true,
  live: [
    {
      kind: 'tournament', id: 't1', title: '가을 풋살 오픈', status: 'open', statusLabel: '모집 중',
      dateText: '10월 18일 (일)', location: '서울 송파구', teamsText: '4개 팀', prizeText: '50만원',
      href: '/tournaments/t1',
    },
    {
      kind: 'team_match', id: 'tm1', hostName: '마포 레인저스', opponentName: '한강 로버스',
      region: '종로구', dateTimeText: '9월 30일 (수) 20:00', isLeague: false, href: '/team-matches/tm1',
    },
  ],
};

const landingData = vi.hoisted(() => ({ fetchLandingV4Data: vi.fn() }));
vi.mock('@/lib/landing/landing-v4-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/landing/landing-v4-data')>()),
  fetchLandingV4Data: landingData.fetchLandingV4Data,
}));

async function renderPage(Page: () => Promise<React.ReactElement>) {
  const page = await Page();
  return render(<ThemeProvider>{page}</ThemeProvider>);
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, '');

/* 히어로 데모에는 스크린리더용 영역 제목(h2.sr-only)이 하나 있어 섹션 제목 비교에서 뺀다 */
const sectionHeadings = (root: ParentNode) =>
  [...root.querySelectorAll('main h2')].filter((el) => !el.closest('.tm-landing-hero')).map((el) => el.textContent);

describe('LandingV4Page', () => {
  beforeEach(() => {
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
    siteInfo.fetchPublicSiteInfo.mockResolvedValue(normalizeSiteInfo({ businessRegistrationNumber: '000-00-00000' }));
    landingData.fetchLandingV4Data.mockResolvedValue(FIXTURE);
  });

  it('검색에 따로 잡히지 않고 정본을 A안(/landing)으로 가리킨다', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('/landing');
    expect(metadata.openGraph?.url).toBe('/landing/v4');
  });

  it('새 위계 순서대로 섹션 제목이 렌더된다', async () => {
    const { container } = await renderPage(LandingV4Page);
    expect(sectionHeadings(container)).toEqual([
      '무엇을 하러 오셨나요',
      '지금 열려 있어요',
      '세 단계면바로 뛸 수 있어요',
      '지금 열려 있는 종목',
      '자주 묻는 질문',
      '같이 뛸 사람,팀밋에서 만나요',
    ]);
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

  it('GNB 는 매치·대회·팀 링크와 이용 안내 드롭다운, "무료로 시작" CTA 를 보여준다', async () => {
    const { container, getByRole } = await renderPage(LandingV4Page);
    const nav = container.querySelector('header.tm-landing-nav');
    expect(nav?.querySelector('a[href="/team-matches"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/tournaments"]')).not.toBeNull();
    expect(nav?.querySelector('a[href="/teams"]')).not.toBeNull();
    expect(getByRole('button', { name: '이용 안내' })).toBeInTheDocument();
    expect(getByRole('link', { name: '무료로 시작' })).toBeInTheDocument();
  });

  it('문 3개·지금 열려 있어요·종목 섹션이 실데이터를 실제로 반영한다', async () => {
    const { container } = await renderPage(LandingV4Page);
    expect(container.textContent).toContain('지금 팀 매치 41개');
    expect(container.textContent).toContain('대회 16개 · 모집 중 7개');
    expect(container.textContent).toContain('팀 74개 이상 활동 중');
    expect(container.textContent).toContain('가을 풋살 오픈');
    expect(container.textContent).toContain('마포 레인저스 vs 한강 로버스');
    expect(container.textContent).toContain('매치 20 · 대회 5 · 팀 30');
    expect(container.textContent).toContain('준비 중');
  });

  it('모바일 하단 바는 /team-matches 로 가는 "경기 보기" 버튼을 쓴다', async () => {
    const { container } = await renderPage(LandingV4Page);
    const bar = container.querySelector('.tm-landing-mobile-cta') as HTMLElement;
    const link = within(bar).getByRole('link', { name: '경기 보기' });
    expect(link).toHaveAttribute('href', '/team-matches');
  });

  it('v4 루트만 tm-landing-v4 규칙을 받고, v1·v3 루트는 그대로다', async () => {
    const v4 = (await renderPage(LandingV4Page)).container;
    expect(v4.querySelector('.tm-landing')).toHaveClass('tm-landing-v4');
    expect(v4.querySelector('.tm-landing')).not.toHaveClass('tm-landing-v3');
    for (const Page of [LandingPage, LandingV3Page]) {
      const { container, unmount } = await renderPage(Page);
      expect(container.querySelector('.tm-landing')).not.toHaveClass('tm-landing-v4');
      expect(container.querySelector('.tm-landing-v4-hero, #doors')).toBeNull();
      unmount();
    }
  });
});
