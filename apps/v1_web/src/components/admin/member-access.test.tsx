import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemberAccessBanner, MemberAccessStartButton } from './member-access';

const ok = (data: unknown) => new Response(JSON.stringify({ status: 'success', data, timestamp: new Date().toISOString() }), { status: 200 });
function mount(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return () => { result.unmount(); client.clear(); };
}
afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });

describe('member access entry and return', () => {
  it('sends the reason to the selected member endpoint and shows the actual server rejection', async () => {
    const requests: Array<[string, RequestInit]> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push([url, init]);
      return new Response(JSON.stringify({ status: 'error', statusCode: 403, code: 'RECENT_LOGIN_REQUIRED',
        message: '관리자 계정으로 다시 로그인해 주세요.', timestamp: new Date().toISOString() }), { status: 403 });
    }));
    const cleanup = mount(<MemberAccessStartButton userId="selected-member" enabled />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '회원 화면 조회' }));
    await user.type(screen.getByLabelText('접속 사유'), '가입 문제 확인');
    await user.click(screen.getByRole('button', { name: '조회 시작' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 계정으로 다시 로그인해 주세요.');
    expect(requests[0][0]).toContain('/admin/users/selected-member/member-access');
    expect(JSON.parse(String(requests[0][1].body))).toEqual({ reason: '가입 문제 확인' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    cleanup();
  });

  it('keeps an expired session visible with a working retry path when return fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/stop')
      ? new Response(JSON.stringify({ status: 'error', statusCode: 503, code: 'UNAVAILABLE', message: '종료 기록을 저장하지 못했어요.', timestamp: new Date().toISOString() }), { status: 503 })
      : ok({ active: true, unavailable: true, message: '회원 조회 시간이 만료됐어요.' })));
    const cleanup = mount(<MemberAccessBanner />);
    expect(await screen.findByText('회원 조회 시간이 만료됐어요.')).toBeInTheDocument();
    expect(screen.getByText(/조회 전용/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '관리자 복귀' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('종료 기록을 저장하지 못했어요.');
    expect(screen.getByRole('button', { name: '관리자 복귀' })).toBeEnabled();
    cleanup();
  });

  it('does not offer member access without write capability', () => {
    const cleanup = mount(<MemberAccessStartButton userId="selected-member" enabled={false} />);
    expect(screen.getByRole('button', { name: '회원 화면 조회' })).toBeDisabled();
    cleanup();
  });
});


function captureNavigation() {
  const realWindow = window;
  const assign = vi.fn();
  const reload = vi.fn();
  vi.stubGlobal('window', new Proxy(realWindow, { get(target, key) {
    if (key === 'location') return { assign, reload, pathname: '/home', href: 'http://localhost/home', origin: 'http://localhost' };
    return Reflect.get(target, key, target);
  } }));
  return { assign, reload };
}

it('returns to the server member detail exactly once after a successful stop', async () => {
  const { assign } = captureNavigation();
  window.localStorage.setItem('teameet.member-access', 'active');
  let active = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/stop')) { active = false; return ok({ returnPath: '/admin/users/target-member' }); }
    return ok(active ? { active: true, label: '대상 회원', userId: 'target-member', expiresAt: '2026-11-19T15:00:00Z' } : { active: false });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  client.setQueryData(['v1', 'me', 'private-review-fixture'], { userId: 'target-member' });
  const mounted = render(<QueryClientProvider client={client}><MemberAccessBanner /></QueryClientProvider>);
  try {
    await screen.findByText('대상 회원 회원 화면 조회 중 · 조회 전용');
    fireEvent.click(screen.getByRole('button', { name: '관리자 복귀' }));
    await waitFor(() => expect(client.getQueryData(['v1', 'admin', 'member-access'])).toEqual({ active: false }));
    expect(assign.mock.calls).toEqual([['/admin/users/target-member']]);
    expect(client.getQueryData(['v1', 'me', 'private-review-fixture'])).toBeUndefined();
    expect(window.localStorage.getItem('teameet.member-access')).toBeNull();
  } finally { mounted.unmount(); client.clear(); }
});

it('still clears member data and returns once when another tab ends access without a storage event', async () => {
  const { assign } = captureNavigation();
  window.localStorage.setItem('teameet.member-access', 'active');
  let active = true;
  vi.stubGlobal('fetch', vi.fn(async () => ok(active ? { active: true, label: '대상 회원', userId: 'target-member' } : { active: false })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(['v1', 'me', 'private-review-fixture'], { userId: 'target-member' });
  const mounted = render(<QueryClientProvider client={client}><MemberAccessBanner /></QueryClientProvider>);
  try {
    await screen.findByText('대상 회원 회원 화면 조회 중 · 조회 전용');
    active = false;
    await act(async () => { await client.invalidateQueries({ queryKey: ['v1', 'admin', 'member-access'] }); });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/users'));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['v1', 'me', 'private-review-fixture'])).toBeUndefined();
  } finally { mounted.unmount(); client.clear(); }
});

it('starts a member view, clears the previous identity, and navigates only to home', async () => {
  const { assign } = captureNavigation();
  let active = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (init?.method === 'POST') {
      expect(url).toContain('/admin/users/target-member/member-access');
      expect(JSON.parse(String(init.body))).toEqual({ reason: '화면 오류 확인' });
      active = true; return ok({ userId: 'target-member', label: '대상 회원', expiresAt: '2026-11-19T15:00:00Z' });
    }
    return ok(active ? { active: true, label: '대상 회원', userId: 'target-member' } : { active: false });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  client.setQueryData(['v1', 'me', 'private-review-fixture'], { userId: 'operator' });
  const mounted = render(<QueryClientProvider client={client}><MemberAccessBanner /><MemberAccessStartButton userId="target-member" enabled /></QueryClientProvider>);
  try {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '회원 화면 조회' }));
    await user.type(screen.getByLabelText('접속 사유'), '화면 오류 확인');
    await user.click(screen.getByRole('button', { name: '조회 시작' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['v1', 'me', 'private-review-fixture'])).toBeUndefined();
    expect(window.localStorage.getItem('teameet.member-access')).toBe('active');
  } finally { mounted.unmount(); client.clear(); }
});
