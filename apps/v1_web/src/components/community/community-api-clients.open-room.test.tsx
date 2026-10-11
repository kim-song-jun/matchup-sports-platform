import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { http, HttpResponse } from 'msw';
import { clients, message, server, state } from './community-api-clients.message-sync.fixture';
import { ChatRoomPageClient } from './community-api-clients';

const socketListeners = new Map<string, () => void>();
vi.mock('@/lib/v1-socket', () => ({
  getV1Socket: () => ({
    on: (event: string, cb: () => void) => { socketListeners.set(event, cb); },
    off: (event: string) => { socketListeners.delete(event); },
  }),
}));
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
  socketListeners.clear();
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

  it('하드 로드로 REST 읽기 뒤에 소켓이 붙으면 메시지·목록을 한 번만 더 받는다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><ChatRoomPageClient roomId="room-1" /></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByText('이전 메시지').length).toBeGreaterThan(0));
    socketListeners.get('connect')?.();
    await waitFor(() => expect(count('PATCH /chat/rooms/room-1/me')).toBe(1));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(count('GET /chat/rooms/room-1/messages')).toBe(2);
    expect(count('GET /chat/rooms')).toBe(3);
  });

  it('없는 방(404)은 소켓이 붙어도 메시지를 한 번만 요청한다', async () => {
    server.use(
      http.get('*/api/v1/chat/rooms/room-404', () => HttpResponse.json(
        { status: 'error', statusCode: 404, code: 'CHAT_ROOM_NOT_FOUND', message: 'not found' }, { status: 404 })),
      http.get('*/api/v1/chat/rooms/room-404/messages', () => HttpResponse.json(
        { status: 'error', statusCode: 404, code: 'CHAT_ROOM_NOT_FOUND', message: 'not found' }, { status: 404 })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><ChatRoomPageClient roomId="room-404" /></QueryClientProvider>);
    await waitFor(() => expect(count('GET /chat/rooms/room-404/messages')).toBe(1));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    socketListeners.get('connect')?.();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(count('GET /chat/rooms/room-404/messages')).toBe(1);
  });
});
