import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
