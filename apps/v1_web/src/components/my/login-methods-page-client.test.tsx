import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
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
let unlinkCalls: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  linkCalls = [];
  unlinkCalls = [];
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
    http.post('*/api/v1/auth/identities/unlink', async ({ request }) => {
      unlinkCalls.push(await request.clone().json());
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
      canLinkLoginMethods: true,
      ...(providers ? { authProviders: providers } : {}),
      // 서버는 이메일 로그인 행에 비밀번호가 있을 때만 true 로 내린다.
      hasPassword: providers?.includes('email') ?? false,
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

// 줄 제목과 같은 글자의 버튼(「카카오 로그인」)이 있어 글자만으로는 줄을 못 찾는다 — 제목 칸으로 고른다.
function rowOf(label: string) {
  const rows = within(screen.getByRole('list', { name: '로그인 방법 목록' })).getAllByRole('listitem');
  const row = rows.find((item) => item.querySelector('.tm-text-label')?.textContent === label);
  if (!row) throw new Error(`no login method row titled ${label}`);
  return row;
}

const KAKAO_BUTTON = '카카오 로그인';
const EMAIL_LINK = '이메일 연결하기';
const UNLINK_ANY = /연결 해제$/;
const LAST_METHOD_NOTE = '마지막 로그인 방법이라 해제할 수 없어요';

describe('LoginMethodsPageClient - 로그인 수단 표시', () => {
  it('가입 정보를 미룬 계정은 연결 금지 대신 입력 후 돌아올 경로를 보여 준다', async () => {
    const account = me(['kakao']);
    server.use(http.get('*/api/v1/auth/me', () => ok({
      ...account,
      user: {
        ...account.user,
        onboardingStatus: 'social_profile_deferred',
        canLinkLoginMethods: false,
        canLinkAfterSignup: true,
      },
    })));
    render(<LoginMethodsPageClient />);
    const completeSignup = await screen.findByRole('link', { name: '가입 정보 입력하기' });
    const destination = new URL(completeSignup.getAttribute('href')!, 'https://teameet.test');
    expect(destination.pathname).toBe('/signup/social');
    expect(destination.searchParams.get('redirect')).toBe('/my/settings/login-methods');
    expect(screen.queryByText('이 계정에서는 로그인 방법을 추가할 수 없어요.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: EMAIL_LINK })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: KAKAO_BUTTON })).not.toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
    expect(screen.queryByText(LAST_METHOD_NOTE)).not.toBeInTheDocument();
  });

  it('운영 권한 계정은 연결할 수 없는 로그인 추가 버튼을 보여 주지 않는다', async () => {
    server.use(http.get('*/api/v1/auth/me', () => ok({ ...me(['email']), user: { ...me(['email']).user, canLinkLoginMethods: false } })));
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });
    expect(screen.getByText('이 계정에서는 로그인 방법을 추가할 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: EMAIL_LINK })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: KAKAO_BUTTON })).not.toBeInTheDocument();
    expect(within(rowOf('이메일·비밀번호')).getByText('연결됨')).toBeInTheDocument();
    // 서버가 어차피 거절하는 계정이라 해제 버튼도, 마지막 수단이라는 이유도 보이지 않는다.
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
    expect(screen.queryByText(LAST_METHOD_NOTE)).not.toBeInTheDocument();
  });


  it('서버가 연결 권한을 제공하지 않으면 연결 버튼 대신 재시도를 안내한다', async () => {
    const stale = me(['kakao']);
    const { canLinkLoginMethods: _omitted, ...user } = stale.user;
    server.use(http.get('*/api/v1/auth/me', () => ok({ ...stale, user })));
    render(<LoginMethodsPageClient />);
    expect(await screen.findByText('로그인 방법 변경 권한을 확인하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: EMAIL_LINK })).not.toBeInTheDocument();
  });

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
    expect(kakao.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
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
    expect(within(email).getByRole('link', { name: EMAIL_LINK }).querySelector('svg')).toBeNull();
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

  it('다른 수단이 남는 연결된 줄마다 해제 버튼이 있고, 앱에서만 연결하는 줄에는 없다', async () => {
    await renderLoaded(['email', 'kakao']);

    const email = within(rowOf('이메일·비밀번호')).getByRole('button', { name: '이메일 로그인 연결 해제' });
    const kakao = within(rowOf('카카오 로그인')).getByRole('button', { name: '카카오 로그인 연결 해제' });
    for (const button of [email, kakao]) {
      expect(button).toHaveTextContent('연결 해제');
      expect(button).toBeEnabled();
      // 터치 높이 44px 는 .tm-btn-sm 이 맡고, 빨간 글자는 .tm-danger-text 가 입힌다.
      expect(button).toHaveClass('tm-btn-sm', 'tm-danger-text');
    }
    expect(within(rowOf('Apple 로그인')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(LAST_METHOD_NOTE)).not.toBeInTheDocument();
  });

  it('남은 수단이 하나뿐이면 해제 버튼 대신 이유를 보인다', async () => {
    await renderLoaded(['kakao']);

    const kakao = rowOf('카카오 로그인');
    expect(within(kakao).getByText(LAST_METHOD_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
  });

  it('Apple 도 서버가 웹에서 떼는 것을 받으므로 연결돼 있으면 해제 버튼이 있다', async () => {
    await renderLoaded(['email', 'apple']);

    expect(within(rowOf('Apple 로그인')).getByRole('button', { name: 'Apple 로그인 연결 해제' })).toBeEnabled();
  });

  it('네이버는 서버가 떼지 않는 수단이라 버튼이 없고, 로그인할 길도 없어 남는 수단으로 세지 않는다', async () => {
    await renderLoaded(['email', 'naver']);

    expect(within(rowOf('네이버 로그인')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rowOf('네이버 로그인')).getByText('지금은 네이버로 로그인할 수 없어요')).toBeInTheDocument();
    expect(within(rowOf('이메일·비밀번호')).getByText(LAST_METHOD_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
  });

  it('카카오와 네이버뿐인 계정은 카카오를 못 떼고, 카카오와 이메일이 함께 있으면 뗄 수 있다', async () => {
    await renderLoaded(['kakao', 'naver']);
    expect(within(rowOf('카카오 로그인')).getByText(LAST_METHOD_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
    cleanup();

    await renderLoaded(['kakao', 'email', 'naver']);
    expect(within(rowOf('카카오 로그인')).getByRole('button', { name: '카카오 로그인 연결 해제' })).toBeEnabled();
  });

  it('비밀번호가 없는 이메일 행은 남는 수단으로 세지 않아, 카카오는 마지막 수단이고 이메일 행은 뗄 수 있다', async () => {
    server.use(http.get('*/api/v1/auth/me', () => ok({ ...me(['kakao', 'email']), user: { ...me(['kakao', 'email']).user, hasPassword: false } })));
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    expect(within(rowOf('카카오 로그인')).getByText(LAST_METHOD_NOTE)).toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
    expect(within(rowOf('이메일·비밀번호')).getByRole('button', { name: '이메일 로그인 연결 해제' })).toBeEnabled();
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
    // 처리 중에는 심볼 자리를 스피너가 맡는다.
    expect(busy.querySelectorAll('svg')).toHaveLength(1);
    expect(busy.querySelector('.tm-auth-kakao-label')).toBeNull();
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
    expect(screen.queryByText('카카오 계정 로그인 화면으로 이동할게요')).not.toBeInTheDocument();
    expect(screen.queryByText(/연결하지 못했어요|연결됐어요/)).not.toBeInTheDocument();
    expect(kakaoOAuth.startKakaoLinkAuthorize).not.toHaveBeenCalled();
  });

  describe('앱의 카카오 인증이 실패하면 웹 연결로 넘어간다', () => {
    const HANDOFF = '카카오 계정 로그인 화면으로 이동할게요';

    it.each([
      ['오류로 답하면', { error: 'sdk-failed' }, 'sdk-failed'],
      ['이미 진행 중이라고 답하면', { error: 'failed("Kakao sign-in is already in progress")' }, 'failed("Kakao sign-in is already in progress")'],
      ['토큰 없이 답하면', {}, 'missing-token'],
    ])('앱이 %s 실패 안내 없이 이 화면으로 돌아오는 웹 카카오 인가를 시작하고 원인을 기록한다', async (_label, kakao, reason) => {
      installShell({ supports: ['sign-in-with-kakao'], reply: { kakao } });
      await renderLoaded(['email']);

      await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

      expect(await screen.findByText(HANDOFF)).toHaveAttribute('role', 'status');
      expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledExactlyOnceWith({ returnTo: '/my/settings/login-methods' });
      expect(linkCalls).toEqual([]);
      expect(screen.queryByText('카카오 로그인을 연결하지 못했어요')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(reporter.reportClientError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Native kakao link failed', context: { reason, fallback: 'web_authorize' } }),
      );
    });

    it('넘어가는 동안 버튼은 잠긴 채 남고 다시 눌러도 앱에 다시 묻지 않는다', async () => {
      kakaoOAuth.startKakaoLinkAuthorize.mockReturnValue(new Promise(() => {}));
      const shell = installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { error: 'sdk-failed' } } });
      await renderLoaded(['email']);

      await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));
      await waitFor(() => expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('button', { name: '연결 중이에요…' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: '연결 중이에요…' }));

      expect(shell.postMessage).toHaveBeenCalledTimes(1);
      expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledTimes(1);
    });

    it('앱이 끝내 답하지 않아도(시간 초과) 같은 웹 연결로 넘어간다', async () => {
      installShell({ supports: ['sign-in-with-kakao'] });
      await renderLoaded(['email']);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));
        expect(kakaoOAuth.startKakaoLinkAuthorize).not.toHaveBeenCalled();
        await act(() => vi.advanceTimersByTimeAsync(120_000));

        expect(await screen.findByText(HANDOFF)).toHaveAttribute('role', 'status');
        expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledTimes(1);
        expect(reporter.reportClientError).toHaveBeenCalledWith(
          expect.objectContaining({ context: { reason: 'timeout', fallback: 'web_authorize' } }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('앱 브리지가 요청을 거절해도 같은 웹 연결로 넘어간다', async () => {
      installShell({ supports: ['sign-in-with-kakao'] });
      (window.TeameetNative as { postMessage: unknown }).postMessage = vi.fn(() => { throw new Error('bridge closed'); });
      await renderLoaded(['email']);

      await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

      expect(await screen.findByText(HANDOFF)).toHaveAttribute('role', 'status');
      expect(kakaoOAuth.startKakaoLinkAuthorize).toHaveBeenCalledTimes(1);
      expect(reporter.reportClientError).toHaveBeenCalledWith(
        expect.objectContaining({ context: { reason: 'native-request-error', fallback: 'web_authorize' } }),
      );
    });

    it('웹 인가를 시작할 수 없으면 그 이유를 알리고 버튼을 다시 쓸 수 있게 한다', async () => {
      kakaoOAuth.startKakaoLinkAuthorize.mockResolvedValue({ status: 'unavailable', reason: 'storage-unavailable' });
      installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { error: 'sdk-failed' } } });
      await renderLoaded(['email']);

      await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

      expect(await screen.findByRole('alert')).toHaveTextContent('브라우저 설정 때문에 연결을 진행할 수 없어요');
      expect(screen.queryByText(HANDOFF)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
    });

    it('카카오 화면에서 돌아오면 안내가 사라지고 버튼을 다시 쓸 수 있다', async () => {
      installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { error: 'sdk-failed' } } });
      await renderLoaded(['email']);
      await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));
      expect(await screen.findByText(HANDOFF)).toHaveAttribute('role', 'status');

      setVisibility('hidden');
      setVisibility('visible');

      expect(await screen.findByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
      expect(screen.queryByText(HANDOFF)).not.toBeInTheDocument();
    });

    it('앱 인증은 받았는데 연결 API 가 거절하면 웹으로 넘어가지 않고 그 결과를 알린다', async () => {
      installShell({ supports: ['sign-in-with-kakao'], reply: { kakao: { accessToken: LINK_MSW.credentials.providerInUse } } });
      await renderLoaded(['email']);

      await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

      expect(await screen.findByText('이미 다른 계정에 연결된 카카오 계정이에요')).toBeInTheDocument();
      expect(kakaoOAuth.startKakaoLinkAuthorize).not.toHaveBeenCalled();
      expect(screen.queryByText(HANDOFF)).not.toBeInTheDocument();
      expect(reporter.reportClientError).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Native kakao link failed' }));
    });

    it('Apple 은 앱 인증이 실패해도 웹으로 넘어가지 않고 실패를 알린다', async () => {
      installShell({ supports: ['sign-in-with-apple'], reply: { apple: { ok: false, error: 'apple-failed' } } });
      await renderLoaded(['email']);

      await userEvent.click(await screen.findByRole('button', { name: 'Apple 연결하기' }));

      expect(await screen.findByText('Apple 로그인을 연결하지 못했어요')).toBeInTheDocument();
      expect(kakaoOAuth.startKakaoLinkAuthorize).not.toHaveBeenCalled();
      expect(screen.queryByText(HANDOFF)).not.toBeInTheDocument();
    });
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

function failUnlink(statusCode: number, code: string, message: string, details: Record<string, unknown> | null = null) {
  // server.use 는 앞에 끼우므로 beforeEach 의 기록용 핸들러보다 먼저 답한다.
  server.use(http.post('*/api/v1/auth/identities/unlink', async ({ request }) => {
    unlinkCalls.push(await request.clone().json());
    return HttpResponse.json(
      { status: 'error', statusCode, code, message, details, timestamp: '2026-11-07T00:00:00.000Z' },
      { status: statusCode },
    );
  }));
}

/** 공유 핸들러는 provider 마다 정해진 답만 하므로(이메일은 마지막 수단 거절), 이메일 해제 성공은 여기서 정한다. */
function succeedUnlink(provider: string, authProviders: string[]) {
  server.use(http.post('*/api/v1/auth/identities/unlink', async ({ request }) => {
    unlinkCalls.push(await request.clone().json());
    return ok({ provider, authProviders });
  }));
}

function unlinkButton(label: string, method: string) {
  return within(rowOf(label)).getByRole('button', { name: `${method} 로그인 연결 해제` });
}

function dialog() {
  return screen.getByRole('dialog');
}

describe('LoginMethodsPageClient - 로그인 수단 해제', () => {
  it('카카오: 확인 창에서 영향을 알리고, 해제하면 안내와 함께 목록이 새로 바뀐다', async () => {
    // 해제 뒤 목록 갱신이 읽는 두 번째 응답은 카카오가 빠진 목록이다.
    serveMe(['email', 'kakao'], ['email']);
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));

    const modal = within(dialog());
    expect(modal.getByText('카카오 로그인을 해제할까요?')).toBeInTheDocument();
    expect(modal.getByText(
      '카카오 버튼으로는 더 이상 이 계정에 로그인할 수 없어요. 이메일 로그인은 그대로 쓸 수 있어요. 같은 카카오 계정은 다시 연결할 수 있어요.',
    )).toBeInTheDocument();
    expect(Array.from(dialog().querySelectorAll('.tm-info-row')).map((row) => row.textContent)).toEqual([
      '이 기기로그인 유지',
      '다른 기기모두 로그아웃',
    ]);
    // 확인하기 전에는 아무것도 보내지 않는다.
    expect(unlinkCalls).toEqual([]);

    await userEvent.click(modal.getByRole('button', { name: '카카오 해제' }));

    expect(await screen.findByText('카카오 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.')).toBeInTheDocument();
    expect(unlinkCalls).toEqual([{ provider: 'kakao' }]);
    expect(screen.getByText('카카오 로그인을 해제했어요')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 해제된 줄은 다시 "연결하기" 줄이 되고, 남은 이메일은 마지막 수단이라 해제 버튼이 사라진다.
    const kakao = rowOf('카카오 로그인');
    expect(within(kakao).queryByText('연결됨')).not.toBeInTheDocument();
    expect(within(kakao).getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled();
    expect(within(rowOf('이메일·비밀번호')).getByText(LAST_METHOD_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
  });

  it('해제하고 확인 창이 닫혀도 포커스가 문서 처음으로 떨어지지 않는다(눌렀던 버튼은 이미 사라졌다)', async () => {
    serveMe(['email', 'kakao'], ['email']);
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    const trigger = unlinkButton('카카오 로그인', '카카오');
    await userEvent.click(trigger);
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));
    await screen.findByText('카카오 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByText('카카오 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.').closest('[tabindex="-1"]'));
  });

  it('해제하지 못했을 때는 눌렀던 버튼이 그대로 있으니 포커스가 그 버튼으로 돌아간다', async () => {
    failUnlink(500, 'INTERNAL_ERROR', '서버 오류');
    await renderLoaded(['email', 'kakao']);

    const trigger = unlinkButton('카카오 로그인', '카카오');
    await userEvent.click(trigger);
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));
    await screen.findByText('카카오 로그인을 해제하지 못했어요');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(document.activeElement).toBe(trigger);
  });

  it('이메일: 계정 이메일이 연락처로 남는다고 알리고, 해제하면 이메일 연결하기 줄로 돌아간다', async () => {
    serveMe(['email', 'kakao'], ['kakao']);
    succeedUnlink('email', ['kakao']);
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    await userEvent.click(unlinkButton('이메일·비밀번호', '이메일'));

    const modal = within(dialog());
    expect(modal.getByText('이메일 로그인을 해제할까요?')).toBeInTheDocument();
    expect(modal.getByText(
      '이 이메일과 비밀번호로는 더 이상 로그인할 수 없어요. 카카오 로그인은 그대로 쓸 수 있어요.',
    )).toBeInTheDocument();
    expect(Array.from(dialog().querySelectorAll('.tm-info-row')).map((row) => row.textContent)).toEqual([
      '이 기기로그인 유지',
      '다른 기기모두 로그아웃',
      '계정 이메일연락처로 남아요',
    ]);

    await userEvent.click(modal.getByRole('button', { name: '이메일 해제' }));

    expect(await screen.findByText('이메일 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.')).toBeInTheDocument();
    expect(unlinkCalls).toEqual([{ provider: 'email' }]);
    expect(within(rowOf('이메일·비밀번호')).getByRole('link', { name: EMAIL_LINK })).toHaveAttribute(
      'href',
      '/my/settings/login-methods/email',
    );
    expect(within(rowOf('카카오 로그인')).getByText(LAST_METHOD_NOTE)).toBeInTheDocument();
  });

  it('확인 창은 로그인할 수 없는 네이버를 그대로 쓸 수 있는 수단으로 말하지 않는다', async () => {
    await renderLoaded(['kakao', 'email', 'naver']);

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));

    expect(within(dialog()).getByText(
      '카카오 버튼으로는 더 이상 이 계정에 로그인할 수 없어요. 이메일 로그인은 그대로 쓸 수 있어요. 같은 카카오 계정은 다시 연결할 수 있어요.',
    )).toBeInTheDocument();
    expect(within(dialog()).queryByText(/네이버/)).not.toBeInTheDocument();
  });

  it('Apple: 웹에서는 다시 연결할 수 없다는 것을 확인 창에서 알린다', async () => {
    await renderLoaded(['email', 'apple']);

    await userEvent.click(unlinkButton('Apple 로그인', 'Apple'));

    expect(within(dialog()).getByText(
      'Apple 버튼으로는 더 이상 이 계정에 로그인할 수 없어요. 이메일 로그인은 그대로 쓸 수 있어요. 다시 연결하려면 iOS 앱에서 해야 해요.',
    )).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Apple 해제' })).toBeEnabled();
  });

  it('취소하면 요청도 안내도 없이 목록 그대로 돌아온다', async () => {
    await renderLoaded(['email', 'kakao']);

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(unlinkCalls).toEqual([]);
    expect(screen.queryByText(/로그인을 해제했어요/)).not.toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument();
  });

  it('요청이 가는 동안 확인 창이 잠겨 같은 해제를 두 번 보내지 않는다', async () => {
    serveMe(['email', 'kakao'], ['email']);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.post('*/api/v1/auth/identities/unlink', async ({ request }) => {
      unlinkCalls.push(await request.clone().json());
      await gate;
      return HttpResponse.json({ status: 'success', data: { provider: 'kakao', authProviders: ['email'] }, timestamp: '2026-11-07T00:00:00.000Z' });
    }));
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));

    expect(within(dialog()).getByRole('button', { name: '카카오 해제' })).toBeDisabled();
    expect(within(dialog()).getByRole('button', { name: '취소' })).toBeDisabled();
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));
    expect(unlinkCalls).toHaveLength(1);

    release();
    expect(await screen.findByText('카카오 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.')).toBeInTheDocument();
    expect(unlinkCalls).toHaveLength(1);
  });

  it('해제를 시작하면 앞선 연결 결과 안내를 거두고, 새 연결을 시작하면 해제 안내를 거둔다', async () => {
    setQuery('linkResult=failed&provider=kakao');
    serveMe(['email', 'kakao'], ['email']);
    kakaoOAuth.startKakaoLinkAuthorize.mockReturnValue(new Promise(() => {}));
    render(<LoginMethodsPageClient />);
    expect(await screen.findByText('카카오 로그인을 연결하지 못했어요')).toBeInTheDocument();

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    expect(screen.queryByText('카카오 로그인을 연결하지 못했어요')).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));
    expect(await screen.findByText('카카오 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: KAKAO_BUTTON }));

    expect(screen.queryByText('카카오 로그인을 해제했어요. 다른 기기에서는 로그아웃됐어요.')).not.toBeInTheDocument();
  });
});

describe('LoginMethodsPageClient - 로그인 수단 해제가 거절될 때', () => {
  it('최근 로그인이 필요하면 안내 카드로 알리고, 다시 로그인하면 이 화면으로 돌아오게 한다', async () => {
    failUnlink(403, 'RECENT_LOGIN_REQUIRED', '보안을 위해 다시 로그인한 뒤 해제해 주세요.', { maxAgeSeconds: 1800 });
    await renderLoaded(['email', 'kakao']);

    await userEvent.click(unlinkButton('이메일·비밀번호', '이메일'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '이메일 해제' }));

    expect(await screen.findByText('보안을 위해 다시 로그인해 주세요')).toBeInTheDocument();
    expect(screen.getByText(
      '로그인한 지 오래돼서 바로 해제할 수 없어요. 다시 로그인하면 이 화면으로 돌아와 이어서 해제할 수 있어요.',
    )).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 뗀 것이 없으니 목록도 그대로다.
    expect(within(rowOf('이메일·비밀번호')).getByText('연결됨')).toBeInTheDocument();
    expect(screen.queryByText(/로그인을 해제했어요/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '다시 로그인하기' }));

    expect(signOut.signOutAndLeave).toHaveBeenCalledExactlyOnceWith(
      '/login?redirect=%2Fmy%2Fsettings%2Flogin-methods',
      { failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.' },
    );
  });

  it('마지막 남은 수단이었다면(화면의 목록이 오래됐을 때) 이유를 알리고 목록을 서버 기준으로 맞춘다', async () => {
    // 화면은 이메일·카카오를 보여 줬지만 그 사이 다른 기기에서 이메일을 이미 뗐다.
    serveMe(['email', 'kakao'], ['kakao']);
    failUnlink(409, 'LAST_LOGIN_METHOD', '마지막 남은 로그인 수단은 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.');
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));

    expect(await screen.findByText('다른 로그인 방법을 먼저 연결한 뒤에 해제해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('카카오 로그인')).getByText(LAST_METHOD_NOTE)).toBeInTheDocument());
    expect(within(rowOf('이메일·비밀번호')).queryByText('연결됨')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UNLINK_ANY })).not.toBeInTheDocument();
    // 눌렀던 버튼이 목록 갱신으로 사라졌으니 포커스는 결과 안내에 있다.
    expect(document.activeElement).toBe(screen.getByText('다른 로그인 방법을 먼저 연결한 뒤에 해제해 주세요.').closest('[tabindex="-1"]'));
  });

  it('이미 떼어진 수단이면 그렇게 알리고 목록을 서버 기준으로 맞춘다', async () => {
    serveMe(['email', 'kakao'], ['email']);
    failUnlink(404, 'LOGIN_METHOD_NOT_FOUND', '연결돼 있지 않은 로그인 수단이에요.');
    render(<LoginMethodsPageClient />);
    await screen.findByRole('list', { name: '로그인 방법 목록' });

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));

    expect(await screen.findByText('이미 해제된 카카오 로그인이에요')).toBeInTheDocument();
    expect(screen.getByText('다른 기기에서 먼저 해제했을 수 있어요. 목록을 새로 불러왔어요.')).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf('카카오 로그인')).getByRole('button', { name: KAKAO_BUTTON })).toBeEnabled());
  });

  it('운영자 계정이라 거절되면 고객센터로 이어 준다', async () => {
    failUnlink(403, 'SOCIAL_LINK_ADMIN_FORBIDDEN', '운영 권한이 있는 계정은 로그인 수단을 직접 해제할 수 없어요.');
    await renderLoaded(['email', 'kakao']);

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));

    expect(await screen.findByText('로그인 방법을 해제할 수 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '고객센터 문의' })).toHaveAttribute('href', '/my/inquiries/new');
    expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument();
  });

  it('그 밖의 실패는 해제하지 못했다고 알리고, 닫으면 안내가 사라진다', async () => {
    failUnlink(500, 'INTERNAL_ERROR', '서버 오류');
    await renderLoaded(['email', 'kakao']);

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));

    expect(await screen.findByText('카카오 로그인을 해제하지 못했어요')).toBeInTheDocument();
    expect(screen.queryByText(/로그인을 해제했어요/)).not.toBeInTheDocument();
    expect(within(rowOf('카카오 로그인')).getByText('연결됨')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByText('카카오 로그인을 해제하지 못했어요')).not.toBeInTheDocument();
  });

  it('가입이 덜 끝난 계정으로 거절되면 가입 이어가기 화면으로 보낸다', async () => {
    failUnlink(403, 'SIGNUP_INCOMPLETE', '가입을 먼저 마무리해 주세요.', { next: { route: '/signup/social' } });
    await renderLoaded(['email', 'kakao']);

    await userEvent.click(unlinkButton('카카오 로그인', '카카오'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '카카오 해제' }));

    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledWith('/signup/social'));
    expect(screen.queryByText(/해제하지 못했어요/)).not.toBeInTheDocument();
  });
});
