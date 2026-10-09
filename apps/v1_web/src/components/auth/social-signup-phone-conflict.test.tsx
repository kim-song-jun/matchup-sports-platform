import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialSignupClient } from './social-signup-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const calls = { logout: 0 };
const failure = (code: string, message: string, statusCode: number) =>
  HttpResponse.json({ status: 'error', statusCode, code, message }, { status: statusCode });

const server = setupServer(
  http.get('*/api/v1/auth/me', () =>
    HttpResponse.json({ status: 'success', data: { user: { onboardingStatus: 'social_profile_required' }, socialSignupPrefill: null } }),
  ),
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
  http.post('*/api/v1/auth/logout', () => {
    calls.logout += 1;
    return HttpResponse.json({ status: 'success', data: { ok: true } });
  }),
);

const replace = vi.fn();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  calls.logout = 0;
  replace.mockClear();
  // jsdom 은 하드 내비게이션을 지원하지 않아 location.replace 만 가로챈다.
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, replace } });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

async function requestPhoneCode() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SocialSignupClient />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  fireEvent.click(await screen.findByRole('button', { name: '인증번호 받기' }));
}

describe('소셜 가입 휴대폰 인증 번호 중복', () => {
  it('PHONE_CONFLICT 이면 오류 문구 대신 안내와 두 출구를 보여 준다', async () => {
    server.use(
      http.post('*/api/v1/verification/phone/request', () =>
        failure('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409),
      ),
    );

    await requestPhoneCode();

    expect(await screen.findByText(/이 번호로 이미 가입한 계정이 있어요/)).toBeInTheDocument();
    expect(screen.queryByText('이미 다른 계정에서 사용 중인 번호예요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '계정 찾기' })).toBeEnabled();
  });

  it.each([
    ['기존 계정으로 로그인', '/login'],
    ['계정 찾기', '/auth/find-account'],
  ])('%s 를 누르면 미완료 세션을 로그아웃한 뒤 %s 로 이동한다', async (label, path) => {
    server.use(
      http.post('*/api/v1/verification/phone/request', () =>
        failure('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409),
      ),
    );
    await requestPhoneCode();

    await userEvent.setup().click(await screen.findByRole('button', { name: label }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(path));
    expect(calls.logout).toBe(1);
  });

  it('로그아웃이 실패하면 이동하지 않고 알린다', async () => {
    server.use(
      http.post('*/api/v1/verification/phone/request', () =>
        failure('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409),
      ),
      http.post('*/api/v1/auth/logout', () => failure('INTERNAL_ERROR', 'x', 500)),
    );
    await requestPhoneCode();

    await userEvent.setup().click(await screen.findByRole('button', { name: '계정 찾기' }));

    expect(await screen.findByText('가입 취소를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('다른 오류는 기존 문구 그대로 보이고 출구 버튼은 없다', async () => {
    server.use(
      http.post('*/api/v1/verification/phone/request', () =>
        failure('VERIFICATION_RESEND_COOLDOWN', '조금 뒤에 다시 요청해 주세요.', 429),
      ),
    );

    await requestPhoneCode();

    expect(await screen.findByText('조금 뒤에 다시 요청해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 계정으로 로그인' })).not.toBeInTheDocument();
  });
});
