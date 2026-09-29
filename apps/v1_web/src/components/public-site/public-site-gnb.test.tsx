/**
 * 공개 페이지·랜딩 v4 공용 GNB. 메뉴 열고 닫기(포커스 복귀), 현재 위치 표시(겹치는 경로는 가장 긴 것 하나),
 * 랜딩 전용 장치가 공개 페이지에 새지 않는 것(CTA 계측이 랜딩 대시보드 집계를 오염시키지 않게)을 잡는다.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { PublicSiteGnb } from './public-site-gnb';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/analytics', () => analytics);
const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => false }));

beforeEach(() => {
  analytics.trackEvent.mockClear();
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

function renderGnb(currentPath = '/faq', landing = false) {
  // next/link 를 <a> 로 바꿔 둬서 jsdom 이 실제 이동을 시도하지 않게 기본 동작만 막는다(onClick 은 그대로 돈다)
  return render(
    <ThemeProvider>
      <div onClickCapture={(event) => event.preventDefault()}>
        <PublicSiteGnb currentPath={currentPath} landing={landing} />
      </div>
      <button type="button">바깥</button>
    </ThemeProvider>,
  );
}

async function openMobileMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
  return screen.getByRole('navigation', { name: '전체 메뉴' });
}

describe('PublicSiteGnb 전체 메뉴(<1024)', () => {
  it('열면 매치·대회·팀 큰 행 → 이용 안내 → 로그인 순서이고 첫 링크로 포커스가 간다', async () => {
    const user = userEvent.setup();
    renderGnb();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')!;
    expect(panel).not.toBeVisible();

    const menu = await openMobileMenu(user);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();
    const hrefs = within(menu).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/team-matches', '/tournaments', '/teams', '/help', '/faq', '/help/glossary', '/contact', '/login']);
    expect(within(menu).getAllByRole('link')[0]).toHaveFocus();
    // 옛 공개 헤더의 서비스 소개·이용 대상 갈래는 공용 GNB 에 없다
    expect(within(menu).queryByRole('link', { name: '서비스 소개' })).toBeNull();
    expect(within(menu).queryByText('이용 대상')).toBeNull();
  });

  it('ESC 로 닫으면 메뉴 버튼으로 포커스가 돌아오고, 바깥을 누르면 포커스를 빼앗지 않고 닫힌다', async () => {
    const user = userEvent.setup();
    renderGnb();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    await openMobileMenu(user);
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    await openMobileMenu(user);
    const outside = screen.getByRole('button', { name: '바깥' });
    await user.click(outside);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(outside).toHaveFocus();
  });

  it('그룹 라벨(초점 없는 곳)을 눌러도 닫히지 않고, 초점이 밖으로 나가면 닫힌다', async () => {
    const user = userEvent.setup();
    renderGnb();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    const menu = await openMobileMenu(user);
    await user.click(within(menu).getByText('이용 안내'));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    within(menu).getByRole('link', { name: '로그인' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: '바깥' })).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('PublicSiteGnb 현재 위치', () => {
  it.each([
    ['/help/glossary', '용어집', '시작 가이드'],
    ['/help/guides/join-match', '시작 가이드', '용어집'],
    ['/faq', '자주 묻는 질문', '시작 가이드'],
  ])('%s 에서는 %s 하나만 aria-current 다', async (path, current, other) => {
    const user = userEvent.setup();
    renderGnb(path);
    const menu = await openMobileMenu(user);
    expect(within(menu).getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: other })).not.toHaveAttribute('aria-current');
    expect(within(menu).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });

  it('1024+ 이용 안내 드롭다운은 안의 페이지에서만 켜지고, 열면 현재 항목을 표시한다', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGnb('/help/glossary');
    const siteNav = screen.getByRole('navigation', { name: '이용 안내' });
    const trigger = within(siteNav).getByRole('button', { name: '이용 안내' });
    expect(trigger).toHaveAttribute('data-current', 'true');
    await user.click(trigger);
    expect(within(siteNav).getByRole('link', { name: '용어집' })).toHaveAttribute('aria-current', 'page');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    unmount();

    renderGnb('/tournaments/abc');
    expect(screen.getByRole('button', { name: '이용 안내' })).not.toHaveAttribute('data-current');
    const main = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(within(main).getByRole('link', { name: '대회' })).toHaveAttribute('aria-current', 'page');
    expect(within(main).getByRole('link', { name: '매치' })).not.toHaveAttribute('aria-current');
  });
});

describe('PublicSiteGnb 랜딩 전용 장치', () => {
  it('공개 페이지에서는 움직임 멈추기·스크롤 진행 바가 없고 로그인·무료로 시작을 눌러도 랜딩 CTA 를 계측하지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = renderGnb('/help');
    expect(screen.queryByRole('button', { name: '움직임 멈추기' })).toBeNull();
    expect(container.querySelector('.tm-landing-progress')).toBeNull();
    await user.click(screen.getByRole('link', { name: '무료로 시작' }));
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it('랜딩에서는 움직임 멈추기가 있고 무료로 시작이 nav_signup 으로 계측된다', async () => {
    const user = userEvent.setup();
    renderGnb('/landing', true);
    expect(screen.getByRole('button', { name: '움직임 멈추기' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '무료로 시작' }));
    expect(analytics.trackEvent).toHaveBeenCalledWith('landing_cta_click', { cta: 'nav_signup' });
  });
});
