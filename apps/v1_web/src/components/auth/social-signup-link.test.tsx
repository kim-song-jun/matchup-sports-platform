import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialSignupClient } from './social-signup-client';

const replace = vi.fn();
const trackEvent = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }));

const failure = (code: string, message: string, statusCode: number) =>
  HttpResponse.json({ status: 'error', statusCode, code, message }, { status: statusCode });
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });

const calls: { verify: unknown[]; preview: unknown[]; link: unknown[] } = { verify: [], preview: [], link: [] };
let authProvider = 'kakao';

const server = setupServer(
  http.get('*/api/v1/auth/me', () =>
    success({ user: { onboardingStatus: 'social_profile_required', authProvider }, socialSignupPrefill: null }),
  ),
  http.post('*/api/v1/logs/client-error', () => success({})),
  http.post('*/api/v1/verification/phone/request', () =>
    failure('PHONE_CONFLICT', '이미 다른 계정에서 사용 중인 번호예요.', 409),
  ),
  http.post('*/api/v1/auth/phone/issue', () =>
    success({ expiresAt: new Date(Date.now() + 300_000).toISOString(), devCode: '123456' }),
  ),
  http.post('*/api/v1/auth/phone/verify', async ({ request }) => {
    calls.verify.push(await request.json());
    return success({ verified: true, proofToken: 'proof-1' });
  }),
  http.post('*/api/v1/auth/social-link/preview', async ({ request }) => {
    calls.preview.push(await request.json());
    return success({ maskedEmail: 'ru***@gmail.com', providers: ['email'], hasPassword: true, linkingProvider: authProvider });
  }),
  http.post('*/api/v1/auth/social-link', async ({ request }) => {
    calls.link.push(await request.json());
    return success({ session: { userId: 'holder-1', userEmail: 'ru@gmail.com' }, user: { id: 'holder-1' } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  authProvider = 'kakao';
  calls.verify = [];
  calls.preview = [];
  calls.link = [];
  replace.mockClear();
  trackEvent.mockClear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});

async function openConflict() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SocialSignupClient />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  fireEvent.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await screen.findByText('이 번호로 가입한 계정이 있어요');
}

async function verifyOwnership() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '인증하고 기존 계정에 연결' }));
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '확인' }));
  return user;
}

describe('소셜 가입 번호 충돌 → 기존 계정 연결', () => {
  it('PHONE_CONFLICT 이면 연결 안내를 보여 주고 로그인/계정 찾기 출구는 숨긴다', async () => {
    await openConflict();

    expect(screen.getByText('번호를 인증하면 지금 카카오 로그인을 그 계정에 연결해서 바로 들어갈 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다른 번호로 가입할게요' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '기존 계정으로 로그인' })).not.toBeInTheDocument();
  });

  it('Apple 가입이면 문구가 Apple 로 바뀐다', async () => {
    authProvider = 'apple';
    await openConflict();

    expect(screen.getByText(/지금 Apple 로그인을 그 계정에 연결/)).toBeInTheDocument();
  });

  it('연결할 수 없는 신원(네이버 등)은 기존 로그인/계정 찾기 안내를 그대로 쓴다', async () => {
    authProvider = 'naver';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SocialSignupClient />
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
    fireEvent.click(await screen.findByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '인증하고 기존 계정에 연결' })).not.toBeInTheDocument();
  });

  it('발급 → social_link 인증 → 미리보기 → 확인 → 연결 → 이동까지 간다', async () => {
    await openConflict();
    const user = await verifyOwnership();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('이 계정에 카카오 로그인을 연결할까요?')).toBeInTheDocument();
    expect(within(dialog).getByText('ru***@gmail.com · 이메일로 가입')).toBeInTheDocument();
    expect(within(dialog).getByText('연결하면 지금 만든 빈 계정은 지워지고, 다음부터 카카오로 바로 로그인돼요.')).toBeInTheDocument();
    expect(calls.verify).toEqual([{ phone: '01012345678', code: '123456', purpose: 'social_link' }]);
    expect(calls.preview).toEqual([{ phone: '01012345678', proofToken: 'proof-1' }]);

    await user.click(within(dialog).getByRole('button', { name: '연결하고 로그인' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
    expect(calls.link).toEqual([{ phone: '01012345678', proofToken: 'proof-1' }]);
    expect(trackEvent).toHaveBeenCalledWith('social_account_linked', { provider: 'kakao' });
    // The server switched the cookie to the existing account; the stored session must follow it.
    expect(window.localStorage.getItem('teameet.v1.userId')).toBe('holder-1');
  });

  it('서버가 next 를 주면 그 경로로 이동한다', async () => {
    server.use(
      http.post('*/api/v1/auth/social-link', () =>
        success({ session: { userId: 'holder-1', userEmail: null }, user: { id: 'holder-1' }, next: { route: '/onboarding' } }),
      ),
    );
    await openConflict();
    const user = await verifyOwnership();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '연결하고 로그인' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
  });

  it('이메일 없는 카카오 가입 계정은 가입 방법 라벨과 함께 표시된다', async () => {
    server.use(
      http.post('*/api/v1/auth/social-link/preview', () =>
        success({ maskedEmail: null, providers: ['kakao'], hasPassword: false, linkingProvider: 'apple' }),
      ),
    );
    authProvider = 'apple';
    await openConflict();
    await verifyOwnership();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('이메일 없는 계정 · 카카오로 가입')).toBeInTheDocument();
    expect(within(dialog).getByText('이 계정에 Apple 로그인을 연결할까요?')).toBeInTheDocument();
  });

  it('취소하면 연결 없이 가입 폼에 머문다', async () => {
    await openConflict();
    const user = await verifyOwnership();

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.link).toHaveLength(0);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('휴대폰 번호')).toHaveValue('010-1234-5678');
    expect(screen.getByRole('button', { name: '기존 계정에 연결' })).toBeEnabled();
  });

  it('"다른 번호로 가입할게요" 는 번호를 비우고 연결 안내를 닫는다', async () => {
    await openConflict();

    await userEvent.setup().click(screen.getByRole('button', { name: '다른 번호로 가입할게요' }));

    expect(screen.getByLabelText('휴대폰 번호')).toHaveValue('');
    expect(screen.queryByText('이 번호로 가입한 계정이 있어요')).not.toBeInTheDocument();
  });

  it('연결 중 PROVIDER_EXISTS 면 안내와 로그인/계정 찾기 출구를 보여 준다', async () => {
    server.use(
      http.post('*/api/v1/auth/social-link', () => failure('SOCIAL_LINK_PROVIDER_EXISTS', 'x', 409)),
    );
    await openConflict();
    const user = await verifyOwnership();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '연결하고 로그인' }));

    expect(await screen.findByText('이미 같은 종류의 소셜 로그인이 연결된 계정이에요. 그 계정으로 로그인해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '계정 찾기' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '기존 계정에 연결' })).not.toBeInTheDocument();
  });

  it('기존 계정 번호가 인증된 적 없으면(미리보기 409) 연결 없이 로그인/계정 찾기 출구를 보여 준다', async () => {
    server.use(
      http.post('*/api/v1/auth/social-link/preview', () => failure('SOCIAL_LINK_PHONE_UNVERIFIED', 'x', 409)),
    );
    await openConflict();
    await verifyOwnership();

    expect(
      await screen.findByText('기존 계정에서 인증되지 않은 번호라 연결할 수 없어요. 처음 가입한 방법으로 로그인해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기존 계정으로 로그인' })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.link).toEqual([]);
  });

  it.each([
    ['SOCIAL_LINK_ADMIN_FORBIDDEN', '이 계정은 이 방법으로 연결할 수 없어요. 고객센터로 문의해 주세요.'],
    ['SOCIAL_LINK_ACCOUNT_NOT_EMPTY', '이미 활동 기록이 있는 계정이라 연결할 수 없어요. 고객센터로 문의해 주세요.'],
    ['ACCOUNT_WITHDRAWAL_PENDING', '탈퇴를 진행 중인 계정이라 연결할 수 없어요.'],
    ['ACCOUNT_NOT_FOUND', '이 번호로 가입된 계정을 찾지 못했어요.'],
    ['SOCIAL_SIGNUP_EXPIRED', '가입 가능 시간이 지났어요. 카카오 로그인부터 다시 시작해 주세요.'],
    ['SOCIAL_LINK_NOT_PENDING', '계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'],
    ['SOCIAL_LINK_CONFLICT', '계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'],
    ['SOCIAL_LINK_SAME_ACCOUNT', '계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ])('미리보기에서 %s 면 해요체 안내를 인라인으로 보여 준다', async (code, message) => {
    server.use(http.post('*/api/v1/auth/social-link/preview', () => failure(code, 'server text', 409)));
    await openConflict();
    await verifyOwnership();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.link).toHaveLength(0);
  });

  it('연결 단계의 ACCOUNT_NOT_EMPTY 는 다시 시도해도 같아서 재시도 버튼을 남기지 않는다', async () => {
    server.use(http.post('*/api/v1/auth/social-link', () => failure('SOCIAL_LINK_ACCOUNT_NOT_EMPTY', 'x', 409)));
    await openConflict();
    const user = await verifyOwnership();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '연결하고 로그인' }));

    expect(await screen.findByText('이미 활동 기록이 있는 계정이라 연결할 수 없어요. 고객센터로 문의해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 계정에 연결' })).not.toBeInTheDocument();
  });

  it('연결 단계에서 PHONE_NOT_VERIFIED 면 인증을 처음부터 다시 시작하게 한다', async () => {
    server.use(http.post('*/api/v1/auth/social-link', () => failure('PHONE_NOT_VERIFIED', 'x', 400)));
    await openConflict();
    const user = await verifyOwnership();
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '연결하고 로그인' }));

    expect(await screen.findByText('휴대폰 본인인증이 만료됐어요. 인증번호를 다시 받아 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('미리보기가 일시적으로 실패하면 같은 증명으로 다시 확인해 연결까지 이어 간다', async () => {
    server.use(
      http.post('*/api/v1/auth/social-link/preview', () => failure('INTERNAL_ERROR', 'boom', 503), { once: true }),
    );
    await openConflict();
    const user = await verifyOwnership();

    await user.click(await screen.findByRole('button', { name: '계정 다시 확인' }));

    const dialog = await screen.findByRole('dialog');
    expect(calls.preview).toEqual([{ phone: '01012345678', proofToken: 'proof-1' }]);
    expect(calls.verify).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: '연결하고 로그인' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
  });

  it('미리보기가 되돌릴 수 없는 이유로 실패하면 다시 확인 버튼을 주지 않는다', async () => {
    server.use(http.post('*/api/v1/auth/social-link/preview', () => failure('ACCOUNT_NOT_FOUND', 'x', 404)));
    await openConflict();
    await verifyOwnership();

    await screen.findByText('이 번호로 가입된 계정을 찾지 못했어요.');
    expect(screen.queryByRole('button', { name: '계정 다시 확인' })).not.toBeInTheDocument();
  });
});
