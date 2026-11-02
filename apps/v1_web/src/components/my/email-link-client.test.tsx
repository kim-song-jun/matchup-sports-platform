import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { EMAIL_LINK_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import { EmailLinkClient } from './email-link-client';

const nav = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
  params: new URLSearchParams(),
}));
const signOut = vi.hoisted(() => ({
  signOutAndLeave: vi.fn(),
  pending: false,
  error: null as string | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/settings/login-methods/email',
  useRouter: () => nav.router,
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/auth/use-sign-out-and-leave', () => ({ useSignOutAndLeave: () => signOut }));

const PASSWORD = 'synthetic-pass-1234';
const LOGIN_METHODS_PATH = '/my/settings/login-methods';
const EMAIL_STEP = '이메일을 입력해 주세요';
const CODE_STEP = '인증번호를 입력해 주세요';
const PASSWORD_STEP = '비밀번호를 정해 주세요';

type Calls = { request: Array<{ email: string }>; verify: Array<{ code: string }>; complete: Array<Record<string, string>> };
let calls: Calls;
let client: QueryClient;

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  window.sessionStorage.clear();
  window.localStorage.clear();
  signOut.pending = false;
  signOut.error = null;
  calls = { request: [], verify: [], complete: [] };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(
    http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
    // 공유 핸들러가 응답을 정하고, 이 화면이 실제로 어떤 본문을 보냈는지만 옆에서 기록한다.
    http.post('*/api/v1/auth/link/email/request', async ({ request }) => {
      calls.request.push((await request.clone().json()) as { email: string });
      return undefined;
    }),
    http.post('*/api/v1/auth/link/email/verify', async ({ request }) => {
      calls.verify.push((await request.clone().json()) as { code: string });
      return undefined;
    }),
    http.post('*/api/v1/auth/link/email/complete', async ({ request }) => {
      calls.complete.push((await request.clone().json()) as Record<string, string>);
      return undefined;
    }),
  );
});
afterEach(() => server.resetHandlers());

function failure(statusCode: number, code: string, message: string) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message, details: null, timestamp: '2026-11-01T00:00:00.000Z' },
    { status: statusCode },
  );
}

function renderClient() {
  return render(<QueryClientProvider client={client}><EmailLinkClient /></QueryClientProvider>);
}

it('필수 가입 설정은 제공받은 이메일을 제안하고 나중에 가는 뒤로가기를 제공하지 않는다', async () => {
  server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'success', data: {
    user: { id: 'new-social', email: 'provided@example.test', onboardingStatus: 'signup_done', signupEmailLoginRequired: true },
    profile: { displayName: '테스트' },
  } })));
  renderClient();
  await waitFor(() => expect(emailField()).toHaveValue('provided@example.test'));
  expect(screen.getByText('가입을 마치려면 이메일 인증과 비밀번호 설정이 필요해요.')).toBeVisible();
  expect(screen.queryByRole('link', { name: '뒤로가기' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeVisible();
});

it('필수 설정 중 권한이 바뀌면 되돌아가기 반복 대신 고객센터로 안내한다', async () => {
  server.use(
    http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'success', data: {
      user: { id: 'new-social', email: null, onboardingStatus: 'signup_done', signupEmailLoginRequired: true }, profile: { displayName: '테스트' },
    } })),
    http.post('*/api/v1/auth/link/email/request', () => failure(403, 'SOCIAL_LINK_ADMIN_FORBIDDEN', '운영자 계정')),
  );
  renderClient();
  await screen.findByText('가입을 마치려면 이메일 인증과 비밀번호 설정이 필요해요.');
  await userEvent.type(emailField(), 'runner@example.com');
  await userEvent.click(sendButton());
  expect(await screen.findByRole('link', { name: '고객센터 문의하기' })).toHaveAttribute('href', '/my/inquiries/new');
  expect(screen.queryByRole('link', { name: '로그인 방법으로 돌아가기' })).not.toBeInTheDocument();
});

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const emailField = () => screen.getByLabelText('이메일');
const sendButton = () => screen.getByRole('button', { name: '인증번호 받기' });
const backButton = () => screen.getAllByRole('button', { name: '뒤로가기' })[0] as HTMLElement;

async function typeEmail(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.clear(emailField());
  await user.type(emailField(), email);
}

/** 1단계를 통과해 2단계(인증번호)에 선다. 서버가 시험용 주소에 인증번호를 되돌려 줘 입력칸이 채워진다. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>, email: string = EMAIL_LINK_MSW.emails.ok) {
  await typeEmail(user, email);
  await user.click(sendButton());
  await heading(CODE_STEP);
}

async function reachPasswordStep(user: ReturnType<typeof userEvent.setup>) {
  await reachCodeStep(user);
  await user.click(screen.getByRole('button', { name: '인증번호 확인' }));
  await heading(PASSWORD_STEP);
}

async function fillPasswords(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('비밀번호'), PASSWORD);
  await user.type(screen.getByLabelText('비밀번호 확인'), PASSWORD);
}

describe('EmailLinkClient — 단계 흐름', () => {
  it('이메일 → 인증번호 → 비밀번호 → 완료까지 가고, 세 요청에 각 단계의 값만 보낸다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading('이메일 로그인이 연결됐어요')).toBeInTheDocument();
    expect(screen.getByText(`이제 ${EMAIL_LINK_MSW.emails.ok} 과 비밀번호로도 로그인할 수 있어요.`)).toBeInTheDocument();
    expect(screen.getByText('이메일 인증을 마쳤어요')).toBeInTheDocument();
    expect(screen.getByText('비밀번호를 정했어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 방법으로 돌아가기' })).toHaveAttribute('href', LOGIN_METHODS_PATH);
    expect(calls).toEqual({
      request: [{ email: EMAIL_LINK_MSW.emails.ok }],
      verify: [{ code: EMAIL_LINK_MSW.codes.ok }],
      complete: [{ emailLinkToken: EMAIL_LINK_MSW.tokens.ok, password: PASSWORD, passwordConfirm: PASSWORD }],
    });
  });

  it('입력한 이메일은 소문자·공백 없이 보내고, 이메일 형식이 아니면 버튼이 잠겨 이유를 알려 준다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('이메일을 입력해 주세요.')).toBeInTheDocument();
    await typeEmail(user, 'kim@');
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('이메일 형식을 확인해 주세요.')).toBeInTheDocument();

    await typeEmail(user, '  New-Login@Example.com ');
    await user.click(sendButton());
    await heading(CODE_STEP);

    expect(calls.request).toEqual([{ email: 'new-login@example.com' }]);
  });

  it('단계가 바뀔 때마다 포커스가 그 단계의 제목으로 옮겨 간다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await reachCodeStep(user);
    expect(screen.getByRole('heading', { level: 1, name: CODE_STEP })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '인증번호 확인' }));
    expect(await heading(PASSWORD_STEP)).toHaveFocus();

    await user.click(backButton());
    expect(await heading(CODE_STEP)).toHaveFocus();
  });

  it('진행 바와 제목이 지금 몇 번째 단계인지 알려 준다', async () => {
    const user = userEvent.setup();
    renderClient();
    expect(await screen.findByRole('progressbar', { name: '이메일 연결 진행 단계 1 / 3' })).toHaveAttribute('aria-valuenow', '1');

    await reachCodeStep(user);

    expect(screen.getByRole('progressbar', { name: '이메일 연결 진행 단계 2 / 3' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText(`${EMAIL_LINK_MSW.emails.ok} 으로 6자리 숫자를 보냈어요.`)).toBeInTheDocument();
  });

  it('첫 단계의 뒤로 가기는 로그인 방법으로 간다', async () => {
    renderClient();
    await heading(EMAIL_STEP);

    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', LOGIN_METHODS_PATH);
  });
});

describe('EmailLinkClient — 뒤로 가기', () => {
  it('뒤로 가면 바로 앞 단계로 가고, 받아 둔 인증번호가 살아 있으면 다시 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachCodeStep(user);

    await user.click(backButton());
    await heading(EMAIL_STEP);
    expect(emailField()).toHaveValue(EMAIL_LINK_MSW.emails.ok);

    await user.click(sendButton());
    await heading(CODE_STEP);
    expect(calls.request).toHaveLength(1);
  });

  it('이메일을 고치면 다시 보내고, 앞 주소의 인증은 이어지지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);

    await user.click(backButton());
    await user.click(backButton());
    await heading(EMAIL_STEP);
    await typeEmail(user, 'other-login@example.com');
    await user.click(sendButton());
    await heading(CODE_STEP);

    expect(calls.request).toEqual([{ email: EMAIL_LINK_MSW.emails.ok }, { email: 'other-login@example.com' }]);
    // 앞 주소의 "인증 완료"가 새 주소에 남아 있으면 안 된다 — 인증번호를 다시 받는다.
    expect(screen.queryByText('이메일 인증이 완료됐어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 확인' })).toBeInTheDocument();
  });

  it('비밀번호 단계에서 뒤로 가면 인증이 끝난 상태로 보이고, 다음을 누르면 다시 확인하지 않고 돌아온다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);

    await user.click(backButton());
    await heading(CODE_STEP);

    expect(screen.getByText('이메일 인증이 완료됐어요')).toBeInTheDocument();
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    await heading(PASSWORD_STEP);
    expect(calls.verify).toHaveLength(1);
  });
});

describe('EmailLinkClient — 이메일 단계의 오류', () => {
  it('다른 계정이 쓰는 이메일은 입력칸 아래에서 알리고(role=alert), 그 계정에 대해서는 아무것도 알려 주지 않으며 고객센터 길을 연다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_LINK_MSW.emails.taken);
    await user.click(sendButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이미 다른 계정에서 쓰는 이메일이에요.');
    // 고칠 곳이 이 입력칸이라 포커스가 버튼에서 입력칸으로 돌아온다.
    await waitFor(() => expect(emailField()).toHaveFocus());
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(emailField()).toHaveAccessibleDescription('이미 다른 계정에서 쓰는 이메일이에요.');
    expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/my/inquiries/new');
    // 단계는 그대로고, 같은 주소로 되풀이하지 못하게 버튼이 잠긴다.
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('사용할 수 있는 이메일을 입력해 주세요.')).toBeInTheDocument();

    // 다른 주소를 넣으면 오류가 사라지고 버튼이 다시 열린다.
    await typeEmail(user, EMAIL_LINK_MSW.emails.ok);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('이미 이메일 로그인이 연결된 계정이면 이유를 알리고 로그인 방법으로만 보낸다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_LINK_MSW.emails.alreadyHasEmailLogin);
    await user.click(sendButton());

    expect(await heading('이미 이메일 로그인이 연결돼 있어요')).toHaveFocus();
    expect(screen.getByRole('link', { name: '로그인 방법으로 돌아가기' })).toHaveAttribute('href', LOGIN_METHODS_PATH);
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
  });

  it('운영자 계정은 연결할 수 없다고 알리고 로그인 방법으로만 보낸다', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/request', () => failure(403, 'SOCIAL_LINK_ADMIN_FORBIDDEN', '운영자 계정에는 소셜 로그인을 연결할 수 없어요.')));
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_LINK_MSW.emails.ok);
    await user.click(sendButton());

    expect(await heading('이메일 로그인을 연결할 수 없어요')).toBeInTheDocument();
    expect(screen.getByText(/운영자 계정에는 이메일 로그인을 연결할 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 방법으로 돌아가기' })).toBeInTheDocument();
  });

  it('로그인한 지 오래됐으면(RECENT_LOGIN_REQUIRED) 기존 안내 문구로 알리고, 다시 로그인하면 이 화면으로 돌아오게 한다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_LINK_MSW.emails.recentLoginRequired);
    await user.click(sendButton());

    expect(await heading('보안을 위해 다시 로그인해 주세요')).toBeInTheDocument();
    expect(screen.getByText('로그인한 지 오래돼서 바로 연결할 수 없어요. 다시 로그인하면 이 화면으로 돌아와 이어서 연결할 수 있어요.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 로그인하기' }));
    expect(signOut.signOutAndLeave).toHaveBeenCalledExactlyOnceWith(
      '/login?redirect=%2Fmy%2Fsettings%2Flogin-methods%2Femail',
      { failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.' },
    );
  });

  it('로그아웃에 실패하면 안내 아래에 이유를 보인다', async () => {
    const user = userEvent.setup();
    signOut.error = '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.';
    renderClient();
    await heading(EMAIL_STEP);
    await typeEmail(user, EMAIL_LINK_MSW.emails.recentLoginRequired);
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });

  it.each([
    ['EMAIL_SEND_UNAVAILABLE', 'EMAIL_SEND_UNAVAILABLE'],
    ['EMAIL_SEND_FAILED', 'EMAIL_SEND_FAILED'],
  ])('인증 메일을 보낼 수 없으면(%s) 입력칸 아래에서 알리고 다시 시도할 수 있게 둔다', async (_name, code) => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/request', () => failure(503, code, '서버 내부 문구예요.')));
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_LINK_MSW.emails.ok);
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.');
    expect(screen.queryByText('서버 내부 문구예요.')).not.toBeInTheDocument();
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('재발송 대기(VERIFICATION_RESEND_COOLDOWN)는 실패가 아니라 안내로 보이고 단계는 그대로다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_LINK_MSW.emails.cooldown);
    await user.click(sendButton());

    const banner = await screen.findByText(/잠시 후 다시 시도해 주세요/);
    expect(banner.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
  });
});

describe('EmailLinkClient — 인증번호·비밀번호 단계의 오류', () => {
  it.each([
    ['틀린 번호', EMAIL_LINK_MSW.codes.wrong, '인증번호가 올바르지 않아요.'],
    ['시도 횟수 초과', EMAIL_LINK_MSW.codes.exhausted, '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.'],
    ['요청이 없거나 만료', EMAIL_LINK_MSW.codes.expired, '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.'],
  ])('인증번호 확인이 거절되면(%s) 단계에 머물며 서버 문구로 알린다', async (_name, code, message) => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachCodeStep(user);

    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: code } });
    await user.click(screen.getByRole('button', { name: '인증번호 확인' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: CODE_STEP })).toBeInTheDocument();
    expect(calls.verify).toEqual([{ code }]);
  });

  it('6자리가 아니면 확인 버튼이 잠긴다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachCodeStep(user);

    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: '12345' } });

    expect(screen.getByRole('button', { name: '인증번호 확인' })).toBeDisabled();
    expect(screen.getByText('인증번호 6자리를 입력해 주세요.')).toBeInTheDocument();
  });

  it('인증 증명이 만료됐다면(EMAIL_LINK_TOKEN_INVALID) 안내와 함께 1단계로 돌아가고, 이메일은 남아 있어 인증번호를 새로 받는다', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/complete', () => failure(400, 'EMAIL_LINK_TOKEN_INVALID', '서버 문구')));
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading(EMAIL_STEP)).toHaveFocus();
    // 하던 일이 되돌려진 안내라 즉시 읽히게(role=alert) 한다.
    expect(screen.getByRole('alert')).toHaveTextContent('이메일 인증이 만료돼서 처음부터 다시 해야 해요. 인증번호를 다시 받아 주세요.');
    expect(emailField()).toHaveValue(EMAIL_LINK_MSW.emails.ok);

    // 되돌아온 첫 단계에서 이미 쓴 인증번호를 건너뛰지 않고 새로 보낸다.
    await user.click(sendButton());
    await heading(CODE_STEP);
    expect(calls.request).toHaveLength(2);
    expect(screen.getByRole('button', { name: '인증번호 확인' })).toBeInTheDocument();
  });

  it('인증하는 사이 다른 계정이 그 이메일을 가져갔다면(complete 의 EMAIL_CONFLICT) 1단계로 돌아가 입력칸 아래에서 알린다', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/verify', () => HttpResponse.json({
      status: 'success',
      data: { emailLinkToken: EMAIL_LINK_MSW.tokens.taken, expiresInSeconds: EMAIL_LINK_MSW.tokenExpiresInSeconds },
      timestamp: '2026-11-01T00:00:00.000Z',
    })));
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading(EMAIL_STEP)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 다른 계정에서 쓰는 이메일이에요.');
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeDisabled();

    // 다른 주소를 넣으면 지난 시도의 오류가 따라오지 않는다.
    await typeEmail(user, 'other-login@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled();
  });

  it('인증하는 사이 이 계정에 이메일 로그인이 생겼거나(EXISTS) 운영자 계정이면 단계 화면 대신 안내만 보인다', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/complete', () => failure(409, 'SOCIAL_LINK_PROVIDER_EXISTS', '이 계정에는 이미 이메일 로그인이 연결돼 있어요.')));
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading('이미 이메일 로그인이 연결돼 있어요')).toBeInTheDocument();
    expect(screen.queryByLabelText('비밀번호')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 방법으로 돌아가기' })).toHaveAttribute('href', LOGIN_METHODS_PATH);
  });

  it('그 밖의 연결 실패는 비밀번호 단계에 머물며 입력을 지우지 않고 다시 시도하게 한다', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/complete', () => failure(500, 'INTERNAL_ERROR', '잠시 문제가 생겼어요.')));
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await screen.findByText('잠시 문제가 생겼어요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: PASSWORD_STEP })).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toHaveValue(PASSWORD);
    expect(screen.getByRole('button', { name: '연결하기' })).toBeEnabled();
  });
});

describe('EmailLinkClient — 비밀번호 단계', () => {
  it('가입과 같은 규칙(8자 이상 + 같은 값 확인)을 채울 때까지 버튼이 잠기고, 이유를 알려 준다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);

    const connect = screen.getByRole('button', { name: '연결하기' });
    expect(connect).toBeDisabled();
    await user.type(screen.getByLabelText('비밀번호'), 'short');
    expect(screen.getByText('8자 이상 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('aria-invalid', 'true');
    expect(connect).toBeDisabled();

    await user.clear(screen.getByLabelText('비밀번호'));
    await user.type(screen.getByLabelText('비밀번호'), PASSWORD);
    expect(screen.getByText('사용할 수 있는 비밀번호예요.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('비밀번호 확인'), `${PASSWORD}x`);
    expect(screen.getByText('비밀번호가 일치하지 않아요.')).toBeInTheDocument();
    expect(connect).toBeDisabled();
    expect(screen.getByText('비밀번호 확인이 일치해야 해요.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('비밀번호 확인'));
    await user.type(screen.getByLabelText('비밀번호 확인'), PASSWORD);
    expect(screen.getByText('비밀번호가 일치해요.')).toBeInTheDocument();
    expect(connect).toBeEnabled();
  });

  it('보기 토글은 그 칸의 글자만 드러내고 누른 상태를 알린다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);

    const [first, second] = screen.getAllByRole('button', { name: '비밀번호 보기' });
    await user.click(first as HTMLElement);

    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('비밀번호 확인')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
  });

  it('비밀번호와 인증 증명은 이 화면의 메모리에만 두고 스토리지에 쓰지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));
    await heading('이메일 로그인이 연결됐어요');

    const stored = [window.sessionStorage, window.localStorage].flatMap((storage) => (
      Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`)
    )).join('\n');
    expect(stored).not.toContain(PASSWORD);
    expect(stored).not.toContain(EMAIL_LINK_MSW.tokens.ok);
  });
});

describe('EmailLinkClient — 가입 화면에서 이어 온 이메일', () => {
  it('보관해 둔 이메일이 1단계에 채워지고 "비밀번호는 저장하지 않았다"고 알리며, 칸은 비워진다', async () => {
    savePendingEmailLink({ email: 'Typed-Login@Example.com' });
    renderClient();

    expect(await heading('이메일을 연결할까요?')).toBeInTheDocument();
    expect(emailField()).toHaveValue('typed-login@example.com');
    expect(screen.getByText('방금 가입하려던 이메일이에요. 비밀번호는 저장하지 않아서 새로 정해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('나중에 하려면 뒤로 가기를 눌러 주세요.')).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());
  });

  it('이메일이 채워져 있어도 인증번호와 비밀번호는 새로 거친다', async () => {
    const user = userEvent.setup();
    savePendingEmailLink({ email: EMAIL_LINK_MSW.emails.ok });
    renderClient();
    await heading('이메일을 연결할까요?');

    await user.click(sendButton());
    await heading(CODE_STEP);
    await user.click(screen.getByRole('button', { name: '인증번호 확인' }));
    await heading(PASSWORD_STEP);

    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    expect(screen.getByRole('button', { name: '연결하기' })).toBeDisabled();
    expect(calls.request).toEqual([{ email: EMAIL_LINK_MSW.emails.ok }]);
  });

  it('이메일을 고치면 일반 1단계로 돌아가 안내가 사라진다', async () => {
    const user = userEvent.setup();
    savePendingEmailLink({ email: EMAIL_LINK_MSW.emails.ok });
    renderClient();
    await heading('이메일을 연결할까요?');

    await user.type(emailField(), 'x');

    expect(await heading(EMAIL_STEP)).toBeInTheDocument();
    expect(screen.queryByText(/방금 가입하려던 이메일이에요/)).not.toBeInTheDocument();
  });

  it('보관한 이메일이 없으면 빈 입력칸으로 시작하고 안내는 없다', async () => {
    renderClient();

    expect(await heading(EMAIL_STEP)).toBeInTheDocument();
    expect(emailField()).toHaveValue('');
    expect(screen.queryByText(/방금 가입하려던 이메일이에요/)).not.toBeInTheDocument();
  });

  it('만료된 이메일은 채우지 않는다', async () => {
    savePendingEmailLink({ email: 'late@example.com' }, Date.now() - 11 * 60 * 1000);
    renderClient();

    expect(await heading(EMAIL_STEP)).toBeInTheDocument();
    expect(emailField()).toHaveValue('');
  });
});

describe('EmailLinkClient — 완료', () => {
  it('완료 직후 화면은 제목에 포커스를 두고 로그인 방법 링크 하나만 낸다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading('이메일 로그인이 연결됐어요')).toHaveFocus();
    const links = within(document.body).getAllByRole('link');
    expect(links.filter((link) => link.getAttribute('href') === LOGIN_METHODS_PATH)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '연결하기' })).not.toBeInTheDocument();
  });

  it('연결이 끝나면 로그인 수단·계정 정보 조회를 다시 읽도록 표시한다', async () => {
    const user = userEvent.setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '연결하기' }));
    });
    await heading('이메일 로그인이 연결됐어요');

    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys.some((key) => key?.includes('"auth","me"'))).toBe(true);
  });
});

describe('EmailLinkClient — 되돌아온 1단계', () => {
  // 앞뒤 공백은 type=email 입력칸이 값에서 걷어 내 이 화면에 닿지 않는다 — 다른 표기는 대소문자로 만든다.
  it('인증을 마친 주소를 대소문자만 바꿔 다시 입력해도 인증이 이어지고, 끝까지 연결된다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);

    await user.click(backButton());
    await user.click(backButton());
    await heading(EMAIL_STEP);
    // 같은 주소의 다른 표기다 — 인증도 인증번호 상태도 그대로라서, 지우면 인증번호를 다시 받을 길 없이 막힌다.
    fireEvent.change(emailField(), { target: { value: EMAIL_LINK_MSW.emails.ok.toUpperCase() } });
    await user.click(sendButton());
    await heading(CODE_STEP);

    expect(screen.getByText('이메일 인증이 완료됐어요')).toBeInTheDocument();
    expect(calls.request).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '다음' }));
    await heading(PASSWORD_STEP);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading('이메일 로그인이 연결됐어요')).toBeInTheDocument();
    expect(calls.complete).toEqual([{ emailLinkToken: EMAIL_LINK_MSW.tokens.ok, password: PASSWORD, passwordConfirm: PASSWORD }]);
  });

  it('막힌 주소(complete 의 EMAIL_CONFLICT)를 대소문자만 바꿔 다시 입력해도 막힘 표시가 그대로다', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/link/email/verify', () => HttpResponse.json({
      status: 'success',
      data: { emailLinkToken: EMAIL_LINK_MSW.tokens.taken, expiresInSeconds: EMAIL_LINK_MSW.tokenExpiresInSeconds },
      timestamp: '2026-11-01T00:00:00.000Z',
    })));
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 다른 계정에서 쓰는 이메일이에요.');

    fireEvent.change(emailField(), { target: { value: EMAIL_LINK_MSW.emails.ok.toUpperCase() } });

    expect(screen.getByRole('alert')).toHaveTextContent('이미 다른 계정에서 쓰는 이메일이에요.');
    expect(sendButton()).toBeDisabled();
  });

  it('인증번호가 틀려 오류가 떠 있는 채로 뒤로 가도 1단계에는 그 오류가 남지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachCodeStep(user);
    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: EMAIL_LINK_MSW.codes.wrong } });
    await user.click(screen.getByRole('button', { name: '인증번호 확인' }));
    expect(await screen.findByText('인증번호가 올바르지 않아요.')).toBeInTheDocument();

    await user.click(backButton());
    await heading(EMAIL_STEP);

    expect(screen.queryByText('인증번호가 올바르지 않아요.')).not.toBeInTheDocument();
    // 받아 둔 인증번호는 살아 있으니 다시 보내지 않고 2단계로 가며, 거기서도 지난 오류는 없다.
    await user.click(sendButton());
    await heading(CODE_STEP);
    expect(screen.queryByText('인증번호가 올바르지 않아요.')).not.toBeInTheDocument();
    expect(calls.request).toHaveLength(1);
  });
});

describe('EmailLinkClient — Enter 와 포커스', () => {
  it('하단 버튼이 폼의 제출 버튼이라 이메일 칸에서 Enter 로도 인증번호를 보낸다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await typeEmail(user, EMAIL_LINK_MSW.emails.ok);

    expect((sendButton() as HTMLButtonElement).form).toBe(emailField().closest('form'));
    expect(sendButton()).toHaveAttribute('type', 'submit');
    await user.keyboard('{Enter}');

    await heading(CODE_STEP);
    expect(calls.request).toEqual([{ email: EMAIL_LINK_MSW.emails.ok }]);
  });

  it('비밀번호 단계의 연결하기도 같은 폼의 제출 버튼이다 — 확인 칸에서 Enter 를 누르면 제출되고, 버튼 클릭은 한 번만 보낸다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    const form = screen.getByLabelText('비밀번호 확인').closest('form') as HTMLFormElement;
    const connect = screen.getByRole('button', { name: '연결하기' }) as HTMLButtonElement;

    // 브라우저는 폼에 연결된 기본 제출 버튼을 눌러 제출한다(jsdom 은 이 암묵 제출을 하지 않아 연결을 확인하고 제출 이벤트를 낸다).
    expect(connect.form).toBe(form);
    expect(connect).toHaveAttribute('type', 'submit');
    await user.click(connect);

    expect(await heading('이메일 로그인이 연결됐어요')).toBeInTheDocument();
    expect(calls.complete).toHaveLength(1);
  });

  it('제출 이벤트도 연결하기와 같은 일을 하고, 규칙을 채우지 못했으면(버튼이 잠겼으면) 아무것도 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    const form = screen.getByLabelText('비밀번호').closest('form') as HTMLFormElement;
    await user.type(screen.getByLabelText('비밀번호'), 'short');

    fireEvent.submit(form);
    expect(calls.complete).toEqual([]);

    await user.clear(screen.getByLabelText('비밀번호'));
    await fillPasswords(user);
    fireEvent.submit(form);

    expect(await heading('이메일 로그인이 연결됐어요')).toBeInTheDocument();
    expect(calls.complete).toHaveLength(1);
  });

  it('Enter 로 보내는 동안에도 포커스는 이메일 칸에 남는다 — 잠그지 않고 읽기 전용으로 둔다', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.post('*/api/v1/auth/link/email/request', async () => {
      await gate;
      return undefined;
    }));
    renderClient();
    await heading(EMAIL_STEP);
    await typeEmail(user, EMAIL_LINK_MSW.emails.ok);

    await user.keyboard('{Enter}');

    await waitFor(() => expect(emailField()).toHaveAttribute('readonly'));
    expect(emailField()).not.toBeDisabled();
    expect(emailField()).toHaveFocus();
    release();
    await heading(CODE_STEP);
  });
});

describe('EmailLinkClient — 하던 곳으로 돌아가기', () => {
  const DESTINATION = '/matches/abc?tab=info';

  it('돌아갈 곳이 있으면 첫 단계의 뒤로 가기와 완료 화면의 버튼이 그곳으로 간다', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams({ redirect: DESTINATION });
    renderClient();
    await heading(EMAIL_STEP);

    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', DESTINATION);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await heading('이메일 로그인이 연결됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '하던 곳으로 돌아가기' })).toHaveAttribute('href', DESTINATION);
    expect(screen.queryByRole('link', { name: '로그인 방법으로 돌아가기' })).not.toBeInTheDocument();
  });

  it('돌아갈 곳이 없으면 로그인 방법으로 간다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));

    expect(await screen.findByRole('link', { name: '로그인 방법으로 돌아가기' })).toHaveAttribute('href', LOGIN_METHODS_PATH);
    expect(screen.queryByRole('link', { name: '하던 곳으로 돌아가기' })).not.toBeInTheDocument();
  });

  it.each([
    ['외부 주소', 'https://evil.example.com/x'],
    ['프로토콜 상대 주소', '//evil.example.com'],
    ['로그인 화면', '/login?redirect=%2Fmy'],
    ['이 화면 자신', '/my/settings/login-methods/email'],
  ])('안전하지 않은 redirect(%s)는 무시하고 로그인 방법으로 보낸다', async (_label, redirect) => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams({ redirect });
    renderClient();
    await heading(EMAIL_STEP);

    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', LOGIN_METHODS_PATH);
    await reachPasswordStep(user);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: '연결하기' }));
    expect(await screen.findByRole('link', { name: '로그인 방법으로 돌아가기' })).toHaveAttribute('href', LOGIN_METHODS_PATH);
  });

  it('다시 로그인해도 돌아갈 곳이 이어지고, 안내 화면의 뒤로 가기도 그곳으로 간다', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams({ redirect: DESTINATION });
    renderClient();
    await heading(EMAIL_STEP);
    await typeEmail(user, EMAIL_LINK_MSW.emails.recentLoginRequired);
    await user.click(sendButton());
    await heading('보안을 위해 다시 로그인해 주세요');

    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', DESTINATION);
    await user.click(screen.getByRole('button', { name: '다시 로그인하기' }));

    const back = encodeURIComponent(`/my/settings/login-methods/email?redirect=${encodeURIComponent(DESTINATION)}`);
    expect(signOut.signOutAndLeave).toHaveBeenCalledExactlyOnceWith(`/login?redirect=${back}`, expect.any(Object));
  });
});
