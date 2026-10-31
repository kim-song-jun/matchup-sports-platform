import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_EMAIL_LINK_STORAGE_KEY, readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { savePendingSocialLink } from '@/lib/pending-social-link';
import type { V1AuthMe } from '@/types/api';
import { usePendingEmailLinkOffer } from './use-pending-email-link-offer';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const EMAIL_LINK_ROUTE = '/my/settings/login-methods/email';
const TYPED = 'typed@example.com';

type Account = Pick<V1AuthMe, 'user' | 'termsCompliance'>;
function account(overrides: { providers?: string[] | null; email?: string | null; onboardingStatus?: string; compliant?: boolean } = {}): Account {
  // null 은 "로그인 수단 목록이 없는 응답"이다(undefined 는 기본값으로 바뀌므로 구분한다).
  const { providers = ['kakao'], email = null, onboardingStatus = 'completed', compliant = true } = overrides;
  return {
    user: { id: 'user-1', email, onboardingStatus, ...(providers ? { authProviders: providers } : {}) },
    termsCompliance: { compliant, pendingRequiredDocumentIds: [], nextRoute: null },
  } as Account;
}

const mount = (initial: Account | undefined) =>
  renderHook(({ current }) => usePendingEmailLinkOffer(current), { initialProps: { current: initial } });

describe('usePendingEmailLinkOffer — 원래 계정으로 로그인한 뒤 가입 때 입력한 이메일을 연결하자고 제안', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    router.replace.mockReset();
  });

  it('이메일 로그인이 없는 계정이면 연결 화면으로 한 번 보내고, 연결 화면이 읽을 수 있게 칸은 남겨 둔다', () => {
    savePendingEmailLink(TYPED);
    const view = mount(account());

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
    // 이동 주소에는 이메일을 싣지 않는다 — 연결 화면이 같은 칸에서 읽는다.
    expect(router.replace.mock.calls[0]?.[0]).not.toContain('example.com');
    expect(readPendingEmailLink()).toBe(TYPED);

    // /auth/me 가 다시 와도(창 포커스 갱신 등) 같은 제안을 되풀이하지 않는다.
    view.rerender({ current: account() });
    view.rerender({ current: account({ providers: ['kakao', 'apple'] }) });
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('보관한 이메일이 없으면 아무 데도 보내지 않는다', () => {
    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('만료된 이메일은 제안하지 않고 칸에서 지운다', () => {
    savePendingEmailLink(TYPED, Date.now() - 31 * 60 * 1000);

    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY)).toBeNull();
  });

  it('이 계정에 이미 이메일 로그인이 있으면 제안하지 않고 칸을 비운다', () => {
    savePendingEmailLink(TYPED);

    mount(account({ providers: ['email', 'kakao'] }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it.each(['typed@example.com', 'Typed@Example.com'])('보관한 이메일이 이미 이 계정의 이메일(%s)이면 제안하지 않고 칸을 비운다', (accountEmail) => {
    savePendingEmailLink(TYPED);

    mount(account({ email: accountEmail }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('계정 이메일이 다른 주소면(연락용 이메일) 제안한다', () => {
    savePendingEmailLink(TYPED);

    mount(account({ email: 'contact@example.com' }));

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
  });

  it('로그인 수단 목록을 모르는 응답에서는 제안하지 않는다', () => {
    savePendingEmailLink(TYPED);

    mount(account({ providers: null }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('로그인 확인 전(계정 없음)에는 칸을 건드리지 않는다', () => {
    savePendingEmailLink(TYPED);

    mount(undefined);

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBe(TYPED);
  });

  it.each(['social_profile_required', 'social_terms_required', 'social_profile_deferred'])('가입이 덜 끝난 계정(%s)은 기다렸다가, 끝난 뒤에 제안한다', (onboardingStatus) => {
    savePendingEmailLink(TYPED);
    const view = mount(account({ onboardingStatus }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBe(TYPED);

    view.rerender({ current: account({ onboardingStatus: 'completed' }) });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
  });

  it('약관 재동의가 남은 계정은 동의를 마친 뒤에 제안한다', () => {
    savePendingEmailLink(TYPED);
    const view = mount(account({ compliant: false }));

    expect(router.replace).not.toHaveBeenCalled();

    view.rerender({ current: account({ compliant: true }) });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
  });

  it('소셜 연결 토큰이 대기 중이면 그 결과 화면이 먼저라 기다린다 — 두 이동이 서로 덮어쓰지 않게', () => {
    savePendingEmailLink(TYPED);
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 600 });

    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBe(TYPED);
  });
});
