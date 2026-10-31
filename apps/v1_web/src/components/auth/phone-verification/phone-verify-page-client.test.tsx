import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhoneVerifyPageClient } from './phone-verify-page-client';
import * as api from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';

const TIMESTAMP = '2026-10-31T00:00:00.000Z';
const nav = vi.hoisted(() => ({ search: '' }));
const push = vi.hoisted(() => ({ unsubscribe: vi.fn() }));

vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: () => ({ unsubscribe: push.unsubscribe }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/my/phone-verify',
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function authMe(phone: string | null) {
  return {
    data: { user: { phone }, verification: { phoneVerified: false } },
    isLoading: false,
    isPending: false,
  } as never;
}

beforeEach(() => {
  nav.search = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PhoneVerifyPageClient — 인증 대상 번호 확인·수정', () => {
  it('계정에 저장된 번호를 화면에 보여준다 — 어느 번호로 문자가 가는지 알 수 있어야 한다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    expect(screen.getByText('인증번호를 받을 번호')).toBeInTheDocument();
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
  });

  it('저장된 번호가 틀렸을 때 이 화면에서 고쳐 그 번호로 인증번호를 받는다', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: requestMock, isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '인증받을 휴대폰 번호 수정' }));

    const input = screen.getByLabelText('휴대폰 번호');
    fireEvent.change(input, { target: { value: '010-9876-5432' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });

    // 프로필로 가지 않고도 수정한 번호로 발송돼야 한다(서버가 확정 시 user.phone 을 갱신한다).
    expect(requestMock).toHaveBeenCalledWith({ phone: '01098765432' });
  });

  it('번호를 고치다 마음이 바뀌면 기존 번호로 되돌릴 수 있다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '인증받을 휴대폰 번호 수정' }));
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '010-9876-5432' } });
    fireEvent.click(screen.getByRole('button', { name: '기존 번호로 되돌리기' }));

    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
  });

  it('authMe 로딩 중에는 번호 UI를 렌더하지 않는다 — 빈 입력칸에 친 값이 저장된 번호로 덮이는 것을 막는다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue({ data: undefined, isLoading: true, isPending: true } as never);
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
    expect(screen.queryByText('인증번호를 받을 번호')).not.toBeInTheDocument();
    expect(screen.getByText('계정 정보를 불러오는 중이에요.')).toBeInTheDocument();
  });

  it('계정에 번호가 없으면 입력칸을 바로 연다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe(null));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
    expect(screen.queryByText('인증번호를 받을 번호')).not.toBeInTheDocument();
  });
});

describe('PhoneVerifyPageClient — 번호가 다른 계정에 있을 때', () => {
  const replace = vi.fn();
  const logout = vi.fn();

  const originalLocation = window.location;

  beforeEach(() => {
    replace.mockReset();
    logout.mockReset().mockResolvedValue({ ok: true });
    push.unsubscribe.mockReset().mockResolvedValue(true);
    // jsdom 은 하드 내비게이션을 지원하지 않아 location.replace 만 가로챈다.
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, replace } });
    vi.spyOn(api, 'useV1Logout').mockReturnValue({ mutateAsync: logout, isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  async function requestCodeFailingWith(code: string, message: string, statusCode: number) {
    const requestMock = vi.fn().mockRejectedValue(new V1ApiError({ status: 'error', statusCode, code, message, timestamp: TIMESTAMP }));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: requestMock, isPending: false } as never);
    wrap(<PhoneVerifyPageClient />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
  }

  it('PHONE_CONFLICT 이면 출구 없는 오류 문구 대신 안내와 두 출구를 보여 준다', async () => {
    await requestCodeFailingWith('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409);

    expect(screen.getByText(/이 번호로 이미 가입한 계정이 있어요/)).toBeInTheDocument();
    expect(screen.queryByText('이미 다른 계정에서 사용 중인 번호예요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '계정 찾기' })).toBeEnabled();
  });

  it.each([
    ['기존 계정으로 로그인', '/login'],
    ['계정 찾기', '/auth/find-account'],
  ])('%s 를 누르면 로그아웃한 뒤 %s 로 이동한다 — 로그인한 채로는 /login 이 홈으로 되돌려 보낸다', async (label, path) => {
    await requestCodeFailingWith('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: label }));
    });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(path);
  });

  it('로그아웃되기 전에 이 기기의 푸시 등록부터 해지한다 — 로그인한 완성 계정이라 등록이 있을 수 있다', async () => {
    await requestCodeFailingWith('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '기존 계정으로 로그인' }));
    });

    expect(push.unsubscribe).toHaveBeenCalledWith({ reason: 'sign-out' });
    expect(push.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(logout.mock.invocationCallOrder[0]);
  });

  it('버튼을 누르면 지금 계정에서 로그아웃된다는 것을 미리 알린다', async () => {
    await requestCodeFailingWith('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409);

    expect(screen.getByText('버튼을 누르면 지금 계정에서 로그아웃돼요.')).toBeInTheDocument();
  });

  it('막혀서 넘어온 화면의 redirect 를 이동 경로에 이어 붙인다', async () => {
    nav.search = 'redirect=%2Ftournaments%2Fabc%2Fapply';
    await requestCodeFailingWith('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '기존 계정으로 로그인' }));
    });

    expect(replace).toHaveBeenCalledWith('/login?redirect=%2Ftournaments%2Fabc%2Fapply');
  });

  it('로그아웃이 실패하면 이동하지 않고 알린다', async () => {
    logout.mockRejectedValue(new V1ApiError({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: '서버 오류', timestamp: TIMESTAMP }));
    await requestCodeFailingWith('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '계정 찾기' }));
    });

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });

  it('다른 오류는 기존 문구 그대로 보이고 출구 버튼은 없다', async () => {
    await requestCodeFailingWith('VERIFICATION_RESEND_COOLDOWN', '조금 뒤에 다시 요청해 주세요.', 429);

    expect(screen.getByText('조금 뒤에 다시 요청해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 계정으로 로그인' })).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});
