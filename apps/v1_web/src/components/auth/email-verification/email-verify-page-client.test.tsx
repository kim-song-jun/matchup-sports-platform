import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as hooks from '@/hooks/use-v1-api';
import { EMAIL_VERIFY_MSW } from '@/test/msw/verification-email-handlers';
import { server } from '@/test/msw/server';
import { EmailVerifyPageClient } from './email-verify-page-client';

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/email-verify',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => nav.params,
}));

// 한 테스트가 화면 두세 단계를 지나며 MSW 왕복을 여러 번 한다 — 바쁜 러너의 jsdom 에서는 기본 5초를 넘길 수 있다.
vi.setConfig({ testTimeout: 30_000 });

const ACCOUNT_EMAIL = 'member@example.com';
const NOW = '2026-11-08T00:00:00.000Z';

type Me = { email: string | null; emailVerified: boolean };
let me: Me;
let authMeReads: number;
let requests: number;
let confirmBodies: unknown[];

function ok(data: unknown) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}
function fail(statusCode: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details: null, timestamp: NOW }, { status: statusCode });
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  nav.params = new URLSearchParams();
  me = { email: ACCOUNT_EMAIL, emailVerified: false };
  authMeReads = 0;
  requests = 0;
  confirmBodies = [];
  server.use(
    http.post('*/api/v1/logs/client-error', () => ok({})),
    http.get('*/api/v1/auth/me', () => {
      authMeReads += 1;
      return ok({
        user: { id: 'u1', email: me.email, accountStatus: 'active', onboardingStatus: 'completed', authProviders: ['email'], hasPassword: true },
        profile: { displayName: '밋팀러' },
        verification: { emailVerified: me.emailVerified, phoneVerified: true },
      });
    }),
    // 공유 핸들러가 응답을 정하고, 이 화면이 실제로 보낸 것만 옆에서 센다.
    http.post('*/api/v1/verification/email/request', () => {
      requests += 1;
      return undefined;
    }),
    http.post('*/api/v1/verification/email/confirm', async ({ request }) => {
      confirmBodies.push(await request.clone().json());
      return undefined;
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmailVerifyPageClient />
    </QueryClientProvider>,
  );
}

async function sendCode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  return screen.findByLabelText('인증번호 6자리');
}

describe('EmailVerifyPageClient — 보내기와 확인', () => {
  it('계정 이메일을 보여 주고, 받기를 누르면 인증번호 입력칸으로 포커스가 옮겨 간다', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(ACCOUNT_EMAIL)).toBeInTheDocument();
    expect(screen.getByText('인증번호를 받을 이메일')).toBeInTheDocument();

    const input = await sendCode(user);

    expect(requests).toBe(1);
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });

  it('맞는 인증번호를 확인하면 완료 안내로 바뀌고 포커스가 거기로 가며, 계정 정보를 다시 읽는다', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await sendCode(user);
    const readsBeforeConfirm = authMeReads;
    // 서버는 확정하면 이 계정을 인증된 것으로 답한다.
    server.use(
      http.post('*/api/v1/verification/email/confirm', async ({ request }) => {
        confirmBodies.push(await request.clone().json());
        me = { ...me, emailVerified: true };
        return ok({ verified: true, channel: 'email', verification: { emailVerified: true, phoneVerified: true } });
      }),
    );

    await user.type(input, EMAIL_VERIFY_MSW.codes.ok);
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('이메일 인증이 완료됐어요.')).toBeInTheDocument();
    expect(confirmBodies).toEqual([{ code: EMAIL_VERIFY_MSW.codes.ok }]);
    await waitFor(() => expect(screen.getByText('이메일 인증이 완료됐어요.').closest('[tabindex="-1"]')).toHaveFocus());
    await waitFor(() => expect(authMeReads).toBeGreaterThan(readsBeforeConfirm));
    expect(screen.getByRole('link', { name: '확인' })).toHaveAttribute('href', '/my');
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
  });

  it.each([
    ['틀린 번호', EMAIL_VERIFY_MSW.codes.wrong, '인증번호가 올바르지 않아요.'],
    ['만료됐거나 없는 요청', EMAIL_VERIFY_MSW.codes.expired, '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.'],
    ['시도 횟수 초과', EMAIL_VERIFY_MSW.codes.exhausted, '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.'],
    ['보낸 뒤 바뀐 이메일', EMAIL_VERIFY_MSW.codes.targetChanged, '인증할 이메일이 변경됐어요. 인증번호를 다시 받아 주세요.'],
    ['이미 다른 계정이 쓰는 이메일', EMAIL_VERIFY_MSW.codes.conflict, '이미 다른 계정에서 사용 중인 이메일이에요.'],
  ])('확인이 %s 으로 거절되면 서버의 안내를 보이고 완료로 넘어가지 않는다', async (_name, code, message) => {
    const user = userEvent.setup();
    renderPage();
    const input = await sendCode(user);

    await user.type(input, code);
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('이메일 인증이 완료됐어요.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('인증번호 6자리')).toBeInTheDocument();
  });

  it('서버가 이미 인증됐다고 답하면 코드를 받지 않고 완료로 넘어가며 계정 정보를 다시 읽는다', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: '인증번호 받기' });
    const readsBefore = authMeReads;
    server.use(
      http.post('*/api/v1/verification/email/request', () => {
        me = { ...me, emailVerified: true };
        return ok({ sent: false, alreadyVerified: true, channel: 'email' });
      }),
    );

    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByText('이메일 인증이 완료됐어요.')).toBeInTheDocument();
    await waitFor(() => expect(authMeReads).toBeGreaterThan(readsBefore));
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
  });
});

describe('EmailVerifyPageClient — 보내지 못할 때', () => {
  it.each([
    ['메일을 보낼 수 없는 환경', 503, 'EMAIL_SEND_UNAVAILABLE', '지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.'],
    ['메일 발송 실패', 503, 'EMAIL_SEND_FAILED', '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.'],
    ['하루 발송 한도 초과', 429, 'VERIFICATION_SEND_QUOTA_EXCEEDED', '인증번호를 너무 많이 요청했어요. 최대 24시간 뒤에 다시 시도할 수 있어요.'],
  ])('%s 이면 서버의 안내를 보이고 받기 버튼을 그대로 둔다', async (_name, status, code, message) => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/verification/email/request', () => fail(status, code, message)));
    renderPage();

    await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled();
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
  });

  it('재발송 쿨다운은 실패가 아니라 기다리라는 안내로 보인다', async () => {
    const user = userEvent.setup();
    const message = '잠시 후 다시 시도해 주세요. (12초 뒤에 다시 받을 수 있어요)';
    server.use(http.post('*/api/v1/verification/email/request', () => fail(400, 'VERIFICATION_RESEND_COOLDOWN', message)));
    renderPage();

    await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(message);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('보낸 인증번호의 유효 시간이 지나 있으면 입력과 확인을 막고 다시 받으라고 안내한다', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/verification/email/request', () =>
        ok({ sent: true, channel: 'email', target: EMAIL_VERIFY_MSW.maskedTarget, expiresAt: new Date(Date.now() - 1000).toISOString() }),
      ),
    );
    renderPage();

    const input = await sendCode(user);

    expect(await screen.findByText('인증번호를 다시 받아 주세요')).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });
});

describe('EmailVerifyPageClient — 화면에 들어온 상태', () => {
  it('이미 인증된 계정이면 받기 버튼 없이 완료 안내만 보인다', async () => {
    me = { email: ACCOUNT_EMAIL, emailVerified: true };
    renderPage();

    expect(await screen.findByText('이메일 인증이 완료됐어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
    expect(requests).toBe(0);
  });

  it('계정 정보를 받기 전에는 받기 버튼을 세우지 않는다', () => {
    renderPage();

    expect(screen.getByText('계정 정보를 불러오는 중이에요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
  });

  it('계정 정보를 못 읽으면 이메일이 없다고 말하지 않고 다시 시도하게 한다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    // useV1AuthMe 는 재시도 옵션을 비워 두어 실패가 화면에 닿기까지 수 초가 걸린다 — 실패한 조회 상태를 직접 준다.
    vi.spyOn(hooks, 'useV1AuthMe').mockReturnValue({ data: undefined, isPending: false, isError: true, refetch } as never);
    renderPage();

    expect(screen.queryByText(/인증할 이메일이 없어요/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('인증할 이메일이 없는 계정은 보낼 수 없다고 말하고 로그인 방법으로 안내한다', async () => {
    me = { email: null, emailVerified: false };
    renderPage();

    expect(await screen.findByText(/인증할 이메일이 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인 방법으로 가기' })).toHaveAttribute('href', '/my/settings/login-methods');
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
  });

  it.each([
    ['같은 사이트의 경로', '/tournaments/t1/apply', '/tournaments/t1/apply'],
    ['바깥 주소', 'https://evil.example/phish', '/my'],
    ['프로토콜 상대 주소', '//evil.example/phish', '/my'],
    ['없는 값', null, '/my'],
  ])('완료 뒤 돌아갈 곳: %s', async (_name, redirect, expected) => {
    me = { email: ACCOUNT_EMAIL, emailVerified: true };
    nav.params = redirect === null ? new URLSearchParams() : new URLSearchParams({ redirect });
    renderPage();

    expect(await screen.findByRole('link', { name: '확인' })).toHaveAttribute('href', expected);
  });
});
