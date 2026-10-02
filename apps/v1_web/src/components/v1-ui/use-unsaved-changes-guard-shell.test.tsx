/**
 * The app shell's own links (header home icon, notifications bell, desktop logo) while a dirty form is mounted.
 * They are plain links, so the guard's click interception must stop them before Next's Link navigates.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { createHistoryRouter, currentPath, settleHistory } from '@/test/history-router';
import { AppChrome } from './shell';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

const router = createHistoryRouter();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/teams/new',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(() => ({ data: { unreadCount: 0 } })),
}));

const FORM = '/teams/new';
const LEAVE_TITLE = '작성 중인 내용이 사라져요. 나갈까요?';

function reset() {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
}

beforeEach(() => {
  reset();
  window.history.replaceState(null, '', '/teams');
  installNavigationHistory();
  window.history.pushState({}, '', FORM);
});
afterEach(() => {
  reset();
  vi.clearAllMocks();
});

function Form() {
  const { UnsavedChangesModal } = useUnsavedChangesGuard(true);
  return <>{UnsavedChangesModal}</>;
}

const run = async (step: () => void) => {
  await act(async () => {
    step();
    await settleHistory(5);
  });
};

// A form route: no bottom nav, so the topbar shows the home shortcut.
const renderFormInShell = () =>
  render(
    <AppChrome title="팀 만들기" bottomNav={false} backHref="/teams">
      <Form />
    </AppChrome>,
  );

const topbar = () => screen.getAllByRole('banner')[0];
const desktopNav = () => screen.getByRole('navigation', { name: '데스크톱 주요 메뉴' });

describe('dirty form inside the app shell', () => {
  it.each([
    ['header home icon', () => within(topbar()).getByRole('link', { name: '홈으로' })],
    ['header notifications icon', () => within(topbar()).getByRole('link', { name: '알림' })],
    ['desktop logo', () => within(desktopNav()).getByRole('link', { name: 'teameet 홈' })],
  ])('the %s asks before leaving, and 계속 작성 stays on the form', async (_label, link) => {
    renderFormInShell();

    await run(() => fireEvent.click(link()));
    expect(screen.getByRole('dialog', { name: LEAVE_TITLE })).toBeTruthy();
    expect(currentPath()).toBe(FORM);
    expect(router.push).not.toHaveBeenCalled();

    await run(() => fireEvent.click(screen.getByRole('button', { name: '계속 작성' })));
    expect(screen.queryByRole('dialog', { name: LEAVE_TITLE })).toBeNull();
    expect(currentPath()).toBe(FORM);
    expect(router.push).not.toHaveBeenCalled();
  });
});
