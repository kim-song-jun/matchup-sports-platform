import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { EMAIL_CHANGE_MSW } from '@/test/msw/profile-email-change-handlers';
import { v1ProfileFixture } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import type { V1Profile } from '@/types/api';
import { EmailChangeClient } from './email-change-client';

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
  usePathname: () => '/my/profile/edit/email',
  useRouter: () => nav.router,
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/auth/use-sign-out-and-leave', () => ({ useSignOutAndLeave: () => signOut }));

// 한 테스트가 화면 두세 개를 지나며 MSW 왕복을 여러 번 한다 — 바쁜 러너의 jsdom 에서는 기본 5초를 넘길 수 있다.
vi.setConfig({ testTimeout: 30_000 });

const PROFILE_EDIT = '/my/profile/edit';
const EMAIL_STEP = '새 이메일을 입력해 주세요';
const CODE_STEP = '인증번호를 입력해 주세요';
const NEW_EMAIL = EMAIL_CHANGE_MSW.emails.ok;

/** 서버에 저장된 프로필 — 이메일만 바꿔도 나머지가 이 값 그대로 다시 저장돼야 한다. */
const STORED_PROFILE: V1Profile = {
  ...v1ProfileFixture,
  email: EMAIL_CHANGE_MSW.currentEmail,
  phone: '01011112222',
  hasPassword: true,
  profile: {
    displayName: '민준FC',
    realName: '김민준',
    nickname: '민준FC',
    bio: '골 넣는 풀백이에요',
    profileImageUrl: 'https://cdn.example.com/p.png',
    birthDate: '1995-01-15',
    gender: 'male',
  },
};

type Calls = { request: unknown[]; verify: unknown[]; patch: Array<Record<string, unknown>> };
let calls: Calls;
let profileReads: number;
let profile: V1Profile;
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
  signOut.pending = false;
  signOut.error = null;
  calls = { request: [], verify: [], patch: [] };
  profileReads = 0;
  profile = STORED_PROFILE;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(
    http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
    http.get('*/api/v1/me/profile', () => {
      profileReads += 1;
      return HttpResponse.json({ status: 'success', data: profile, timestamp: '2026-11-06T00:00:00.000Z' });
    }),
    // 공유 핸들러가 응답을 정하고, 이 화면이 실제로 어떤 본문을 보냈는지만 옆에서 기록한다.
    http.post('*/api/v1/me/email-change/request', async ({ request }) => {
      calls.request.push(await request.clone().json());
      return undefined;
    }),
    http.post('*/api/v1/me/email-change/verify', async ({ request }) => {
      calls.verify.push(await request.clone().json());
      return undefined;
    }),
    http.patch('*/api/v1/me/profile', async ({ request }) => {
      const body = (await request.clone().json()) as Record<string, unknown>;
      calls.patch.push(body);
      // 서버가 저장했다면 이후 프로필 조회는 새 이메일을 돌려준다(공유 핸들러는 상태가 없다).
      if (body.emailChangeToken === EMAIL_CHANGE_MSW.tokens.ok && body.email === NEW_EMAIL) profile = { ...profile, email: NEW_EMAIL };
      return undefined;
    }),
  );
});
afterEach(() => server.resetHandlers());

function failure(statusCode: number, code: string, message: string) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message, details: null, timestamp: '2026-11-06T00:00:00.000Z' },
    { status: statusCode },
  );
}

function renderClient() {
  return render(<QueryClientProvider client={client}><EmailChangeClient /></QueryClientProvider>);
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const emailField = () => screen.getByLabelText('이메일');
const sendButton = () => screen.getByRole('button', { name: '인증번호 받기' });
const changeButton = () => screen.getByRole('button', { name: '인증하고 바꾸기' });

async function typeEmail(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.clear(emailField());
  await user.click(emailField());
  await user.paste(email);
}

/** 1단계를 통과해 2단계(인증번호)에 선다. 서버가 시험용 주소에 인증번호를 되돌려 줘 입력칸이 채워진다. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>, email: string = NEW_EMAIL) {
  await heading(EMAIL_STEP);
  await typeEmail(user, email);
  await user.click(sendButton());
  await heading(CODE_STEP);
}

async function replaceCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  const field = screen.getByLabelText('인증번호 6자리');
  await user.clear(field);
  await user.click(field);
  await user.paste(code);
}

describe('EmailChangeClient — 변경 흐름', () => {
  it('새 이메일 → 인증번호 → 바로 저장 → 완료까지 가고, 저장에는 저장된 프로필과 증명 토큰을 함께 보낸다', async () => {
    const user = userEvent.setup();
    renderClient();
    await reachCodeStep(user, `  ${NEW_EMAIL.toUpperCase()} `);

    expect(screen.getByRole('progressbar', { name: '이메일 변경 진행 단계 2 / 2' })).toBeInTheDocument();
    expect(screen.getByText(`${NEW_EMAIL} 으로 6자리 숫자를 보냈어요.`)).toBeInTheDocument();
    await user.click(changeButton());

    expect(await heading('이메일을 바꿨어요')).toHaveFocus();
    expect(screen.getByText(`앞으로 ${NEW_EMAIL} 으로 로그인해요. 인증도 끝났어요.`)).toBeInTheDocument();
    expect(screen.getByText('계정 이메일')).toBeInTheDocument();
    expect(screen.getByText(NEW_EMAIL)).toBeInTheDocument();
    expect(screen.getByText('인증 상태')).toBeInTheDocument();
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필로 돌아가기' })).toHaveAttribute('href', PROFILE_EDIT);
    expect(calls.request).toEqual([{ email: NEW_EMAIL }]);
    expect(calls.verify).toEqual([{ code: EMAIL_CHANGE_MSW.codes.ok }]);
    // 프로필 저장은 보내지 않은 칸을 비운다 — 이메일만 바꿔도 나머지가 서버에 저장된 값 그대로 가야 한다.
    expect(calls.patch).toEqual([{
      realName: '김민준',
      nickname: '민준FC',
      bio: '골 넣는 풀백이에요',
      profileImageUrl: 'https://cdn.example.com/p.png',
      phone: '01011112222',
      birthDate: '19950115',
      gender: 'male',
      email: NEW_EMAIL,
      emailChangeToken: EMAIL_CHANGE_MSW.tokens.ok,
    }]);
    // 프로필 화면으로 돌아갔을 때 옛 이메일이 보이지 않는다 — 저장 응답이 캐시를 맞춘다(재조회 없이).
    expect(client.getQueryData<V1Profile>(v1Keys.profile())?.email).toBe(NEW_EMAIL);
    expect(profileReads).toBe(1);
  });

  it('비밀번호 계정에만 로그인 ID 안내를 보이고, 완료 문구도 그에 맞춘다', async () => {
    const user = userEvent.setup();
    profile = { ...STORED_PROFILE, hasPassword: false };
    renderClient();
    await heading(EMAIL_STEP);
    expect(screen.queryByText('이 이메일은 로그인에도 쓰여요. 바꾸면 다음부터 새 이메일로 로그인해요.')).not.toBeInTheDocument();
    await reachCodeStep(user);
    await user.click(changeButton());

    expect(await heading('이메일을 바꿨어요')).toBeInTheDocument();
    expect(screen.getByText(`계정 이메일이 ${NEW_EMAIL} 으로 바뀌었어요. 인증도 끝났어요.`)).toBeInTheDocument();
  });

  it('비밀번호 계정에는 이메일이 로그인에도 쓰인다고 먼저 알린다', async () => {
    renderClient();
    await heading(EMAIL_STEP);

    expect(screen.getByText('이 이메일은 로그인에도 쓰여요. 바꾸면 다음부터 새 이메일로 로그인해요.')).toBeInTheDocument();
    expect(screen.getByText('인증번호를 보내 드려요. 인증하면 바로 바뀌어요.')).toBeInTheDocument();
  });

  it('첫 단계의 뒤로 가기는 돌아갈 프로필 수정 화면(그 화면의 쿼리 포함)으로 간다', async () => {
    nav.params = new URLSearchParams({ redirect: '/my/profile/edit?from=%2Fmy%2Fsettings' });
    renderClient();
    await heading(EMAIL_STEP);

    for (const link of screen.getAllByRole('link', { name: '뒤로가기' })) {
      expect(link).toHaveAttribute('href', '/my/profile/edit?from=%2Fmy%2Fsettings');
    }
  });

  it('프로필 수정이 아닌 곳으로 가라는 redirect 는 따르지 않는다', async () => {
    nav.params = new URLSearchParams({ redirect: 'https://evil.example.com' });
    renderClient();
    await heading(EMAIL_STEP);

    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', PROFILE_EDIT);
  });
});

describe('EmailChangeClient — 시작·이메일 단계의 오류', () => {
  it('로그인한 지 오래됐으면(RECENT_LOGIN_REQUIRED) 이메일 변경용 안내를 보이고, 다시 로그인하면 이 화면으로 돌아오게 한다', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams({ redirect: '/my/profile/edit?from=%2Fmy' });
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_CHANGE_MSW.emails.recentLoginRequired);
    await user.click(sendButton());

    expect(await heading('보안을 위해 다시 로그인해 주세요')).toHaveFocus();
    expect(screen.getByText('로그인한 지 오래돼서 바로 이메일을 바꿀 수 없어요. 다시 로그인하면 이 화면으로 돌아와 이어서 바꿀 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 로그인하기' }));
    expect(signOut.signOutAndLeave).toHaveBeenCalledExactlyOnceWith(
      `/login?redirect=${encodeURIComponent('/my/profile/edit/email?redirect=%2Fmy%2Fprofile%2Fedit%3Ffrom%3D%252Fmy')}`,
      { failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.' },
    );
    expect(calls.patch).toEqual([]);
  });

  it('로그아웃에 실패하면 안내 아래에 이유를 보인다', async () => {
    const user = userEvent.setup();
    signOut.error = '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.';
    renderClient();
    await heading(EMAIL_STEP);
    await typeEmail(user, EMAIL_CHANGE_MSW.emails.recentLoginRequired);
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });

  it('다른 계정이 쓰는 이메일은 입력칸 아래에서 알리고, 다른 주소를 넣을 때까지 버튼을 잠근다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_CHANGE_MSW.emails.taken);
    await user.click(sendButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이미 다른 계정에서 쓰는 이메일이에요.');
    await waitFor(() => expect(emailField()).toHaveFocus());
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/my/inquiries/new');
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText('사용할 수 있는 이메일을 입력해 주세요.')).toBeInTheDocument();

    await typeEmail(user, NEW_EMAIL);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('지금 쓰는 이메일과 같은 주소는 요청 없이 막고, 대소문자·공백만 달라도 같은 주소로 본다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, `  ${EMAIL_CHANGE_MSW.currentEmail.toUpperCase()}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('지금 쓰는 이메일과 같아요. 바꿀 새 이메일을 입력해 주세요.');
    expect(sendButton()).toBeDisabled();
    expect(calls.request).toEqual([]);
  });

  it('서버가 지금 쓰는 주소와 같다고 거절해도(저장된 주소가 다른 표기) 같은 안내로 막는다', async () => {
    const user = userEvent.setup();
    profile = { ...STORED_PROFILE, email: 'other-form@example.com' };
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_CHANGE_MSW.currentEmail);
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('지금 쓰는 이메일과 같아요.');
    expect(sendButton()).toBeDisabled();
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
  });

  it('인증 메일을 보낼 수 없으면 입력칸 아래에서 알린다', async () => {
    const user = userEvent.setup();
    renderClient();
    await heading(EMAIL_STEP);

    await typeEmail(user, EMAIL_CHANGE_MSW.emails.mailUnavailable);
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.');
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
  });
});

describe('EmailChangeClient — 인증번호 단계의 오류', () => {
  it('인증번호가 틀리면 저장하지 않고 그 자리에서 알리며, 맞게 고치면 바로 바뀐다', async () => {
    const user = userEvent.setup();
    renderClient();
    await reachCodeStep(user);

    await replaceCode(user, EMAIL_CHANGE_MSW.codes.wrong);
    await user.click(changeButton());

    expect(await screen.findByText('인증번호가 올바르지 않아요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: CODE_STEP })).toBeInTheDocument();
    expect(calls.patch).toEqual([]);

    await replaceCode(user, EMAIL_CHANGE_MSW.codes.ok);
    await user.click(changeButton());
    expect(await heading('이메일을 바꿨어요')).toBeInTheDocument();
    expect(calls.patch).toHaveLength(1);
  });

  it('인증번호가 만료됐거나 시도 횟수를 넘겼으면 서버 안내를 보이고 저장하지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await reachCodeStep(user);

    await replaceCode(user, EMAIL_CHANGE_MSW.codes.expired);
    await user.click(changeButton());
    expect(await screen.findByText('유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.')).toBeInTheDocument();

    await replaceCode(user, EMAIL_CHANGE_MSW.codes.exhausted);
    await user.click(changeButton());
    expect(await screen.findByText('시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.')).toBeInTheDocument();
    expect(calls.patch).toEqual([]);
  });

  it('인증번호를 6자리 채우기 전에는 버튼이 잠기고 이유를 알려 준다', async () => {
    const user = userEvent.setup();
    renderClient();
    await reachCodeStep(user);

    await replaceCode(user, '12345');

    expect(changeButton()).toBeDisabled();
    expect(screen.getByText('인증번호 6자리를 입력해 주세요.')).toBeInTheDocument();
  });

  it('뒤로 가면 이메일 단계로 돌아오고, 받아 둔 인증번호가 살아 있으면 다시 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderClient();
    await reachCodeStep(user);

    await user.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
    await heading(EMAIL_STEP);
    expect(emailField()).toHaveValue(NEW_EMAIL);
    await user.click(sendButton());
    await heading(CODE_STEP);

    expect(calls.request).toHaveLength(1);
  });
});

describe('EmailChangeClient — 인증 뒤 저장의 오류', () => {
  it('저장 순간 다른 계정이 그 주소를 가져갔으면 이메일 단계로 돌려보내 알린다', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/me/profile', () => failure(409, 'EMAIL_CONFLICT', '이미 다른 계정에서 쓰는 이메일이에요.')));
    renderClient();
    await reachCodeStep(user);
    await user.click(changeButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 다른 계정에서 쓰는 이메일이에요.');
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it('증명이 거절되면(EMAIL_CHANGE_PROOF_REQUIRED) 처음부터 다시 해야 한다고 알리고, 받은 인증번호는 이어 쓰지 않는다', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/me/profile', () => failure(400, 'EMAIL_CHANGE_PROOF_REQUIRED', '새 이메일로 받은 인증번호를 먼저 확인해 주세요.')));
    renderClient();
    await reachCodeStep(user);
    await user.click(changeButton());

    expect(await screen.findByText('이메일 인증이 만료돼서 처음부터 다시 해야 해요. 인증번호를 다시 받아 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: EMAIL_STEP })).toBeInTheDocument();
    await user.click(sendButton());
    await heading(CODE_STEP);
    expect(calls.request).toHaveLength(2);
    expect(screen.getByRole('button', { name: '인증하고 바꾸기' })).toBeInTheDocument();
  });

  it('인증은 끝났는데 저장만 실패하면 인증 완료를 보이고, 인증번호를 다시 받지 않고 저장만 다시 시도한다', async () => {
    const user = userEvent.setup();
    const failedPatches: unknown[] = [];
    server.use(http.patch('*/api/v1/me/profile', async ({ request }) => {
      if (failedPatches.length > 0) return undefined;
      failedPatches.push(await request.clone().json());
      return failure(500, 'INTERNAL_ERROR', '서버에 문제가 생겼어요.');
    }));
    renderClient();
    await reachCodeStep(user);
    await user.click(changeButton());

    expect(await screen.findByText('이메일 인증이 완료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 문제가 생겼어요.');
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '이메일 바꾸기' }));

    expect(await heading('이메일을 바꿨어요')).toBeInTheDocument();
    expect(calls.verify).toHaveLength(1);
    // 같은 증명으로 같은 저장을 다시 보냈다.
    expect(failedPatches).toHaveLength(1);
    expect(calls.patch).toEqual(failedPatches);
    expect(calls.patch[0]).toMatchObject({ email: NEW_EMAIL, emailChangeToken: EMAIL_CHANGE_MSW.tokens.ok });
  });
});

describe('EmailChangeClient — 프로필 상태', () => {
  it('프로필을 불러오지 못하면 다시 시도할 수 있게 하고, 입력칸은 보이지 않는다', async () => {
    const user = userEvent.setup();
    let failing = true;
    server.use(http.get('*/api/v1/me/profile', () => (failing
      ? failure(500, 'INTERNAL_ERROR', '서버에 문제가 생겼어요.')
      : HttpResponse.json({ status: 'success', data: STORED_PROFILE, timestamp: '2026-11-06T00:00:00.000Z' }))));
    renderClient();

    expect(await screen.findByText('프로필 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await heading(EMAIL_STEP)).toBeInTheDocument();
  });

  it('이미 받은 프로필이 있으면 뒤늦은 재조회가 실패해도 진행 중인 단계와 완료 화면을 그대로 둔다', async () => {
    const user = userEvent.setup();
    const failRefetch = async () => {
      server.use(http.get('*/api/v1/me/profile', () => failure(500, 'INTERNAL_ERROR', '서버에 문제가 생겼어요.')));
      await act(async () => { await client.refetchQueries({ queryKey: v1Keys.profile() }); });
      expect(client.getQueryState(v1Keys.profile())?.status).toBe('error');
    };
    renderClient();
    await reachCodeStep(user);

    await failRefetch();
    expect(screen.getByRole('heading', { level: 1, name: CODE_STEP })).toBeInTheDocument();
    expect(screen.queryByText('프로필 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument();

    await user.click(changeButton());
    expect(await heading('이메일을 바꿨어요')).toBeInTheDocument();
    await failRefetch();
    expect(screen.getByRole('heading', { level: 1, name: '이메일을 바꿨어요' })).toBeInTheDocument();
    expect(screen.queryByText('프로필 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument();
  });

  const withProfile = (fields: Partial<V1Profile['profile']>): V1Profile => ({ ...STORED_PROFILE, profile: { ...STORED_PROFILE.profile, ...fields } });
  it.each<[string, V1Profile]>([
    ['존재하지 않는 날짜인 생년월일', withProfile({ birthDate: '1995-02-30' })],
    ['11자리가 아닌 휴대폰 번호', { ...STORED_PROFILE, phone: '0101112222' }],
    ['1자인 닉네임', withProfile({ nickname: '민' })],
    ['41자인 닉네임', withProfile({ nickname: '가'.repeat(41) })],
    ['301자인 소개', withProfile({ bio: '가'.repeat(301) })],
  ])('저장된 %s 은(는) 서버가 저장을 거절하므로 인증번호를 받기 전에 프로필 수정으로 안내한다', async (_name, stored) => {
    profile = stored;
    renderClient();

    expect(await heading('프로필을 먼저 저장해 주세요')).toBeInTheDocument();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필로 돌아가기' })).toHaveAttribute('href', PROFILE_EDIT);
    expect(calls.request).toEqual([]);
  });

  it.each<[string, string | null]>([['이름이 비어 있는', null], ['이름이 공백뿐인', '   '], ['이름이 비어 있는', ''], ['이름이 보이지 않는 문자뿐인', '​﻿']])(
    '%s 옛 계정은 서버가 저장을 거절하므로 인증번호를 받기 전에 프로필 저장부터 안내한다',
    async (_name, realName) => {
      profile = withProfile({ realName });
      renderClient();

      expect(await heading('프로필을 먼저 저장해 주세요')).toBeInTheDocument();
      expect(screen.getByText(/이름·닉네임·성별이 저장돼 있고/)).toBeInTheDocument();
      expect(screen.getByText(/비어 있는 정보: 이름/)).toBeInTheDocument();
      expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '프로필로 돌아가기' })).toHaveAttribute('href', PROFILE_EDIT);
      expect(calls.request).toEqual([]);
    },
  );

  it('성별이 저장돼 있지 않은 옛 계정은 서버가 저장을 거절하므로 인증번호를 받기 전에 프로필 저장부터 안내한다', async () => {
    profile = { ...STORED_PROFILE, profile: { ...STORED_PROFILE.profile, gender: null } };
    renderClient();

    expect(await heading('프로필을 먼저 저장해 주세요')).toBeInTheDocument();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필로 돌아가기' })).toHaveAttribute('href', PROFILE_EDIT);
    expect(calls.request).toEqual([]);
  });
});
