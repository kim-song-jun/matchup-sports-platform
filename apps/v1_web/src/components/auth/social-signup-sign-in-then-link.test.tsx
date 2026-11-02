import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingSocialLink, peekPendingSocialLink, savePendingSocialLink } from '@/lib/pending-social-link';
import { PENDING_LINK_MSW, PHONE_CONFLICT_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import type { V1SignInThenLinkDetails } from '@/types/api';
import { SocialSignupClient } from './social-signup-client';
import { advanceSocialSignupToPhone } from './social-signup-test-steps';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

// 쓸 수 있는 대기 토큰의 값(없거나 만료 표식이면 null).
const pendingToken = () => {
  const read = peekPendingSocialLink();
  return read && !read.expired ? read.linkToken : null;
};

type Provider = 'kakao' | 'apple';
let provider: Provider = 'kakao';
const prefillPhone = () => PHONE_CONFLICT_MSW.phones[provider];
// 로그아웃 요청이 서버에 닿은 시점과 하드 이동 시점의 대기 연결 토큰을 기록해 "정리 뒤에 저장"을 확인한다.
const seen = { logout: 0, tokenAtLogout: undefined as string | null | undefined, tokenAtLeave: undefined as string | null | undefined, left: [] as string[] };
const replace = vi.fn((path: string) => {
  seen.left.push(path);
  seen.tokenAtLeave = pendingToken();
});

const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const STALE_TOKEN: V1SignInThenLinkDetails = { next: 'sign_in_then_link', provider: 'apple', linkToken: 'stale-token-left-by-previous-person', linkTokenExpiresInSeconds: 600 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  provider = 'kakao';
  seen.logout = 0; seen.tokenAtLogout = undefined; seen.tokenAtLeave = undefined; seen.left = [];
  replace.mockClear();
  window.sessionStorage.clear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: '', replace } });
  server.use(
    http.get('*/api/v1/auth/check-nickname', () => success({ available: true })),
    http.get('*/api/v1/auth/me', () => success({
      user: { id: 'pending-user', email: null, phone: null, accountStatus: 'active', onboardingStatus: 'social_profile_required', authProvider: provider },
      profile: { displayName: '가입중회원', nickname: '가입중회원' },
      verification: { emailVerified: false, phoneVerified: false },
      socialSignupPrefill: null,
    })),
    http.post('*/api/v1/logs/client-error', () => success({})),
    http.post('*/api/v1/auth/logout', () => {
      seen.logout += 1;
      seen.tokenAtLogout = pendingToken();
      return success({ ok: true });
    }),
  );
});
afterEach(() => { cleanup(); clearPendingSocialLink(); server.resetHandlers(); });

function renderSignup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SocialSignupClient /></QueryClientProvider>);
}

// 번호 인증: 요청은 일반 요청처럼 성공하고, 인증번호를 맞춘 뒤(confirm)에야 번호 주인이 있다는 409 가 온다.
async function confirmConflictingCode(code: string = PHONE_CONFLICT_MSW.codes[provider]) {
  renderSignup();
  await advanceSocialSignupToPhone();
  fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  await userEvent.setup().click(await screen.findByRole('button', { name: '인증번호 받기' }));
  fireEvent.change(await screen.findByLabelText('인증번호 6자리'), { target: { value: code } });
  await userEvent.setup().click(screen.getByRole('button', { name: '확인' }));
}

describe('소셜 가입 중 번호 중복 — 원래 계정으로 로그인하면 자동 연결', () => {
  it('번호 인증을 맞춘 뒤에야 안내가 뜨고, 로그인하면 자동 연결된다고 약속한다', async () => {
    await confirmConflictingCode();

    expect(await screen.findByText(/이미 팀밋 계정이 있어요\. 30분 안에 원래 방법으로 로그인하면 카카오 로그인 연결을 시도해요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '원래 방법으로 로그인하기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '계정 찾기' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '기존 계정으로 로그인' })).not.toBeInTheDocument();
    expect(screen.queryByText('이미 다른 계정에서 사용 중인 번호예요.')).not.toBeInTheDocument();
  });

  it('Apple 가입 중이면 Apple 로그인이 연결된다고 안내한다', async () => {
    provider = 'apple';
    await confirmConflictingCode();
    expect(await screen.findByText(/30분 안에 원래 방법으로 로그인하면 Apple 로그인 연결을 시도해요/)).toBeInTheDocument();
  });

  it('번호 인증을 요청하는 단계에서는 번호 주인 여부를 알리지 않는다', async () => {
    renderSignup();
    await advanceSocialSignupToPhone();
    fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
    await userEvent.setup().click(await screen.findByRole('button', { name: '인증번호 받기' }));
    expect(await screen.findByLabelText('인증번호 6자리')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원래 방법으로 로그인하기' })).not.toBeInTheDocument();
    expect(screen.queryByText(/이미 팀밋 계정이 있어요/)).not.toBeInTheDocument();
  });

  it('로그인을 누르면 가입 그만두기를 확인하고, 로그아웃이 끝난 뒤에 연결 토큰을 저장한 채 로그인 화면으로 간다', async () => {
    savePendingSocialLink(STALE_TOKEN);
    await confirmConflictingCode();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '원래 방법으로 로그인하기' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('가입을 그만두고 로그인할까요?')).toBeInTheDocument();
    expect(within(dialog).getByText(/30분 안에 원래 방법으로 로그인하면 카카오 로그인 연결을 시도해요/)).toBeInTheDocument();
    expect(seen.logout).toBe(0);
    await user.click(within(dialog).getByRole('button', { name: '로그인하러 가기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(seen.logout).toBe(1);
    // 로그아웃 시점에는 새 토큰이 아직 없고, 이동 시점에는 정리를 이겨낸 새 토큰만 있다.
    expect(seen.tokenAtLogout).not.toBe(PENDING_LINK_MSW.tokens.kakao);
    expect(seen.tokenAtLeave).toBe(PENDING_LINK_MSW.tokens.kakao);
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao, provider: 'kakao' });
  });

  it('확인 창에서 취소하면 로그아웃도 토큰 저장도 하지 않고 가입 화면에 남는다', async () => {
    await confirmConflictingCode();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '원래 방법으로 로그인하기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(seen.logout).toBe(0);
    expect(replace).not.toHaveBeenCalled();
    expect(peekPendingSocialLink()).toBeNull();
    expect(screen.getByRole('button', { name: '원래 방법으로 로그인하기' })).toBeEnabled();
  });

  it('계정 찾기는 확인 없이 로그아웃하고 같은 토큰을 저장한 채 이동한다', async () => {
    await confirmConflictingCode();

    await userEvent.setup().click(await screen.findByRole('button', { name: '계정 찾기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/find-account'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(seen.tokenAtLeave).toBe(PENDING_LINK_MSW.tokens.kakao);
  });

  it('돌아갈 경로를 로그인 화면에 실어 보낸다', async () => {
    window.location.search = '?redirect=%2Fteams%2Fnew';
    await confirmConflictingCode();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '원래 방법으로 로그인하기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '로그인하러 가기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fteams%2Fnew'));
  });

  it('로그아웃이 실패하면 이동하지 않고 알리며 토큰도 남기지 않는다', async () => {
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.json({ status: 'error', statusCode: 503, code: 'INTERNAL_ERROR', message: 'x' }, { status: 503 })));
    await confirmConflictingCode();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '원래 방법으로 로그인하기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '로그인하러 가기' }));

    expect(await screen.findByText('가입 취소를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('원래 방법으로 로그인하기 뒤에도, 번호를 새로 받았다면 고객센터에 알려 달라는 한 줄이 붙는다', async () => {
    await confirmConflictingCode();

    const lastExit = await screen.findByRole('button', { name: '계정 찾기' });
    const help = screen.getByRole('link', { name: '고객센터에 알려 주세요' });
    expect(help).toHaveAttribute('href', '/contact');
    expect(lastExit.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // 서버가 연결 토큰 없이 충돌만 알리면 자동 연결을 약속하지 않고 기본 안내와 출구를 쓴다.
  it('연결 토큰이 없는 번호 중복은 자동 연결을 약속하지 않는 기본 안내다', async () => {
    server.use(http.post('*/api/v1/verification/phone/confirm', () => HttpResponse.json({
      status: 'error', statusCode: 409, code: 'PHONE_CONFLICT', message: '이미 다른 계정에서 사용 중인 번호예요.',
      details: { next: 'sign_in_then_link', provider: 'kakao' },
    }, { status: 409 })));
    await confirmConflictingCode('123456');

    expect(await screen.findByText(/이 번호로 이미 가입한 계정이 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/자동으로 연결돼요/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '기존 계정으로 로그인' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(seen.tokenAtLeave).toBeNull();
  });

  it('다른 번호 오류(인증번호 불일치)는 번호 중복 안내로 바뀌지 않는다', async () => {
    server.use(http.post('*/api/v1/verification/phone/confirm', () => HttpResponse.json({
      status: 'error', statusCode: 400, code: 'VERIFICATION_CODE_INVALID', message: '인증번호가 올바르지 않아요.',
    }, { status: 400 })));
    await confirmConflictingCode('000000');
    expect(await screen.findByText('인증번호가 올바르지 않아요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원래 방법으로 로그인하기' })).not.toBeInTheDocument();
  });
});

describe('소셜 가입 중 번호를 쥔 계정이 탈퇴 유예 중일 때', () => {
  // KST 로는 11월 7일 00:30. 읽을 때 지났는지도 보므로 시계를 고정한다.
  const UNTIL = '2026-11-06T15:30:00.000Z';
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());
  const withdrawalConflict = (withdrawalPendingUntil: string | null) => server.use(
    http.post('*/api/v1/verification/phone/confirm', () => HttpResponse.json({
      status: 'error', statusCode: 409, code: 'PHONE_CONFLICT', message: '이미 다른 계정에서 사용 중인 번호예요.',
      details: {
        next: 'sign_in_then_link', provider: 'kakao', linkToken: PENDING_LINK_MSW.tokens.kakao,
        linkTokenExpiresInSeconds: PENDING_LINK_MSW.expiresInSeconds, withdrawalPendingUntil,
      },
    }, { status: 409 })),
  );

  it('"로그인하면 자동 연결" 대신 탈퇴 취소 안내로 바뀌고, 버튼은 두 가지 방법을 보여 주는 안내 화면으로 이어진다', async () => {
    withdrawalConflict(UNTIL);
    await confirmConflictingCode('123456');

    expect(await screen.findByText('이미 팀밋 계정이 있지만 탈퇴를 신청한 상태예요. 취소하고 다시 쓰는 방법을 안내해 드려요.')).toBeInTheDocument();
    expect(screen.queryByText(/자동으로 연결돼요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '원래 방법으로 로그인하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 쓰는 방법 보기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '계정 찾기' })).toBeEnabled();
    // 이 흐름이 이어지는 안내 화면에 자기 문구의 고객센터 링크가 있다.
    expect(screen.queryByText(/번호를 최근에 새로 받았나요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '고객센터에 알려 주세요' })).not.toBeInTheDocument();
  });

  it('확인 창이 탈퇴 취소를 거친다고 약속하고, 로그아웃 뒤 날짜를 실은 토큰을 저장한 채 안내 화면(돌아갈 경로 포함)으로 간다', async () => {
    window.location.search = '?redirect=%2Fteams%2Fnew';
    withdrawalConflict(UNTIL);
    await confirmConflictingCode('123456');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '다시 쓰는 방법 보기' }));
    const dialog = await screen.findByRole('dialog');
    // 확인 창의 제목·버튼도 도착지(두 가지 방법을 보여 주는 안내)와 같은 말이다.
    expect(within(dialog).getByText('가입을 그만두고 다시 쓰는 방법을 볼까요?')).toBeInTheDocument();
    expect(within(dialog).getByText(/30분 안에 원래 방법으로 로그인하고 탈퇴 신청을 취소하면 카카오 로그인 연결을 시도해요/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '로그인하러 가기' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '다시 쓰는 방법 보기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao&redirect=%2Fteams%2Fnew'));
    expect(seen.logout).toBe(1);
    expect(seen.tokenAtLeave).toBe(PENDING_LINK_MSW.tokens.kakao);
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao, withdrawalPendingUntil: UNTIL });
  });

  it('날짜를 모르는 탈퇴 유예(null)도 같은 안내로 가고 null 을 그대로 저장한다', async () => {
    withdrawalConflict(null);
    await confirmConflictingCode('123456');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '다시 쓰는 방법 보기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 쓰는 방법 보기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao'));
    expect(peekPendingSocialLink()).toHaveProperty('withdrawalPendingUntil', null);
  });

  it('이미 지난 유예 종료 시각은 날짜만 모르는 것(null)으로 보관하고 같은 안내로 간다', async () => {
    withdrawalConflict('2026-10-30T00:00:00.000Z');
    await confirmConflictingCode('123456');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '다시 쓰는 방법 보기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '다시 쓰는 방법 보기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao'));
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao, withdrawalPendingUntil: null });
  });

  it('계정 찾기는 기존처럼 확인 없이 계정 찾기로 나간다', async () => {
    withdrawalConflict(UNTIL);
    await confirmConflictingCode('123456');

    await userEvent.setup().click(await screen.findByRole('button', { name: '계정 찾기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/find-account'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('탈퇴 계정이 아닌 일반 충돌은 지금처럼 로그인 화면으로 간다', async () => {
    await confirmConflictingCode();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '원래 방법으로 로그인하기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '로그인하러 가기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(peekPendingSocialLink()).not.toHaveProperty('withdrawalPendingUntil');
  });
});

describe('소셜 가입 제출에서 번호 중복이 드러난 경우', () => {
  // 카카오가 준 번호가 아니라 직접 입력한 번호면 서버는 연결 토큰 없이 충돌만 알린다 — 연결을 약속하지 않는다.
  it('토큰 없는 프로필 제출 409 는 기존 로그인·계정 찾기 출구만 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => success({
        user: { id: 'pending-user', email: null, phone: null, accountStatus: 'active', onboardingStatus: 'social_profile_required', authProvider: 'kakao' },
        profile: { displayName: '가입중회원', nickname: '가입중회원' },
        verification: { emailVerified: false, phoneVerified: false },
        socialSignupPrefill: { name: '김러너', phone: PHONE_CONFLICT_MSW.phones.kakao, gender: 'female', birthDate: '20000229' },
      })),
      http.get('*/api/v1/auth/check-nickname', () => success({ available: true })),
      http.post('*/api/v1/auth/social-profile', () => HttpResponse.json({
        status: 'error', statusCode: 409, code: 'PHONE_CONFLICT', message: '이미 다른 계정에서 사용 중인 번호예요.',
        details: { next: 'sign_in_then_link', provider: 'kakao' },
      }, { status: 409 })),
    );
    renderSignup();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('닉네임'), { target: { value: '카카오러너' } });
    await user.click(screen.getByRole('button', { name: '중복 확인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '다음' }));
    const submit = await screen.findByRole('button', { name: '확인하고 계속' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await screen.findByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.queryByText(/자동으로 연결돼요/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '기존 계정으로 로그인' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(seen.tokenAtLeave).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('프로필 제출의 409 도 같은 안내와 같은 출구를 쓴다', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () => success({
        user: { id: 'pending-user', email: null, phone: null, accountStatus: 'active', onboardingStatus: 'social_profile_required', authProvider: 'kakao' },
        profile: { displayName: '가입중회원', nickname: '가입중회원' },
        verification: { emailVerified: false, phoneVerified: false },
        // 카카오가 준 번호는 추가 인증 없이 쓰므로 인증번호 단계 없이 제출 단계에서 충돌을 만난다.
        socialSignupPrefill: { name: '김러너', phone: PHONE_CONFLICT_MSW.phones.kakao, gender: 'female', birthDate: '20000229' },
      })),
      http.get('*/api/v1/auth/check-nickname', () => success({ available: true })),
    );
    renderSignup();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('닉네임'), { target: { value: '카카오러너' } });
    await user.click(screen.getByRole('button', { name: '중복 확인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '다음' }));
    const submit = await screen.findByRole('button', { name: '확인하고 계속' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await screen.findByText(/30분 안에 원래 방법으로 로그인하면 카카오 로그인 연결을 시도해요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '계정 찾기' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/find-account'));
    expect(seen.tokenAtLeave).toBe(PENDING_LINK_MSW.tokens.kakao);
  });
});

describe('새 계정의 소셜 가입이 끝나면 대기 연결 토큰을 지운다', () => {
  const meWithPrefill = (phone: string) => http.get('*/api/v1/auth/me', () => success({
    user: { id: 'pending-user', email: null, phone: null, accountStatus: 'active', onboardingStatus: 'social_profile_required', authProvider: 'kakao' },
    profile: { displayName: '가입중회원', nickname: '가입중회원' },
    verification: { emailVerified: false, phoneVerified: false },
    socialSignupPrefill: { name: '김러너', phone, gender: 'female', birthDate: '20000229' },
  }));
  const sessionResponse = () => success({
    user: { id: 'pending-user', email: null, onboardingStatus: 'social_profile_required' },
    profile: { displayName: '김러너' },
    session: { userId: 'pending-user', userEmail: null },
    next: { route: '/onboarding/sport' },
  });

  it('프로필 제출이 성공하면 앞서 안내받은 계정용 토큰이 남지 않는다', async () => {
    savePendingSocialLink(STALE_TOKEN);
    server.use(
      meWithPrefill('01012345678'),
      http.get('*/api/v1/auth/check-nickname', () => success({ available: true })),
      http.post('*/api/v1/auth/social-profile', sessionResponse),
    );
    renderSignup();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('닉네임'), { target: { value: '카카오러너' } });
    await user.click(screen.getByRole('button', { name: '중복 확인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '다음' }));
    const submit = await screen.findByRole('button', { name: '확인하고 계속' });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(peekPendingSocialLink()).not.toBeNull();

    await user.click(submit);

    await waitFor(() => expect(peekPendingSocialLink()).toBeNull());
  });

  it('나중에 입력할게요가 성공해도 토큰이 남지 않는다', async () => {
    savePendingSocialLink(STALE_TOKEN);
    server.use(meWithPrefill('01012345678'), http.post('*/api/v1/auth/social-profile/defer', sessionResponse));
    renderSignup();

    await userEvent.setup().click(await screen.findByRole('button', { name: '나중에 입력할게요' }));

    await waitFor(() => expect(peekPendingSocialLink()).toBeNull());
  });

  // 번호 중복 출구가 방금 저장한 토큰은 이 지움과 부딪히지 않는다 — 출구는 로그아웃 뒤에 저장하고 가입 완료 경로를 거치지 않는다.
  it('가입 완료 경로의 삭제는 번호 중복 출구가 저장한 새 토큰을 건드리지 않는다', async () => {
    await confirmConflictingCode();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '계정 찾기' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/find-account'));
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
  });
});

describe('토큰을 보관할 수 없는 브라우저', () => {
  afterEach(() => vi.restoreAllMocks());

  it('확인 창이 자동 연결 대신 설정에서 직접 연결하라고 안내하고, 로그아웃과 이동은 그대로 진행한다', async () => {
    await confirmConflictingCode();
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(this: Storage, key: string, value: string) {
      if (key.includes('storage_probe')) throw new DOMException('quota', 'QuotaExceededError');
      original.call(this, key, value);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '원래 방법으로 로그인하기' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/설정의 "로그인 방법"에서 카카오 로그인을 연결해 주세요/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/자동으로 연결돼요/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '로그인하러 가기' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(seen.logout).toBe(1);
    expect(seen.tokenAtLeave).toBeNull();
  });
});
