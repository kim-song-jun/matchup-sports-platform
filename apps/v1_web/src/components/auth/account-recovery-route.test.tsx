import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import FindAccountPage from '@/app/auth/find-account/page';
import { authUiServer, RECOVERY_EMAIL, RETURN_PATH, renderAuthUi, resetWireScenario, wireCalls } from './mdqa133-auth-ui.fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
beforeAll(() => authUiServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => authUiServer.close());
beforeEach(() => {
  resetWireScenario();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => { cleanup(); authUiServer.resetHandlers(); });

describe('MD-QA #133 실제 계정 찾기 페이지의 로그인 복귀', () => {
  it('서버 페이지의 query/hash 목적지가 실제 이메일 재설정과 로그인 링크까지 이어진다', async () => {
    renderAuthUi(await FindAccountPage({ searchParams: Promise.resolve({ mode: 'reset-password', redirect: RETURN_PATH }) }));
    const loginHref = `/login/email?redirect=${encodeURIComponent(RETURN_PATH)}`;
    screen.getAllByRole('link', { name: '뒤로가기' }).forEach((link) => expect(link).toHaveAttribute('href', loginHref));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: RECOVERY_EMAIL } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));
    await user.click(await screen.findByRole('button', { name: '확인' }));
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value: 'synthetic-new-password' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'synthetic-new-password' } });
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    expect(await screen.findByRole('link', { name: '로그인하러 가기' })).toHaveAttribute('href', loginHref);
    expect(wireCalls.emailReset).toEqual([{ email: RECOVERY_EMAIL, proofToken: 'email-proof', newPassword: 'synthetic-new-password' }]);
    expect(wireCalls.phoneReset).toBe(0);
  });

  it.each(['https://outside.example.test/steal', ['/chat', 'https://outside.example.test']])('잘못된 redirect %s는 버리고 안전한 from은 보존한다', async (redirect) => {
    renderAuthUi(await FindAccountPage({ searchParams: Promise.resolve({ redirect, from: '/my/settings' }) }));
    screen.getAllByRole('link', { name: '뒤로가기' }).forEach((link) => expect(link).toHaveAttribute('href', '/my/settings'));
    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(wireCalls.emailReset).toHaveLength(0);
  });
});
