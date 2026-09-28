/**
 * 랜딩 v4 = 스크롤 무대(GNB → 히어로 → 고정 무대 → 지금 팀밋에서 → 벤토 → 3단계 → FAQ → 펼쳐지는 CTA → 푸터).
 * 검색에서 A안과 겹치지 않는지, 서버 HTML(=JS 없음·모션 꺼짐)이 장면 5개를 다 담는지, 실데이터가
 * 무대 ①②와 섹션 ②에 실제로 반영되는지, v1·v3 루트가 v4 규칙을 받지 않는지(회귀 방향)를 잡는다.
 */
import { renderToString } from 'react-dom/server';
import { act, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { normalizeSiteInfo } from '@/lib/public-site/site-info';
import type { LandingV4Data } from '@/lib/landing/landing-v4-data';
import { setMotionPaused } from '@/components/landing/landing-motion-store';
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
  tournaments: [
    {
      kind: 'tournament', id: 't1', title: '가을 풋살 오픈', status: 'in_progress', statusLabel: '진행 중',
      dateText: '10월 18일 (일)', location: '서울 송파구', teamsText: '4개 팀', prizeText: '50만원',
      imageUrl: null, formatLabel: '토너먼트', slots: null, href: '/tournaments/t1',
    },
    {
      kind: 'tournament', id: 't2', title: '겨울 축구 리그', status: 'open', statusLabel: '모집 중',
      dateText: '11월 1일 (일)', location: null, teamsText: null, prizeText: null,
      imageUrl: '/uploads/t2.webp', formatLabel: '조별리그 + 토너먼트', slots: { confirmed: 1, total: 4 }, href: '/tournaments/t2',
    },
  ],
  teamMatches: [
    {
      kind: 'team_match', id: 'tm1', hostName: '마포 레인저스', opponentName: '한강 로버스',
      hostLogoUrl: null, opponentLogoUrl: null, region: '종로구', place: '케이풋살파크',
      dateTimeText: '9월 30일 (수) 20:00', formatText: '4:4', levelLabel: '입문', isLeague: false, href: '/team-matches/tm1',
    },
    {
      kind: 'team_match', id: 'tm2', hostName: '송파 유나이티드', opponentName: '이게팀이야',
      hostLogoUrl: null, opponentLogoUrl: null, region: '송파구', place: null,
      dateTimeText: '10월 13일 (화) 19:00', formatText: null, levelLabel: null, isLeague: true, href: '/team-matches/tm2',
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
  afterEach(() => setMotionPaused(false));

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
      '내리면 경기 하루가지나가요',
      '오늘도 이만큼뛰고 있어요',
      '경기 전에도,끝난 뒤에도',
      '세 단계면바로 뛸 수 있어요',
      '자주 묻는 질문',
      '같이 뛸 사람,팀밋에서 만나요',
    ]);
  });

  it('서버 HTML 은 무대를 세로 나열(stack)로 그리고 장면 5개의 문구·폰을 모두 담는다', async () => {
    const html = renderToString(<ThemeProvider>{await LandingV4Page()}</ThemeProvider>);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const stage = doc.querySelector('#stage');
    expect(stage?.getAttribute('data-mode')).toBe('stack');
    expect([...stage!.querySelectorAll('.tm-landing-v4-scene h3')].map((h) => squash(h.textContent))).toEqual([
      '근처팀매치를한눈에골라요',
      '버튼한번이면신청이끝나요',
      '등번호와이름으로명단을채워요',
      '경기중에는스코어가바로올라가요',
      '끝나면내기록이카드로남아요',
    ]);
    expect(stage!.querySelectorAll('.tm-landing-v4-scene-phone')).toHaveLength(5);
    expect(stage!.querySelector('.tm-landing-v4-rail')).toBeNull();
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

  it('무대 ①② 는 실데이터 팀 매치와 수치를, 예시 장면은 "체험용 예시"를 보여 준다', async () => {
    const { container } = await renderPage(LandingV4Page);
    const stage = container.querySelector('#stage') as HTMLElement;
    expect(stage.textContent).toContain('지금 올라온 팀 매치 41개를');
    expect(stage.textContent).toContain('마포 레인저스 vs 한강 로버스');
    expect(stage.textContent).toContain('송파 유나이티드 vs 이게팀이야');
    expect(stage.textContent).toContain('4:4 입문');
    expect(stage.textContent).toContain('체험용 예시');
  });

  it('지금 팀밋에서: 수치·종목 칩·대회 카드·흐르는 팀 매치가 실데이터로 채워진다', async () => {
    const { container } = await renderPage(LandingV4Page);
    const now = container.querySelector('#now') as HTMLElement;
    const stats = [...now.querySelectorAll('.tm-landing-v4-stat')].map((el) => squash(el.textContent));
    expect(stats[0]).toContain('팀매치4141개');
    expect(stats[0]).toContain('풋살21축구20러닝·수영준비중');
    expect(stats[2]).toContain('7474팀이상');
    const big = now.querySelector('.tm-landing-v4-tcard-big') as HTMLElement;
    expect(big).toHaveAttribute('href', '/tournaments/t1');
    expect(big.textContent).toContain('LIVE · 진행 중');
    expect(big.textContent).toContain('토너먼트');
    const side = now.querySelector('.tm-landing-v4-tcard-sm') as HTMLElement;
    expect(side.textContent).toContain('4팀 중 1팀 확정');
    expect(side.textContent).not.toContain('LIVE');
    const visibleCards = [...now.querySelectorAll('.tm-landing-v4-mq-group:not([data-clone]) > li:not([aria-hidden])')];
    expect(visibleCards.map((li) => li.querySelector('a')?.getAttribute('href'))).toEqual(['/team-matches/tm1', '/team-matches/tm2']);
  });

  it('실데이터를 하나도 못 받으면 섹션 ② 대신 안내와 대회 목록 링크만 남는다', async () => {
    landingData.fetchLandingV4Data.mockResolvedValue({
      ...FIXTURE, hasAnyData: false, tournaments: [], teamMatches: [], bySport: {},
      counts: { teamMatches: null, tournaments: null, tournamentsOpen: null, teams: null },
    });
    const { container } = await renderPage(LandingV4Page);
    const now = container.querySelector('#now') as HTMLElement;
    expect(within(now).getByRole('link', { name: '대회 둘러보기' })).toHaveAttribute('href', '/tournaments');
    expect(now.querySelector('.tm-landing-v4-stat, .tm-landing-v4-tcard')).toBeNull();
    // 무대 ①② 는 예시 카드로 대신하고 "체험용 예시"를 붙인다
    const stage = container.querySelector('#stage') as HTMLElement;
    expect(stage.textContent).toContain('FC 한강 vs 성수 러너스');
    expect(stage.textContent).not.toContain('지금 올라온 팀 매치');
  });

  it('움직임을 멈추면 무대가 세로 나열로 돌아가고, 켜면 장면 탭이 생긴다 — 두 경우 모두 5장면 문구가 있다', async () => {
    const { container } = await renderPage(LandingV4Page);
    const stage = container.querySelector('#stage') as HTMLElement;
    expect(stage).toHaveAttribute('data-mode', 'stage');
    expect(within(stage).getAllByRole('button').map((b) => squash(b.textContent))).toEqual(['01찾기', '02신청', '03명단', '04라이브', '05기록']);
    expect(stage.querySelectorAll('.tm-landing-v4-scene h3')).toHaveLength(5);
    act(() => setMotionPaused(true));
    expect(stage).toHaveAttribute('data-mode', 'stack');
    expect(stage.querySelector('.tm-landing-v4-rail')).toBeNull();
    expect(stage.querySelectorAll('.tm-landing-v4-scene h3')).toHaveLength(5);
  });

  it('마지막 CTA 는 가입·팀 매치로 가고, 모바일 하단 바의 숨김 대상이다', async () => {
    const { container } = await renderPage(LandingV4Page);
    const cta = container.querySelector('#start') as HTMLElement;
    expect(within(cta).getByRole('link', { name: '무료로 시작하기' })).toHaveAttribute('href', '/login');
    expect(within(cta).getByRole('link', { name: '경기 둘러보기' })).toHaveAttribute('href', '/team-matches');
    expect(cta.querySelector('[data-mobile-cta-hide]')).not.toBeNull();
    const steps = container.querySelector('#how') as HTMLElement;
    expect(within(steps).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/login', '/team-matches', '/tournaments']);
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
      expect(container.querySelector('.tm-landing-v4-hero, #stage, #now')).toBeNull();
      unmount();
    }
  });
});
