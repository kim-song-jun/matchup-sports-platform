import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LandingNav } from './landing-nav';

let mockPathname = '/pricing';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('LandingNav', () => {
  beforeEach(() => {
    mockPathname = '/pricing';
  });

  it('applies the scenario contract to the active mobile link', async () => {
    render(<LandingNav />);

    await userEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const dialog = screen.getByRole('dialog', { name: '모바일 메뉴' });
    const activeLink = within(dialog).getByRole('link', { name: '요금' });

    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink).toHaveClass(
      'font-semibold',
      'text-blue-500',
      'bg-blue-50',
      'dark:bg-blue-900/30',
      'dark:text-blue-200',
    );
  });

  it('keeps inactive mobile links on the quiet neutral scale', async () => {
    render(<LandingNav />);

    await userEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const dialog = screen.getByRole('dialog', { name: '모바일 메뉴' });
    const guideLink = within(dialog).getByRole('link', { name: '이용 가이드' });

    expect(guideLink).toHaveClass('text-gray-500');
    expect(guideLink).toHaveClass('dark:text-gray-300');
    expect(guideLink).not.toHaveClass('bg-blue-50');
    expect(guideLink).not.toHaveAttribute('aria-current');
  });

  it('marks the desktop active link with aria-current', () => {
    render(<LandingNav />);

    expect(screen.getAllByRole('link', { name: '요금' })[0]).toHaveAttribute('aria-current', 'page');
  });

  it('traps page content while the mobile menu is open and restores focus on escape', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <LandingNav />
        <main data-testid="page-content">
          <a href="/outside">밖의 링크</a>
        </main>
      </div>,
    );

    const menuButton = screen.getByRole('button', { name: '메뉴 열기' });
    await user.click(menuButton);

    const dialog = screen.getByRole('dialog', { name: '모바일 메뉴' });
    const pageContent = screen.getByTestId('page-content');

    expect(dialog).toBeInTheDocument();
    expect(pageContent).toHaveAttribute('aria-hidden', 'true');
    expect(pageContent).toHaveAttribute('inert');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '모바일 메뉴' })).not.toBeInTheDocument();
    expect(pageContent).not.toHaveAttribute('aria-hidden');
    expect(pageContent).not.toHaveAttribute('inert');
    expect(menuButton).toHaveFocus();
  });

  it('anchors the mobile drawer to the viewport bottom without dvh math', async () => {
    render(<LandingNav />);

    await userEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const dialog = screen.getByRole('dialog', { name: '모바일 메뉴' });

    expect(dialog).toHaveClass('fixed', 'inset-x-0', 'top-16', 'bottom-0');
    expect(dialog.className).not.toContain('h-[calc(100dvh-4rem)]');
  });

  it('restores pre-existing sibling accessibility attributes when the menu closes', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <LandingNav />
        <main data-testid="page-content">
          <a href="/outside">밖의 링크</a>
        </main>
      </div>,
    );

    const pageContent = screen.getByTestId('page-content');
    pageContent.setAttribute('aria-hidden', 'until-other-overlay-closes');
    pageContent.setAttribute('inert', '');

    await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
    await user.keyboard('{Escape}');

    expect(pageContent).toHaveAttribute('aria-hidden', 'until-other-overlay-closes');
    expect(pageContent).toHaveAttribute('inert');
  });

  it('hides the header 시작하기 CTA when mobile menu is open', async () => {
    render(<LandingNav />);

    await userEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const allCtas = screen.getAllByRole('link', { name: '시작하기' });
    expect(allCtas).toHaveLength(2);

    const dialog = screen.getByRole('dialog', { name: '모바일 메뉴' });
    const drawerCta = within(dialog).getByRole('link', { name: '시작하기' });
    expect(drawerCta).toBeInTheDocument();

    const headerCta = allCtas.find((cta) => !dialog.contains(cta));
    expect(headerCta).toHaveClass('hidden');
  });

  it('keeps the mobile CTA tray inside the viewport safe area', async () => {
    render(<LandingNav />);

    await userEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const dialog = screen.getByRole('dialog', { name: '모바일 메뉴' });
    const actions = screen.getByTestId('landing-mobile-menu-actions');

    expect(dialog).toHaveClass('overscroll-contain');
    expect(actions).toHaveClass('pb-[env(safe-area-inset-bottom)]');
  });
});
