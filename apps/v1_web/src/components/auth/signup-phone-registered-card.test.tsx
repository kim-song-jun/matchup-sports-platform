import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PENDING_EMAIL_LINK_STORAGE_KEY, readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { SignupPhoneRegisteredCard } from './signup-phone-registered-card';

const LINK_ROW = /카카오로 로그인하고 이 이메일 연결하기/;
const LOGIN_ONLY_ROW = /카카오로만 로그인할래요/;

function renderCard(props: { typedEmail?: string | null; returnTo?: string | null; withdrawalPendingUntil?: string | null } = {}) {
  return render(
    <SignupPhoneRegisteredCard
      withdrawalPendingUntil={props.withdrawalPendingUntil ?? null}
      loginHref="/login/email"
      socialLoginHref="/login"
      findAccountHref="/auth/find-account"
      typedEmail={props.typedEmail ?? null}
      returnTo={props.returnTo ?? null}
    />,
  );
}

/** 링크 핸들러는 그대로 돌리되 jsdom 이 실제 이동을 시도하지 않게 막는다. */
function press(name: RegExp) {
  const link = screen.getByRole('link', { name });
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  delete window.TeameetNative;
});

describe('SignupPhoneRegisteredCard — 이메일 연결 뜻 받기', () => {
  it('이메일을 아직 적기 전이면 연결 줄은 이메일을 직접 적는다고 안내하고, 누르면 이메일 없이 뜻만 보관한다', () => {
    renderCard({ typedEmail: null, returnTo: '/matches/abc' });

    expect(screen.getByRole('link', { name: LINK_ROW })).toHaveTextContent('로그인하면 연결할 이메일을 직접 적어요. 비밀번호는 저장하지 않아요.');
    expect(readPendingEmailLink()).toBeNull();

    press(LINK_ROW);

    expect(readPendingEmailLink()).toEqual({ email: null, returnTo: '/matches/abc' });
  });

  it('이메일을 이미 적었다면 연결 줄이 그 이메일을 말하고, 누르면 이메일과 뜻을 보관한다', () => {
    renderCard({ typedEmail: 'typed@example.com' });

    expect(screen.getByRole('link', { name: LINK_ROW })).toHaveTextContent('로그인하면 typed@example.com 연결을 바로 이어서 도와요. 비밀번호는 저장하지 않아요.');

    press(LINK_ROW);

    expect(readPendingEmailLink()).toEqual({ email: 'typed@example.com', returnTo: null });
  });

  it('연결 줄도 로그인 첫 화면으로 가고, 보관하는 것은 이메일·돌아갈 곳·만료 시각뿐이다', () => {
    renderCard({ typedEmail: 'typed@example.com' });

    expect(screen.getByRole('link', { name: LINK_ROW })).toHaveAttribute('href', '/login');
    press(LINK_ROW);

    const stored = JSON.parse(window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY) as string) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['email', 'expiresAt', 'returnTo']);
    expect(window.localStorage.length).toBe(0);
  });

  it.each([
    ['카카오로만 로그인할래요', LOGIN_ONLY_ROW],
    ['이메일로 가입했어요', /이메일로 가입했어요/],
    ['비밀번호가 기억나지 않아요', /비밀번호가 기억나지 않아요/],
  ])('"%s" 줄은 아무것도 보관하지 않고, 앞서 보관한 뜻은 거둔다', (_title, row) => {
    renderCard({ typedEmail: 'typed@example.com' });
    press(LINK_ROW);
    expect(readPendingEmailLink()).not.toBeNull();

    press(row);

    expect(readPendingEmailLink()).toBeNull();
  });

  it('"로그인만" 줄은 이메일을 연결하지 않는다고 말하고 같은 로그인 첫 화면으로 간다', () => {
    renderCard({ typedEmail: 'typed@example.com' });

    const row = screen.getByRole('link', { name: LOGIN_ONLY_ROW });
    expect(row).toHaveTextContent('이메일은 연결하지 않고 로그인만 해요');
    expect(row).toHaveAttribute('href', '/login');
    expect(row).not.toHaveTextContent('typed@example.com');
  });

  it('앞서 다른 이메일이 보관돼 있었어도 새로 누른 뜻으로 바뀌어, 지난 이메일이 제안되지 않는다', () => {
    savePendingEmailLink({ email: 'older@example.com' });
    renderCard({ typedEmail: null });

    press(LINK_ROW);

    expect(readPendingEmailLink()).toEqual({ email: null, returnTo: null });
  });

  it('iOS 앱에서는 두 줄이 Apple 버튼도 안내한다', () => {
    window.TeameetNative = { supports: ['sign-in-with-apple'], postMessage: () => undefined };
    renderCard();

    expect(screen.getByRole('link', { name: /카카오·Apple로 로그인하고 이 이메일 연결하기/ })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /카카오·Apple로만 로그인할래요/ })).toHaveAttribute('href', '/login');
  });

  it('탈퇴 유예 중인 계정이면 이메일 연결을 권하지 않고 로그인해서 취소하는 길만 보여 준다', () => {
    renderCard({ typedEmail: 'typed@example.com', withdrawalPendingUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() });

    expect(screen.queryByRole('link', { name: LINK_ROW })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login');
  });
});
