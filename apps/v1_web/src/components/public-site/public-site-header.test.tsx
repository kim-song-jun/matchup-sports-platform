import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { PublicSiteHeader } from './public-site-header';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => false }));

beforeEach(() => {
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

function renderHeader(currentPath = '/faq') {
  return render(
    <ThemeProvider>
      <PublicSiteHeader currentPath={currentPath} />
      <button type="button">바깥</button>
    </ThemeProvider>,
  );
}

describe('PublicSiteHeader 전체 메뉴(<1024)', () => {
  it('열면 aria-expanded 가 true 가 되고 첫 링크로 포커스가 간다', async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('메뉴 닫기');
    expect(panel).toBeVisible();
    const menu = within(panel as HTMLElement).getByRole('navigation', { name: '전체 메뉴' });
    expect(within(menu).getByRole('link', { name: '서비스 소개' })).toHaveFocus();
    // 이용 대상 세 갈래와 로그인이 390 메뉴 안에 모두 있다
    for (const name of ['개인', '팀', '대회 운영자', '도움말', '문의', '로그인']) {
      expect(within(menu).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('ESC 로 닫으면 메뉴 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    await user.click(toggle);
    await user.tab();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('바깥을 누르면 포커스를 빼앗지 않고 닫힌다', async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    await user.click(toggle);
    const outside = screen.getByRole('button', { name: '바깥' });
    await user.click(outside);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(outside).toHaveFocus();
  });

  it('패널 안의 초점 없는 곳(그룹 라벨)을 눌러도 닫히지 않고, 초점이 밖으로 나가면 닫힌다', async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = screen.getByRole('button', { name: '메뉴 열기' });
    await user.click(toggle);
    const menu = screen.getByRole('navigation', { name: '전체 메뉴' });

    await user.click(within(menu).getByText('이용 대상'));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    within(menu).getByRole('link', { name: '로그인' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: '바깥' })).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('현재 페이지 링크에 aria-current="page" 를 단다', async () => {
    const user = userEvent.setup();
    renderHeader('/help/guides/join-match');
    await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
    const menu = screen.getByRole('navigation', { name: '전체 메뉴' });
    expect(within(menu).getByRole('link', { name: '도움말' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: '문의' })).not.toHaveAttribute('aria-current');
  });
});

describe('PublicSiteHeader 이용 대상 드롭다운(1024+)', () => {
  it('열고 ESC 로 닫으면 트리거로 포커스가 돌아온다', async () => {
    const user = userEvent.setup();
    renderHeader('/for/teams');
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const trigger = within(nav).getByRole('button', { name: '이용 대상' });
    expect(trigger).toHaveAttribute('data-current', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const teams = within(nav).getByRole('link', { name: '팀' });
    expect(teams).toHaveAttribute('href', '/for/teams');
    expect(teams).toHaveAttribute('aria-current', 'page');

    teams.focus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
