import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1MswHandlers } from '@/test/msw/handlers';
import { LoginDevicesPageClient } from './login-devices-page-client';

const nav = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/settings/devices',
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(),
}));
// 실패 응답은 api-client 가 서버로 보고한다 — 그 전송은 이 시험의 대상이 아니다.
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));
// useV1AuthMe 는 retry 를 명시적 undefined 로 넘겨 테스트 클라이언트의 retry:false 를 덮는다 — 실패 시험이 백오프를 기다리지 않게 한다.
vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return { ...actual, useV1AuthMe: () => actual.useV1AuthMe({ retry: false }) };
});

const server = setupServer(...v1MswHandlers);

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

const REVOKE_BUTTON = '다른 기기에서 모두 로그아웃';
const REVOKE_AGAIN_BUTTON = '다시 한 번 로그아웃';
const SUCCESS_BANNER = '다른 기기에서 모두 로그아웃했어요. 이 기기는 그대로 로그인돼 있어요.';

let revokeCalls: Array<{ body: string }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  revokeCalls = [];
});
afterEach(() => {
  server.resetHandlers();
});

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-11-07T00:00:00.000Z' });
}

function failure(statusCode: number, code: string, message: string) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message, details: null, timestamp: '2026-11-07T00:00:00.000Z' },
    { status: statusCode },
  );
}

function serveMe(account: { providers: string[]; hasPassword: boolean }) {
  server.use(http.get('*/api/v1/auth/me', () => ok({
    user: {
      id: 'user-1',
      email: 'minsu.kim@example.com',
      onboardingStatus: 'completed',
      canLinkLoginMethods: true,
      authProviders: account.providers,
      hasPassword: account.hasPassword,
    },
    profile: { displayName: '민수' },
  })));
}

/** 공유 핸들러(항상 성공)를 두고, 이 화면이 실제로 어떤 요청을 보냈는지만 기록한다. */
function recordRevokeRequests() {
  server.use(http.post('*/api/v1/auth/sessions/revoke-others', async ({ request }) => {
    revokeCalls.push({ body: await request.clone().text() });
    return undefined;
  }));
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('LoginDevicesPageClient - 처음 화면', () => {
  it('무엇이 끊기고 무엇이 남는지 설명한 뒤에 버튼을 보여 준다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    render(<LoginDevicesPageClient />);

    expect(screen.getByRole('heading', { name: '다른 기기의 로그인을 끊어요' })).toBeInTheDocument();
    expect(screen.getByText('잃어버린 휴대폰이나 남의 기기에 로그인해 둔 게 걱정될 때 써요.')).toBeInTheDocument();
    const rows = Array.from(document.querySelectorAll('.tm-info-row')).map((row) => row.textContent);
    expect(rows).toEqual(['이 기기로그인 유지', '다른 기기모두 로그아웃', '비밀번호·계정 정보그대로예요']);
    expect(screen.getByRole('button', { name: REVOKE_BUTTON })).toBeEnabled();
    expect(screen.queryByText(SUCCESS_BANNER)).not.toBeInTheDocument();
    expect(revokeCalls).toHaveLength(0);
  });

  it('비밀번호가 있는 계정은 팁에서 비밀번호 변경으로 이어지고, 이 화면으로 돌아오게 한다', async () => {
    serveMe({ providers: ['email', 'kakao'], hasPassword: true });
    render(<LoginDevicesPageClient />);

    const link = await screen.findByRole('link', { name: '비밀번호 변경' });
    expect(link).toHaveAttribute('href', '/auth/find-account?mode=reset-password&from=%2Fmy%2Fsettings%2Fdevices');
    expect(link.closest('p')).toHaveTextContent('기기를 잃어버렸다면 비밀번호 변경도 함께 해 두면 더 안전해요.');
  });

  it('소셜로만 들어오는 계정은 바꿀 비밀번호가 없으니 링크 없이 그 계정의 보안을 말한다', async () => {
    serveMe({ providers: ['kakao'], hasPassword: false });
    render(<LoginDevicesPageClient />);

    expect(await screen.findByText('기기를 잃어버렸다면 카카오 계정의 보안도 함께 확인해 두면 더 안전해요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '비밀번호 변경' })).not.toBeInTheDocument();
  });

  it('계정 정보를 불러오지 못해도 다른 기기 로그아웃은 되고, 근거 없는 팁은 보이지 않는다', async () => {
    let meCalls = 0;
    server.use(http.get('*/api/v1/auth/me', () => {
      meCalls += 1;
      return failure(500, 'INTERNAL_ERROR', '서버 오류');
    }));
    recordRevokeRequests();
    render(<LoginDevicesPageClient />);
    await waitFor(() => expect(meCalls).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));

    expect(await screen.findByText(SUCCESS_BANNER)).toBeInTheDocument();
    expect(revokeCalls).toHaveLength(1);
    expect(screen.queryByText(/기기를 잃어버렸다면/)).not.toBeInTheDocument();
  });
});

describe('LoginDevicesPageClient - 다른 기기 로그아웃', () => {
  it('누르면 본문 없이 한 번 요청하고, 같은 화면에 결과 배너와 다시 누를 버튼을 보여 준다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    recordRevokeRequests();
    render(<LoginDevicesPageClient />);

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));

    expect(await screen.findByText(SUCCESS_BANNER)).toBeInTheDocument();
    expect(revokeCalls).toEqual([{ body: '' }]);
    expect(screen.getByText('방금 정리했어요. 다시 끊으려면 한 번 더 누르세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: REVOKE_AGAIN_BUTTON })).toBeEnabled();
    expect(screen.queryByRole('button', { name: REVOKE_BUTTON })).not.toBeInTheDocument();
    // 이 기기는 로그인된 채로 있으니 화면을 떠나지 않는다.
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(nav.router.replace).not.toHaveBeenCalled();
  });

  it('다시 한 번 로그아웃을 누르면 요청이 한 번 더 나간다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    recordRevokeRequests();
    render(<LoginDevicesPageClient />);

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));
    await userEvent.click(await screen.findByRole('button', { name: REVOKE_AGAIN_BUTTON }));

    await waitFor(() => expect(revokeCalls).toHaveLength(2));
    expect(screen.getByText(SUCCESS_BANNER)).toBeInTheDocument();
  });

  it('요청 중에는 버튼이 잠겨 두 번째 요청을 보내지 않는다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.post('*/api/v1/auth/sessions/revoke-others', async () => {
      revokeCalls.push({ body: '' });
      await gate;
      return ok({ revoked: true });
    }));
    render(<LoginDevicesPageClient />);

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));
    const pending = screen.getByRole('button', { name: REVOKE_BUTTON });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(pending);
    expect(revokeCalls).toHaveLength(1);

    release();
    expect(await screen.findByText(SUCCESS_BANNER)).toBeInTheDocument();
    expect(revokeCalls).toHaveLength(1);
  });

  it('실패하면 서버가 준 이유를 알리고, 성공 배너 없이 다시 시도할 수 있다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    server.use(http.post('*/api/v1/auth/sessions/revoke-others', () => failure(500, 'INTERNAL_ERROR', '잠시 문제가 생겼어요.')));
    render(<LoginDevicesPageClient />);

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));

    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 문제가 생겼어요.');
    expect(screen.queryByText(SUCCESS_BANNER)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: REVOKE_BUTTON })).toBeEnabled();

    server.resetHandlers();
    serveMe({ providers: ['email'], hasPassword: true });
    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));

    expect(await screen.findByText(SUCCESS_BANNER)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('성공한 뒤 다시 누른 요청이 실패하면 지난 성공 배너를 거두고 실패만 알린다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    render(<LoginDevicesPageClient />);

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));
    await screen.findByText(SUCCESS_BANNER);
    server.use(http.post('*/api/v1/auth/sessions/revoke-others', () => failure(429, 'THROTTLED', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.')));
    await userEvent.click(screen.getByRole('button', { name: REVOKE_AGAIN_BUTTON }));

    expect(await screen.findByRole('alert')).toHaveTextContent('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
    expect(screen.queryByText(SUCCESS_BANNER)).not.toBeInTheDocument();
  });

  it('서버가 이유를 주지 않은 실패는 해요체 안내로 알린다', async () => {
    serveMe({ providers: ['email'], hasPassword: true });
    server.use(http.post('*/api/v1/auth/sessions/revoke-others', () => new HttpResponse('<html>502</html>', { status: 502 })));
    render(<LoginDevicesPageClient />);

    await userEvent.click(screen.getByRole('button', { name: REVOKE_BUTTON }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다른 기기에서 로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});
