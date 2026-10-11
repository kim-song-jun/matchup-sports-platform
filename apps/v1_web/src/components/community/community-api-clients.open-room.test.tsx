import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { clients, message, server, state } from './community-api-clients.message-sync.fixture';
import { ChatRoomPageClient } from './community-api-clients';

vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => ({ on: vi.fn(), off: vi.fn() }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/chat/room-1',
  useSearchParams: () => new URLSearchParams(),
}));

const requests: string[] = [];
const record = ({ request }: { request: Request }) => {
  const { pathname } = new URL(request.url);
  requests.push(`${request.method} ${pathname.replace('/api/v1', '')}`);
};
const count = (entry: string) => requests.filter((item) => item === entry).length;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', record);
});
afterAll(() => {
  server.events.removeListener('request:start', record);
  server.close();
});
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  state.messages = [message('msg-old', '이전 메시지')];
  state.listRequests = 0;
  requests.length = 0;
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  server.resetHandlers();
  vi.unstubAllEnvs();
});

describe('채팅방 열기 — 요청 중복', () => {
  it('방을 한 번 열면 상세·메시지는 한 번, 읽음 처리 뒤 목록만 한 번 더 받는다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><ChatRoomPageClient roomId="room-1" /></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByText('이전 메시지').length).toBeGreaterThan(0));
    // 읽음 처리(PATCH) 응답 뒤의 갱신까지 끝나길 기다린다.
    await waitFor(() => expect(count('PATCH /chat/rooms/room-1/me')).toBe(1));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(count('GET /chat/rooms/room-1')).toBe(1);
    expect(count('GET /chat/rooms/room-1/messages')).toBe(1);
    expect(count('GET /chat/rooms')).toBe(2);
  });
});
