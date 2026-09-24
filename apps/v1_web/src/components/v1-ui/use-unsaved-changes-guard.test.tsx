/**
 * 작성 중 이탈 확인 — 하드웨어·브라우저 뒤로가기(popstate)와 헤더 뒤로가기(AppBackLink) 둘 다.
 * 이 테스트가 잡는 버그: 입력한 폼에서 뒤로가기 한 번에 내용이 말없이 사라지는 것,
 * 반대로 아무것도 안 쓴 폼에서까지 확인창이 떠 떠나지 못하게 하는 것.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { createHistoryRouter, currentPath, settleHistory } from '@/test/history-router';
import { AppBackLink } from './app-back-link';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

const router = createHistoryRouter();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

const nextRouterPop = vi.fn();
const LEAVE_TITLE = '작성 중인 내용이 사라져요. 나갈까요?';

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  window.history.pushState({}, '', '/teams');
  window.history.pushState({}, '', '/teams/new');
  window.addEventListener('popstate', nextRouterPop);
});
afterEach(() => {
  window.removeEventListener('popstate', nextRouterPop);
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  vi.clearAllMocks();
});

function Form({ dirty }: { dirty: boolean }) {
  const { UnsavedChangesModal } = useUnsavedChangesGuard(dirty);
  return (
    <>
      <AppBackLink fallbackHref="/teams">뒤로</AppBackLink>
      {UnsavedChangesModal}
    </>
  );
}

const run = async (step: () => void, ticks = 5) => {
  await act(async () => {
    step();
    await settleHistory(ticks);
  });
};
const leaveDialog = () => screen.queryByRole('dialog', { name: LEAVE_TITLE });

describe('입력 중인 폼 — 뒤로가기(popstate)', () => {
  it('입력이 있으면 제자리에 두고 묻는다 — 나가기를 고르면 그때 이전 화면으로 간다', async () => {
    render(<Form dirty />);
    await run(() => window.history.back());

    expect(currentPath()).toBe('/teams/new');
    expect(nextRouterPop).not.toHaveBeenCalled();
    expect(leaveDialog()).toBeTruthy();

    await run(() => fireEvent.click(screen.getByRole('button', { name: '나가기' })), 10);
    expect(currentPath()).toBe('/teams');
    expect(nextRouterPop).toHaveBeenCalled();
  });

  it('계속 작성을 고르면 폼에 남는다', async () => {
    render(<Form dirty />);
    await run(() => window.history.back());
    await run(() => fireEvent.click(screen.getByRole('button', { name: '계속 작성' })));

    expect(leaveDialog()).toBeNull();
    expect(currentPath()).toBe('/teams/new');
    expect(nextRouterPop).not.toHaveBeenCalled();
  });

  it('입력이 없으면 묻지 않고 바로 떠난다', async () => {
    render(<Form dirty={false} />);
    await run(() => window.history.back());

    expect(leaveDialog()).toBeNull();
    expect(currentPath()).toBe('/teams');
    expect(nextRouterPop).toHaveBeenCalledTimes(1);
  });
});

describe('입력 중인 폼 — 헤더 뒤로가기', () => {
  it('입력이 있으면 묻고, 나가기를 고른 뒤에야 뒤로 간다', async () => {
    render(<Form dirty />);
    await run(() => fireEvent.click(screen.getByRole('link', { name: '뒤로가기' })));

    expect(leaveDialog()).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();

    await run(() => fireEvent.click(screen.getByRole('button', { name: '나가기' })), 10);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(currentPath()).toBe('/teams');
    expect(leaveDialog()).toBeNull();
  });

  it('입력이 없으면 바로 뒤로 간다', async () => {
    render(<Form dirty={false} />);
    await run(() => fireEvent.click(screen.getByRole('link', { name: '뒤로가기' })));

    expect(leaveDialog()).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(currentPath()).toBe('/teams');
  });
});
