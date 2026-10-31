import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK_MSW } from '@/test/msw/auth-link-handlers';
import { v1MswHandlers } from '@/test/msw/handlers';
import { LoginMethodsPageClient } from './login-methods-page-client';

const nav = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  params: new URLSearchParams(),
}));
const signOut = vi.hoisted(() => ({
  signOutAndLeave: vi.fn(),
  pending: false,
  error: null as string | null,
}));
const kakaoOAuth = vi.hoisted(() => ({ startKakaoLinkAuthorize: vi.fn() }));
const reporter = vi.hoisted(() => ({ reportClientError: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/settings/login-methods',
  useRouter: () => nav.router,
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/auth/use-sign-out-and-leave', () => ({ useSignOutAndLeave: () => signOut }));
vi.mock('@/lib/kakao-oauth', () => kakaoOAuth);
vi.mock('@/lib/client-error-reporter', () => reporter);
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

let linkCalls: Array<{ provider: 'kakao' | 'apple'; body: unknown }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  linkCalls = [];
  nav.params = new URLSearchParams();
  signOut.pending = false;
  signOut.error = null;
  kakaoOAuth.startKakaoLinkAuthorize.mockResolvedValue({ status: 'redirecting' });
  server.use(
    http.post('*/api/v1/auth/apple/nonce', () => ok({ nonce: 'server-nonce-1234' })),
    // 공유 핸들러가 응답을 정하고, 이 화면이 실제로 어떤 본문을 보냈는지만 옆에서 기록한다.
    http.post('*/api/v1/auth/link/kakao', async ({ request }) => {
      linkCalls.push({ provider: 'kakao', body: await request.clone().json() });
      return undefined;
    }),
    http.post('*/api/v1/auth/link/apple', async ({ request }) => {
      linkCalls.push({ provider: 'apple', body: await request.clone().json() });
      return undefined;
    }),
  );
});
afterEach(() => {
  server.resetHandlers();
  delete window.TeameetNative;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-10-31T00:00:00.000Z' });
}

function me(providers: string[] | undefined, email: string | null = 'minsu.kim@example.com') {
  return {
    user: {
      id: 'user-1',
      email,
      onboardingStatus: 'completed',
      ...(providers ? { authProviders: providers } : {}),
    },
    profile: { displayName: '민수' },
  };
}

/** /auth/me 가 호출 순서대로 다른 로그인 수단을 돌려준다(마지막 값이 그 뒤 호출에 계속 쓰인다). */
function serveMe(...responses: Array<string[] | undefined>) {
  let calls = 0;
  server.use(http.get('*/api/v1/auth/me', () => ok(me(responses[Math.min(calls++, responses.length - 1)]))));
  return { calls: () => calls };
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** 앱 셸 역할: 요청을 받으면 `reply` 로 곧바로 답하고, `reply` 가 없으면 요청만 기록해 두고 `answer` 로 나중에 답한다. */
function installShell({
  supports,
  reply,
}: {
  supports: string[];
  reply?: { kakao?: Record<string, unknown>; apple?: Record<string, unknown> };
}) {
  const requests: Array<{ type: string; requestId: string }> = [];
  const dispatch = (type: string, requestId: string, detail: Record<string, unknown>) => {
    const event = type === 'sign-in-with-kakao' ? 'teameet:native-kakao-result' : 'teameet:native-apple-result';
    window.dispatchEvent(new CustomEvent(event, { detail: { requestId, ...detail } }));
  };
  const postMessage = vi.fn((message: string) => {
    const request = JSON.parse(message) as { type: string; requestId: string };
    requests.push(request);
    const auto = request.type === 'sign-in-with-kakao' ? reply?.kakao : reply?.apple;
    if (auto) dispatch(request.type, request.requestId, auto);
  });
  window.TeameetNative = { supports, postMessage };
  return {
    postMessage,
    answer: (detail: Record<string, unknown>) => {
      const last = requests.at(-1);
      if (!last) throw new Error('the shell has not been asked anything yet');
      act(() => dispatch(last.type, last.requestId, detail));
    },
  };
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function setQuery(query: string) {
  nav.params = new URLSearchParams(query);
}

async function renderLoaded(...providers: Array<string[] | undefined>) {
  const me = serveMe(...providers);
  render(<LoginMethodsPageClient />);
  await screen.findByRole('list', { name: '로그인 방법 목록' });
  return me;
}

function rowOf(label: string) {
  return screen.getByText(label).closest('li') as HTMLElement;
}

const KAKAO_BUTTON = '카카오 연결하기';
const EMAIL_LINK = '이메일 연결하기';

describe('LoginMethodsPageClient - 로그인 수단 표시', () => {
  it('이메일만 있는 계정은 이메일을 연결됨으로, 카카오는 연결하기 버튼으로, Apple은 앱 안내로 보인다', async () => {
    await renderLoaded(['email']);

    const email = rowOf('이메일·비밀번호');
    expect(within(email).getByText('minsu.kim@example.com')).toBeInTheDocument();
    expect(within(email).getByText('연결됨')).toBeInTheDocument();
    expect(within(email).queryByRole('link', { name: EMAIL_LINK })).not.toBeInTheDocument();
    expect(screen.queryByText('이메일 로그인')).not.toBeInTheDocument();
    const kakao = within(rowOf('카카오 로그인')).getByRole('button', { name: KAKAO_BUTTON });
    expect(kakao).toBeEnabled();
    // 브랜드색은 클래스가 입힌다 — 인라인 배경은 hover 색 변화를 막는다.
    expect(kakao).toHaveClass('tm-auth-kakao');
    expect(kakao.style.background).toBe('');
    const apple = rowOf('Apple 로그인');
    expect(within(apple).getByText('Apple 연결은 iOS 앱에서 할 수 있어요')).toBeInTheDocument();
    expect(within(apple).getByText('앱에서만')).toBeInTheDocument();
    expect(within(apple).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/연결해도 팀과 경기 기록은 그대로예요/)).toBeInTheDocument();
  });

  it('카카오로만 가입한 계정은 이메일·비밀번호 줄에서 전용 화면으로 가는 링크를 보이고, 계정 이메일이 바뀐다는 안내를 준다', async () => {
    await renderLoaded(['kakao']);

    const email = rowOf('이메일·비밀번호');
    expect(within(email).getByText('연결하면 이메일과 비밀번호로도 이 계정에 들어와요')).toBeInTheDocument();
    expect(within(email).queryByText('연결됨')).not.toBeInTheDocument();
    // 버튼이 아니라 단계 화면으로 가는 링크다 — 눌러도 이 화면에서 요청이 나가지 않는다.
    expect(within(email).getByRole('link', { name: EMAIL_LINK })).toHaveAttribute('href', '/my/settings/login-methods/email');
    expect(screen.getByText(/이메일을 연결하면 계정 이메일이 그 주소로 바뀌어요\. 팀과 경기 기록은 그대로예요\./)).toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: KAKAO_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByText(/연결해도 팀과 경기 기록은 그대로예요/)).not.toBeInTheDocument();
  });

  it('카카오도 이메일도 없는 계정은 안내를 두 번 반복하지 않는다', async () => {
    await renderLoaded(['apple']);

    expect(screen.getByRole('link', { name: EMAIL_LINK })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeInTheDocument();
    expect(screen.getAllByText(/팀과 경기 기록은 그대로예요/)).toHaveLength(1);
  });

  it('이메일과 카카오가 둘 다 있으면 두 줄 모두 연결됨이고 연결하기 버튼이 없다', async () => {
    await renderLoaded(['email', 'kakao']);

    expect(within(rowOf('이메일·비밀번호')).getByText('연결됨')).toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument();
    expect(within(rowOf('Apple 로그인')).queryByText('연결됨')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: KAKAO_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: EMAIL_LINK })).not.toBeInTheDocument();
    expect(screen.queryByText(/계정 이메일이 그 주소로 바뀌어요/)).not.toBeInTheDocument();
  });

  it('Apple이 연결된 계정은 Apple 줄에 연결됨을 보이고 앱 안내는 없다', async () => {
    await renderLoaded(['email', 'apple']);

    const apple = rowOf('Apple 로그인');
    expect(within(apple).getByText('연결됨')).toBeInTheDocument();
    expect(within(apple).queryByText('앱에서만')).not.toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).queryByText('연결됨')).not.toBeInTheDocument();
  });

  it('이전 네이버 로그인이 있는 계정은 그 수단을 숨기지 않고 연결됨으로 보인다', async () => {
    await renderLoaded(['email', 'naver']);

    expect(within(rowOf('네이버 로그인')).getByText('연결됨')).toBeInTheDocument();
  });

  it('연결 해제 버튼은 어디에도 없다', async () => {
    await renderLoaded(['email', 'kakao', 'apple']);

    expect(screen.queryByRole('button', { name: /해제|끊기|삭제/ })).not.toBeInTheDocument();
  });

  it('불러오지 못하면 다시 시도로 이어진다', async () => {
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json(
      { status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: 'x', timestamp: '2026-10-31T00:00:00.000Z' },
      { status: 500 },
    )));
    render(<LoginMethodsPageClient />);
    expect(await screen.findByText('로그인 방법을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();

    serveMe(['email']);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(await screen.findByRole('list', { name: '로그인 방법 목록' })).toBeInTheDocument();
  });

  it('로그인 수단 목록이 없는 응답으로는 모두 미연결인 것처럼 그리지 않는다', async () => {
    serveMe(undefined);
    render(<LoginMethodsPageClient />);

    expect(await screen.findByText('로그인 방법을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: KAKAO_BUTTON })).not.toBeInTheDocument();
  });
});

describe('LoginMethodsPageClient - 웹에서 카카오 연결', () => {
  it('앱 셸이 없으면 이 화면으로 돌아오는 카카오 인가를 시작하고 연결 API는 부르지 않는다', async () => {
    await renderLoaded(['email']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledExactlyOnceWith({ returnTo: '/my/settings/login-methods' });
    expect(linkCalls).toEqual([]);
  });

  it('인가로 넘어가는 동안 버튼이 잠기고 다시 눌러도 인가를 한 번만 시작한다', async () => {
    kakaoOAuth.startKakaoLinkAuthorize.mockReturnValue(new Promise(() => {}));
    await renderLoaded(['email']);

    const button = screen.getByRole('button', { name: KAKAO_BUTTON });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: '연결 중이에요…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
  });

  it('카카오톡 앱으로 넘어갔다가 인증을 취소하고 돌아오면(페이지는 그대로) 버튼이 다시 풀린다', async () => {
    await renderLoaded(['email']);
    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));
    expect(await screen.findByRole('button', { name: '연결 중이에요…' })).toBeDisabled();

    setVisibility('hidden');
    expect(screen.getByRole('button', { name: '연결 중이에요…' })).toBeDisabled();
    setVisibility('visible');

    expect(await screen.findByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
  });

  it('카카오 인가를 시작하기 전(SDK 준비 중)에는 화면이 다시 보여도 풀리지 않는다', async () => {
    kakaoOAuth.startKakaoLinkAuthorize.mockReturnValue(new Promise(() => {}));
    await renderLoaded(['email']);
    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    setVisibility('hidden');
    setVisibility('visible');

    expect(screen.getByRole('button', { name: '연결 중이에요…' })).toBeDisabled();
  });

  it.each([
    ['not-configured', '카카오 연결을 지금은 쓸 수 없어요. 잠시 후 다시 시도해 주세요.'],
    ['storage-unavailable', '브라우저 설정 때문에 연결을 진행할 수 없어요. 시크릿/프라이빗 모드를 끄고 다시 시도해 주세요.'],
  ])('인가를 시작할 수 없으면(%s) 이유를 알리고 버튼을 다시 쓸 수 있게 한다', async (reason, message) => {
    kakaoOAuth.startKakaoLinkAuthorize.mockResolvedValue({ status: 'unavailable', reason });
    await renderLoaded(['email']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
  });
});

describe('LoginMethodsPageClient - 앱에서 연결', () => {
  it('카카오는 인가 화면 대신 앱의 카카오 인증을 받아 연결하고, 연결된 수단으로 줄이 바뀐다', async () => {
    const shell = installShell({
      supports: ['sign-in-with-kakao'],
      reply: { kakao: { accessToken: LINK_MSW.credentials.ok } },
    });
    const meCalls = await renderLoaded(['email'], ['email', 'kakao']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(await screen.findByText('카카오 로그인이 연결됐어요. 이제 카카오로도 같은 계정에 들어올 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText('카카오 로그인이 연결됐어요')).toBeInTheDocument();
    expect(shell.postMessage).toHaveBeenCalledTimes(1);
    expect(linkCalls).toEqual([{ provider: 'kakao', body: { accessToken: LINK_MSW.credentials.ok } }]);
    expect(kakaoOAuth.startKakaoLinkAuthorize).not.toHaveBeenCalled();
    await waitFor(() => expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: KAKAO_BUTTON })).not.toBeInTheDocument();
    expect(meCalls.calls()).toBe(2);
  });

  it('앱 인증이 진행 중일 때 화면이 다시 보여도 버튼을 풀지 않는다(요청은 앱의 응답으로 끝난다)', async () => {
    const shell = installShell({ supports: ['sign-in-with-kakao'] });
    await renderLoaded(['email']);
    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    setVisibility('hidden');
    setVisibility('visible');

    expect(screen.getByRole('button', { name: '연결 중이에요…' })).toBeDisabled();
    shell.answer({ cancelled: true });
    await waitFor(() => expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled());
  });

  it('카카오 인증을 닫으면 안내도 오류도 없이 버튼만 다시 쓸 수 있다', async () => {
    installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { cancelled: true } } });
    await renderLoaded(['email']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    await waitFor(() => expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled());
    expect(linkCalls).toEqual([]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/연결하지 못했어요|연결됐어요/)).not.toBeInTheDocument();
  });

  it('앱이 토큰 없이 오류로 답하면 연결하지 못했다고 알리고 원인을 기록한다', async () => {
    installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { error: 'sdk-failed' } } });
    await renderLoaded(['email']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(await screen.findByText('카카오 로그인을 연결하지 못했어요')).toBeInTheDocument();
    expect(linkCalls).toEqual([]);
    expect(reporter.reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Native kakao link failed', context: { reason: 'sdk-failed' } }),
    );
  });

  it('카카오 연결 중에는 두 번째 요청을 보내지 않고 Apple 버튼도 함께 잠긴다', async () => {
    const shell = installShell({ supports: ['sign-in-with-kakao', 'sign-in-with-apple'] });
    await renderLoaded(['email']);
    const apple = screen.getByRole('button', { name: 'Apple 연결하기' });

    const kakao = screen.getByRole('button', { name: KAKAO_BUTTON });
    await userEvent.click(kakao);
    await userEvent.click(kakao);

    expect(shell.postMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '연결 중이에요…' })).toBeDisabled();
    expect(apple).toBeDisabled();

    shell.answer({ accessToken: LINK_MSW.credentials.ok });

    expect(await screen.findByText(/이제 카카오로도 같은 계정에 들어올 수 있어요/)).toBeInTheDocument();
    expect(linkCalls).toHaveLength(1);
    await waitFor(() => expect(apple).toBeEnabled());
  });

  it('Apple은 서버 nonce를 받아 앱의 Apple 인증으로 연결한다', async () => {
    installShell({
      supports: ['sign-in-with-apple'],
      reply: { apple: { ok: true, identityToken: LINK_MSW.credentials.ok, authorizationCode: 'auth-code-1234' } },
    });
    await renderLoaded(['email']);

    await userEvent.click(await screen.findByRole('button', { name: 'Apple 연결하기' }));

    expect(await screen.findByText('Apple 로그인이 연결됐어요. 이제 Apple로도 같은 계정에 들어올 수 있어요.')).toBeInTheDocument();
    expect(linkCalls).toEqual([{
      provider: 'apple',
      body: { identityToken: LINK_MSW.credentials.ok, nonce: 'server-nonce-1234', authorizationCode: 'auth-code-1234' },
    }]);
    expect(within(rowOf('Apple 로그인')).queryByText('앱에서만')).not.toBeInTheDocument();
  });

  it('앱이 Apple을 지원하지 않으면(안드로이드 등) Apple 버튼 없이 iOS 앱 안내만 보인다', async () => {
    installShell({ supports: ['sign-in-with-kakao'] });
    await renderLoaded(['email']);

    expect(screen.queryByRole('button', { name: 'Apple 연결하기' })).not.toBeInTheDocument();
    expect(screen.getByText('Apple 연결은 iOS 앱에서 할 수 있어요')).toBeInTheDocument();
  });

  it('가입이 덜 끝난 계정이면 안내 대신 가입 이어가기 화면으로 보낸다', async () => {
    installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { accessToken: LINK_MSW.credentials.signupIncomplete } } });
    await renderLoaded(['email']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith(LINK_MSW.signupIncompleteRoute));
    expect(screen.queryByText(/연결하지 못했어요/)).not.toBeInTheDocument();
  });

  // 서버 응답(연결 API)이 돌려주는 모든 갈래가 같은 안내로 이어진다.
  it.each([
    ['alreadyLinked', '카카오 로그인은 이미 이 계정에 연결돼 있어요.'],
    ['mergedPending', '카카오 로그인이 연결됐어요. 카카오로 가입하다 멈춘 계정은 정리하고 이 계정으로 옮겼어요.'],
    ['providerInUse', '이미 다른 계정에 연결된 카카오 계정이에요'],
    ['providerExists', '이미 다른 카카오 계정이 연결돼 있어요'],
    ['recentLoginRequired', '보안을 위해 다시 로그인해 주세요'],
    ['unknown-credential', '카카오 로그인을 연결하지 못했어요'],
  ] as const)('연결 API 결과(%s)를 사람 말로 알린다', async (scenario, text) => {
    const credential = scenario === 'unknown-credential' ? 'msw-link-credential-unknown' : LINK_MSW.credentials[scenario];
    installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { accessToken: credential } } });
    await renderLoaded(['email']);

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(await screen.findByText(text)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled());
  });
});

describe('LoginMethodsPageClient - 카카오를 다녀온 결과(주소 쿼리)', () => {
  // 9가지 결과 모두: 안내가 보이고, 주소에서는 결과 쿼리가 지워진다.
  it.each([
    ['linked', '카카오 로그인이 연결됐어요. 이제 카카오로도 같은 계정에 들어올 수 있어요.'],
    ['merged', '카카오 로그인이 연결됐어요. 카카오로 가입하다 멈춘 계정은 정리하고 이 계정으로 옮겼어요.'],
    ['already', '카카오 로그인은 이미 이 계정에 연결돼 있어요.'],
    ['in_use', '이미 다른 계정에 연결된 카카오 계정이에요'],
    ['exists', '이미 다른 카카오 계정이 연결돼 있어요'],
    ['recent_login', '보안을 위해 다시 로그인해 주세요'],
    ['mismatch', '다른 계정에 로그인했어요'],
    ['expired', '연결 시간이 지났어요'],
    ['failed', '카카오 로그인을 연결하지 못했어요'],
  ])('linkResult=%s 를 안내하고 주소에서 지운다', async (linkResult, text) => {
    setQuery(`linkResult=${linkResult}&provider=kakao`);
    await renderLoaded(['email']);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(nav.router.replace).toHaveBeenCalledWith('/my/settings/login-methods', { scroll: false });
  });

  it('다른 쿼리는 지우지 않고 결과 쿼리만 지운다', async () => {
    setQuery('from=%2Fmy%2Fsettings&linkResult=linked&provider=kakao');
    await renderLoaded(['email']);

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith(
      '/my/settings/login-methods?from=%2Fmy%2Fsettings',
      { scroll: false },
    ));
  });

  it('Apple 결과는 Apple 이름으로 안내한다', async () => {
    setQuery('linkResult=in_use&provider=apple');
    await renderLoaded(['email']);

    expect(await screen.findByText('이미 다른 계정에 연결된 Apple 계정이에요')).toBeInTheDocument();
    expect(screen.getByText(/이 Apple 계정은 다른 팀밋 계정에서 쓰고 있어요/)).toBeInTheDocument();
  });

  it.each([
    'linkResult=unknown&provider=kakao',
    'linkResult=linked&provider=naver',
    'linkResult=linked',
    'provider=kakao',
  ])('계약 밖의 값(%s)은 안내도 주소 정리도 하지 않는다', async (query) => {
    setQuery(query);
    await renderLoaded(['email']);

    expect(screen.queryByText(/연결됐어요|연결하지 못했어요|연결돼 있어요/)).not.toBeInTheDocument();
    expect(nav.router.replace).not.toHaveBeenCalled();
  });

  it('새로 연결된 결과는 토스트로도 알리고, 이미 연결돼 있던 결과는 알리지 않는다', async () => {
    setQuery('linkResult=linked&provider=kakao');
    await renderLoaded(['email', 'kakao']);
    expect(await screen.findByText('카카오 로그인이 연결됐어요')).toBeInTheDocument();
  });

  it('이미 연결돼 있던 결과에는 토스트가 없다', async () => {
    setQuery('linkResult=already&provider=kakao');
    await renderLoaded(['email', 'kakao']);

    expect(await screen.findByText('카카오 로그인은 이미 이 계정에 연결돼 있어요.')).toBeInTheDocument();
    expect(screen.queryByText('카카오 로그인이 연결됐어요')).not.toBeInTheDocument();
  });
});

describe('LoginMethodsPageClient - 결과 카드의 다음 행동', () => {
  it('다시 로그인 필요: 로그아웃한 뒤 이 화면으로 돌아오는 로그인으로 보낸다', async () => {
    setQuery('linkResult=recent_login&provider=kakao');
    await renderLoaded(['email']);

    await userEvent.click(await screen.findByRole('button', { name: '다시 로그인하기' }));

    expect(signOut.signOutAndLeave).toHaveBeenCalledExactlyOnceWith(
      '/login?redirect=%2Fmy%2Fsettings%2Flogin-methods',
      { failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.' },
    );
  });

  it('로그아웃이 실패하면 그 이유를 카드 안에서 알린다', async () => {
    signOut.error = '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.';
    setQuery('linkResult=recent_login&provider=kakao');
    await renderLoaded(['email']);

    expect(await screen.findByText(signOut.error)).toBeInTheDocument();
  });

  it('로그아웃 진행 중에는 다시 로그인 버튼이 잠긴다', async () => {
    signOut.pending = true;
    setQuery('linkResult=recent_login&provider=kakao');
    await renderLoaded(['email']);

    expect(await screen.findByRole('button', { name: '다시 로그인하기' })).toBeDisabled();
  });

  it('이미 다른 계정이 쓰는 경우: 고객센터 문의로 갈 수 있고 닫으면 안내가 사라진다', async () => {
    setQuery('linkResult=in_use&provider=kakao');
    await renderLoaded(['email']);

    expect(await screen.findByRole('link', { name: '고객센터 문의' })).toHaveAttribute('href', '/my/inquiries/new');
    expect(screen.queryByRole('button', { name: '다시 로그인하기' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByText('이미 다른 계정에 연결된 카카오 계정이에요')).not.toBeInTheDocument();
  });

  it('방금 연결한 줄만 "방금 연결했어요"를 말하고, 다른 때는 평소 문구다', async () => {
    setQuery('linkResult=linked&provider=kakao');
    await renderLoaded(['email', 'kakao']);
    expect(within(rowOf('카카오 로그인')).getByText('방금 연결했어요')).toBeInTheDocument();
    expect(within(rowOf('이메일·비밀번호')).queryByText('방금 연결했어요')).not.toBeInTheDocument();
  });

  it('이미 연결돼 있던 결과나 결과가 없을 때는 평소 문구를 쓴다', async () => {
    setQuery('linkResult=already&provider=kakao');
    await renderLoaded(['email', 'kakao']);
    expect(within(rowOf('카카오 로그인')).getByText('카카오 버튼으로 이 계정에 들어와요')).toBeInTheDocument();
    expect(screen.queryByText('방금 연결했어요')).not.toBeInTheDocument();
  });

  it('안내받은 계정과 다른 계정인데 웹이라 Apple 버튼이 없으면 없는 버튼을 가리키지 않고 iOS 앱 안내로 바꾼다', async () => {
    setQuery('linkResult=mismatch&provider=apple');
    await renderLoaded(['email']);

    expect(await screen.findByText('처음 안내받은 계정과 달라서 연결하지 않았어요. Apple 연결은 iOS 앱에서 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/아래에서 직접 연결해 주세요/)).not.toBeInTheDocument();
  });

  it('연결 시간이 지났으면 이 화면의 연결하기 버튼으로 이어 주고, 웹의 Apple이면 iOS 앱 안내로 바꾼다', async () => {
    setQuery('linkResult=expired&provider=kakao');
    await renderLoaded(['email']);
    expect(await screen.findByText('로그인하기 전에 연결 시간이 지나서 연결하지 않았어요. 이 계정에 연결하려면 아래에서 직접 연결해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
  });

  it('웹에서 Apple 연결 시간이 지났으면 없는 버튼 대신 iOS 앱 안내를 한다', async () => {
    setQuery('linkResult=expired&provider=apple');
    await renderLoaded(['email']);
    expect(await screen.findByText('로그인하기 전에 연결 시간이 지나서 연결하지 않았어요. Apple 연결은 iOS 앱에서 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/아래에서 직접 연결해 주세요/)).not.toBeInTheDocument();
  });

  it('안내받은 계정과 다른 계정인데 iOS 앱이라 Apple 버튼이 있으면 아래 버튼으로 이어 준다', async () => {
    installShell({ supports: ['sign-in-with-apple'] });
    setQuery('linkResult=mismatch&provider=apple');
    await renderLoaded(['email']);

    expect(await screen.findByText(/아래에서 직접 연결해 주세요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apple 연결하기' })).toBeEnabled();
  });

  it('안내받은 계정과 다른 계정이면 어느 계정인지 말하지 않고, 이 화면의 연결하기 버튼으로 이어 준다', async () => {
    setQuery('linkResult=mismatch&provider=kakao');
    await renderLoaded(['email']);

    expect(await screen.findByText('다른 계정에 로그인했어요')).toBeInTheDocument();
    expect(screen.getByText('처음 안내받은 계정과 달라서 연결하지 않았어요. 이 계정에 연결하려면 아래에서 직접 연결해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '고객센터 문의' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 로그인하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
  });

  it('새 연결을 시작하면 앞 결과 안내를 거둔다', async () => {
    setQuery('linkResult=failed&provider=kakao');
    kakaoOAuth.startKakaoLinkAuthorize.mockReturnValue(new Promise(() => {}));
    await renderLoaded(['email']);
    expect(await screen.findByText('카카오 로그인을 연결하지 못했어요')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(screen.queryByText('카카오 로그인을 연결하지 못했어요')).not.toBeInTheDocument();
  });
});
