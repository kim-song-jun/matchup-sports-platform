import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import ChatLayout from '@/app/chat/layout';

vi.mock('@/components/auth/require-auth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => children }));
const ok = (data: unknown) => new Response(JSON.stringify({ status: 'success', data, timestamp: new Date().toISOString() }));
afterEach(() => vi.unstubAllGlobals());

function ChatContent() {
  useEffect(() => { void fetch('/api/v1/chat/rooms'); }, []);
  return <p>실제 채팅 화면</p>;
}

it('the real chat layout waits for status and never mounts chat requests for an active member view', async () => {
  let resolveStatus!: (response: Response) => void;
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    return new Promise<Response>((resolve) => { resolveStatus = resolve; });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const mounted = render(<QueryClientProvider client={client}><ChatLayout><ChatContent /></ChatLayout></QueryClientProvider>);
  try {
    expect(screen.queryByText('실제 채팅 화면')).not.toBeInTheDocument();
    await waitFor(() => expect(requests).toHaveLength(1));
    resolveStatus(ok({ active: true, unavailable: true, message: '만료됨' }));
    expect(await screen.findByText('회원 조회 중에는 채팅을 볼 수 없어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로 이동' })).toHaveAttribute('href', '/home');
    expect(requests.some((url) => url.includes('/chat/'))).toBe(false);
  } finally { mounted.unmount(); client.clear(); }
});

it('does not mount chat on status failure, and allows normal chat after a successful retry', async () => {
  let fail = true;
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    if (url.includes('/member-access') && fail) return new Response(JSON.stringify({
      status: 'error', statusCode: 503, code: 'UNAVAILABLE', message: '상태 확인 실패',
    }), { status: 503 });
    return ok({ active: false });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const mounted = render(<QueryClientProvider client={client}><ChatLayout><ChatContent /></ChatLayout></QueryClientProvider>);
  try {
    expect(await screen.findByText('회원 조회 상태를 확인하지 못했어요.')).toBeInTheDocument();
    expect(requests.some((url) => url.includes('/chat/'))).toBe(false);
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByText('실제 채팅 화면')).toBeInTheDocument();
    await waitFor(() => expect(requests).toContain('/api/v1/chat/rooms'));
  } finally { mounted.unmount(); client.clear(); }
});
