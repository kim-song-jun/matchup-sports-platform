import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const ALREADY_HAS_EMAIL_LOGIN = '이 계정에는 이미 이메일 로그인이 있어요.';

let socialLinkRouted: { current: boolean };
/** 훅이 돌려주는 안내(toast)까지 그려 본다. */
function Harness({ me, routed }: { me: Account | undefined; routed: RefObject<boolean> }) {
  const { toast } = usePendingEmailLinkOffer(me, routed);
  return <>{toast}</>;
}
const mount = (initial: Account | undefined) =>
  renderHook(({ current }) => usePendingEmailLinkOffer(current, socialLinkRouted), { initialProps: { current: initial } });

describe('usePendingEmailLinkOffer — 원래 계정으로 로그인한 뒤 가입 때 입력한 이메일을 연결하자고 제안', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    router.replace.mockReset();
    socialLinkRouted = { current: false };
  });
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('이메일 로그인이 없는 계정이면 연결 화면으로 한 번 보내고, 연결 화면이 읽을 수 있게 칸은 남겨 둔다', () => {
    savePendingEmailLink({ email: TYPED });
    const view = mount(account());

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
    // 이동 주소에는 이메일을 싣지 않는다 — 연결 화면이 같은 칸에서 읽는다.
    expect(router.replace.mock.calls[0]?.[0]).not.toContain('example.com');
    expect(readPendingEmailLink()?.email).toBe(TYPED);

    // /auth/me 가 다시 와도(창 포커스 갱신 등) 같은 제안을 되풀이하지 않는다.
    view.rerender({ current: account() });
    view.rerender({ current: account({ providers: ['kakao', 'apple'] }) });
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  // 번호 인증이 가입의 첫 단계라 이메일을 적기 전에 겹치면 뜻만 보관한다 — 이메일은 연결 화면에서 적는다.
  it('이메일 없이 뜻만 보관했어도 같은 길로 한 번 보내고, 계정 이메일이 있어도 그것을 이유로 건너뛰지 않는다', () => {
    savePendingEmailLink({ email: null });
    const view = mount(account({ email: 'owner@example.com' }));

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
    expect(readPendingEmailLink()).toEqual({ email: null, returnTo: null });

    view.rerender({ current: account({ email: 'owner@example.com' }) });
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('가입 화면이 보관한 원래 목적지를 연결 화면 주소에 함께 싣는다', () => {
    savePendingEmailLink({ email: TYPED, returnTo: '/matches/abc?tab=info' });

    mount(account());

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(`${EMAIL_LINK_ROUTE}?redirect=%2Fmatches%2Fabc%3Ftab%3Dinfo`);
    expect(router.replace.mock.calls[0]?.[0]).not.toContain('example.com');
  });

  it('보관한 이메일이 없으면 아무 데도 보내지 않는다', () => {
    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('만료된 이메일은 제안하지 않고 칸에서 지운다', () => {
    savePendingEmailLink({ email: TYPED }, Date.now() - 11 * 60 * 1000);

    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY)).toBeNull();
  });

  it.each([TYPED, null])('이 계정에 이미 이메일 로그인이 있으면(보관한 이메일: %s) 제안하지 않고 칸을 비운다', (stored) => {
    savePendingEmailLink({ email: stored });

    mount(account({ providers: ['email', 'kakao'] }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  // 서버는 호출자 자신이 쥔 주소를 이메일 로그인 키로 연결하는 것을 받아 준다 — 같은 주소라고 건너뛰면 연결할 길이 막힌다.
  it.each(['typed@example.com', 'Typed@Example.com', 'contact@example.com'])('이메일 로그인이 없는 계정이면 계정 이메일(%s)이 무엇이든 제안한다', (accountEmail) => {
    savePendingEmailLink({ email: TYPED });

    mount(account({ email: accountEmail }));

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
  });

  it('로그인 수단 목록을 모르는 응답에서는 제안하지 않는다', () => {
    savePendingEmailLink({ email: TYPED });

    mount(account({ providers: null }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('로그인 확인 전(계정 없음)에는 칸을 건드리지 않는다', () => {
    savePendingEmailLink({ email: TYPED });

    mount(undefined);

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()?.email).toBe(TYPED);
  });

  it.each(['social_profile_required', 'social_terms_required', 'social_profile_deferred'])(
    '새 소셜 계정으로 가입 중이면(%s) 원래 계정이 아니므로 제안하지 않고 칸을 비운다 — 가입을 마친 뒤에도 그 계정에는 제안하지 않는다',
    (onboardingStatus) => {
      savePendingEmailLink({ email: TYPED });
      const view = mount(account({ onboardingStatus }));

      expect(router.replace).not.toHaveBeenCalled();
      expect(readPendingEmailLink()).toBeNull();

      view.rerender({ current: account({ onboardingStatus: 'completed' }) });
      expect(router.replace).not.toHaveBeenCalled();
    },
  );

  it('약관 재동의가 남은 기존 계정은 동의를 마친 뒤에 제안한다', () => {
    savePendingEmailLink({ email: TYPED });
    const view = mount(account({ compliant: false }));

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()?.email).toBe(TYPED);

    view.rerender({ current: account({ compliant: true }) });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
  });
});

describe('usePendingEmailLinkOffer — 소셜 연결 결과가 먼저다', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    router.replace.mockReset();
    socialLinkRouted = { current: false };
  });
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('소셜 연결 토큰이 대기 중이면(리졸버가 곧 결과 화면으로 보낸다) 제안하지 않고 칸을 비운다', () => {
    savePendingEmailLink({ email: TYPED });
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 600 });

    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('리졸버가 이미 결과 화면으로 보냈다면(토큰은 이미 지워졌다) 그 뒤 계정이 갱신돼도 덮어쓰지 않고 칸을 비운다', () => {
    savePendingEmailLink({ email: TYPED });
    const view = mount(undefined);

    socialLinkRouted.current = true;
    view.rerender({ current: account() });

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('이미 연결 결과 화면이 떠 있는 주소(?linkResult=)에서도 제안하지 않고 칸을 비운다', () => {
    window.history.replaceState({}, '', '/my/settings/login-methods?linkResult=linked&provider=kakao');
    savePendingEmailLink({ email: TYPED });

    mount(account());

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('연결 결과와 무관한 쿼리가 있는 화면에서는 평소처럼 제안한다', () => {
    window.history.replaceState({}, '', '/home?tab=matches');
    savePendingEmailLink({ email: TYPED });

    mount(account());

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
  });
});

describe('usePendingEmailLinkOffer — 건너뛴 이유를 알리는 한 줄', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    router.replace.mockReset();
    socialLinkRouted = { current: false };
  });
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('이메일 로그인이 이미 있는 계정으로 로그인했다면 이동 없이 그 사실을 한 줄로 알린다', async () => {
    savePendingEmailLink({ email: null });

    render(<Harness me={account({ providers: ['kakao', 'email'], email: 'owner@example.com' })} routed={socialLinkRouted} />);

    expect(await screen.findByText(ALREADY_HAS_EMAIL_LOGIN)).toBeVisible();
    // 일이 된 것이 아니라 알아 둘 사실이라 성공(초록 체크)이 아닌 정보 표시로 보인다.
    expect(document.querySelector('.lucide-info')).not.toBeNull();
    expect(document.querySelector('.lucide-check')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('로그인 수단 목록을 모르는 응답이면 이미 있다고 말할 근거가 없어 알리지 않는다', () => {
    savePendingEmailLink({ email: null });

    render(<Harness me={account({ providers: null })} routed={socialLinkRouted} />);

    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingEmailLink()).toBeNull();
    expect(screen.queryByText(ALREADY_HAS_EMAIL_LOGIN)).not.toBeInTheDocument();
  });

  it('소셜 연결 결과가 먼저인 경우에는 이메일 안내를 덧붙이지 않는다', () => {
    savePendingEmailLink({ email: null });
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 600 });

    render(<Harness me={account({ providers: ['kakao', 'email'] })} routed={socialLinkRouted} />);

    expect(screen.queryByText(ALREADY_HAS_EMAIL_LOGIN)).not.toBeInTheDocument();
    expect(readPendingEmailLink()).toBeNull();
  });

  it('보관한 것이 없으면 이미 이메일 로그인이 있는 계정에도 아무 말 없다', () => {
    render(<Harness me={account({ providers: ['kakao', 'email'] })} routed={socialLinkRouted} />);

    expect(screen.queryByText(ALREADY_HAS_EMAIL_LOGIN)).not.toBeInTheDocument();
  });
});
