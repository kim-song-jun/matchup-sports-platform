import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { clients, deferred, message, pageInfo, releaseMessageSyncRequests, renderSendConsumer, renderSender, sendResult, server, state, timestamp } from './community-api-clients.message-sync.fixture';
import { ChatListPageClient, ChatRoomPageClient } from './community-api-clients';

const socket = vi.hoisted(() => ({ listeners: new Map<string, Set<(payload: unknown) => void>>() }));
vi.mock('@/lib/v1-socket', () => ({
  getV1Socket: () => ({
    on: (event: string, listener: (payload: unknown) => void) => {
      const listeners = socket.listeners.get(event) ?? new Set();
      listeners.add(listener);
      socket.listeners.set(event, listeners);
    },
    off: (event: string, listener: (payload: unknown) => void) => socket.listeners.get(event)?.delete(listener),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/chat/room-1',
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  state.messages = [message('msg-old', '이전 메시지')];
  state.listRequests = 0;
  state.reads.detail = 0;
  state.reads.messages = 0;
  state.refreshGate = undefined;
});
afterEach(() => {
  releaseMessageSyncRequests();
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  socket.listeners.clear();
  server.resetHandlers();
  vi.unstubAllEnvs();
});
function renderPage(page: 'list' | 'room') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>
    {page === 'list' ? <ChatListPageClient /> : <ChatRoomPageClient roomId="room-1" />}
  </QueryClientProvider>);
}
function emitSenderMessage(messageId = 'msg-new') {
  act(() => {
    for (const listener of socket.listeners.get('chat:message') ?? []) {
      listener({ roomId: 'room-1', messageId, senderUserId: 'user-a' });
    }
  });
}

describe('채팅 메시지 동기화 — 실제 화면·조회 훅·HTTP', () => {
  it('첫 HTTP 메시지 조회가 진행 중일 때 도착한 고유 이벤트도 최신 데이터를 표시한다', async () => {
    // Given the initial cold history request holds a snapshot from before the new message.
    const initialGate = deferred();
    server.use(http.get('*/api/v1/chat/rooms/room-1/messages', async () => {
      state.reads.messages += 1;
      const items = [...state.messages].reverse();
      await initialGate.promise;
      return HttpResponse.json({ status: 'success', data: { items, pageInfo }, timestamp });
    }));
    const client = renderSendConsumer();
    await waitFor(() => expect(state.reads.messages).toBe(1));
    // When a committed message arrives before the first HTTP response is released.
    state.messages.push(message('msg-new', '초기 조회 중 도착한 메시지'));
    emitSenderMessage();
    await act(async () => { initialGate.resolve(); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then the real message consumer renders the latest data, not the joined pre-event snapshot.
    await waitFor(() => expect(screen.getByLabelText('history')).toHaveTextContent('초기 조회 중 도착한 메시지'));
    expect(state.reads.messages).toBe(2);
  });

  it('같은 메시지의 HTTP 조회 실패를 숨기지 않고 재수신 시 실패한 조회만 재시도한다', async () => {
    // Given an already hydrated consumer and a single failed message refresh.
    const client = await renderSender();
    let failRead = true;
    server.use(http.get('*/api/v1/chat/rooms/room-1/messages', () => {
      state.reads.messages += 1;
      if (failRead) {
        failRead = false;
        return HttpResponse.json({ status: 'error', statusCode: 503,
          code: 'CHAT_READ_FAILED', message: '메시지 조회 실패', details: null, timestamp }, { status: 503 });
      }
      return HttpResponse.json({ status: 'success', data: { items: [...state.messages].reverse(), pageInfo }, timestamp });
    }));
    state.messages.push(message('msg-new', '재조회한 메시지'));
    emitSenderMessage();
    await waitFor(() => expect(screen.getByLabelText('history-error')).toHaveTextContent('메시지 조회 실패'));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // When the same persisted identity arrives again after the failed HTTP read.
    emitSenderMessage();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then only the failed query retries, and the actual new message replaces its old data.
    await waitFor(() => expect(screen.getByLabelText('history')).toHaveTextContent('재조회한 메시지'));
    expect(screen.getByLabelText('history-error')).toBeEmptyDOMElement();
    expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 4, detail: 2, messages: 3 });
  });

  it.each(['in-flight', 'completed'] as const)('POST 완료 전 socket 조회가 %s 상태여도 같은 메시지는 한 번만 갱신한다', async (refreshState) => {
    // Given actual room, base/filtered list and send hooks, with a delayed POST response.
    const postGate = deferred();
    server.use(http.post('*/api/v1/chat/rooms/room-1/messages', async () => {
      state.messages.push(message('msg-new', '보낸 메시지'));
      emitSenderMessage();
      await postGate.promise;
      return sendResult();
    }));
    const client = await renderSender();
    if (refreshState === 'in-flight') state.refreshGate = deferred();
    // When the persisted event starts/completes its GETs before the POST succeeds.
    fireEvent.click(screen.getByRole('button', { name: 'HTTP 메시지 보내기' }));
    await waitFor(() => expect(state.reads.messages).toBe(2));
    if (refreshState === 'completed') await waitFor(() => expect(screen.getByLabelText('history')).toHaveTextContent('보낸 메시지'));
    await act(async () => { postGate.resolve(); });
    await waitFor(() => expect(screen.getByLabelText('send')).toHaveTextContent('success'));
    await act(async () => { state.refreshGate?.resolve(); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then list variants, detail and history each make one refresh, with no cancelled restart.
    expect(screen.getByLabelText('preview')).toHaveTextContent('보낸 메시지');
    expect(screen.getByLabelText('history')).toHaveTextContent('보낸 메시지');
    expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 4, detail: 2, messages: 2 });
  });

  it('POST 갱신 완료 뒤 도착한 동일 socket 이벤트는 HTTP를 반복하지 않는다', async () => {
    // Given the sender POST finishes before the corresponding socket delivery.
    server.use(http.post('*/api/v1/chat/rooms/room-1/messages', () => {
      state.messages.push(message('msg-new', '보낸 메시지'));
      return sendResult();
    }));
    const client = await renderSender();
    fireEvent.click(screen.getByRole('button', { name: 'HTTP 메시지 보내기' }));
    await waitFor(() => expect(screen.getByLabelText('history')).toHaveTextContent('보낸 메시지'));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // When the delayed event repeats the same persisted message identity.
    emitSenderMessage();
    await act(async () => {});
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then the actual HTTP reads remain one per active query.
    expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 4, detail: 2, messages: 2 });
  });

  it('조회 진행 중 새 고유 이벤트가 연속 도착해도 최종 메시지를 놓치지 않는다', async () => {
    // Given a snapshot of the first socket refresh is held at the HTTP boundary.
    const client = await renderSender();
    state.refreshGate = deferred();
    state.messages.push(message('msg-new', '첫 새 메시지'));
    emitSenderMessage();
    await waitFor(() => expect(state.reads.messages).toBe(2));
    // When another tab persists a different message while those reads are pending.
    state.messages.push(message('msg-next', '최종 새 메시지'));
    emitSenderMessage('msg-next');
    await waitFor(() => expect(state.reads.messages).toBe(3));
    await act(async () => { state.refreshGate?.resolve(); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then the latest unique event supersedes the stale first response on both surfaces.
    expect(screen.getByLabelText('preview')).toHaveTextContent('최종 새 메시지');
    expect(screen.getByLabelText('history')).toHaveTextContent('최종 새 메시지');
    expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 6, detail: 3, messages: 3 });
  });

  it('늦은 POST 완료가 더 새로운 다른 탭 메시지 조회를 재시작하지 않는다', async () => {
    // Given this tab's committed send event arrives before its delayed POST response.
    const postGate = deferred();
    server.use(http.post('*/api/v1/chat/rooms/room-1/messages', async () => {
      state.messages.push(message('msg-new', '보낸 메시지'));
      emitSenderMessage();
      await postGate.promise;
      return sendResult();
    }));
    const client = await renderSender();
    state.refreshGate = deferred();
    fireEvent.click(screen.getByRole('button', { name: 'HTTP 메시지 보내기' }));
    await waitFor(() => expect(state.reads.messages).toBe(2));
    // When a newer cross-tab message supersedes those GETs before the old POST resolves.
    state.messages.push(message('msg-next', '더 새로운 다른 탭 메시지'));
    emitSenderMessage('msg-next');
    await waitFor(() => expect(state.reads.messages).toBe(3));
    await act(async () => { postGate.resolve(); });
    await waitFor(() => expect(screen.getByLabelText('send')).toHaveTextContent('success'));
    await act(async () => { state.refreshGate?.resolve(); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then the newest actual HTTP data wins, with exactly one refresh per unique identity.
    expect(screen.getByLabelText('preview')).toHaveTextContent('더 새로운 다른 탭 메시지');
    expect(screen.getByLabelText('history')).toHaveTextContent('더 새로운 다른 탭 메시지');
    expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 6, detail: 3, messages: 3 });
  });

  it('실패한 POST는 오류를 표시하고 실제 재전송과 다른 탭 이벤트를 처리한다', async () => {
    // Given the first persisted send is rejected, with no emitted message.
    let posts = 0;
    server.use(http.post('*/api/v1/chat/rooms/room-1/messages', () => {
      if (++posts === 1) return HttpResponse.json({ status: 'error', statusCode: 503,
        code: 'CHAT_SEND_FAILED', message: '저장 실패', details: null, timestamp }, { status: 503 });
      state.messages.push(message('msg-new', '보낸 메시지'));
      emitSenderMessage();
      return sendResult();
    }));
    const client = await renderSender();
    fireEvent.click(screen.getByRole('button', { name: 'HTTP 메시지 보내기' }));
    await waitFor(() => expect(screen.getByLabelText('send')).toHaveTextContent('저장 실패'));
    expect(screen.getByLabelText('history')).not.toHaveTextContent('보낸 메시지');
    expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 2, detail: 1, messages: 1 });
    // When the same action is retried successfully and another tab then sends a unique message.
    fireEvent.click(screen.getByRole('button', { name: 'HTTP 메시지 보내기' }));
    await waitFor(() => expect(screen.getByLabelText('history')).toHaveTextContent('보낸 메시지'));
    await waitFor(() => expect(screen.getByLabelText('send')).toHaveTextContent('success'));
    state.messages.push(message('msg-other-tab', '다른 탭 후속 메시지'));
    emitSenderMessage('msg-other-tab');
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Then failure visibility, retry and subsequent cross-tab updates all remain real.
    expect(screen.getByLabelText('preview')).toHaveTextContent('다른 탭 후속 메시지');
    expect(screen.getByLabelText('history')).toHaveTextContent('다른 탭 후속 메시지');
    expect(posts).toBe(2);
  });

  it('발신자 메시지 이벤트만으로 열려 있는 본문과 사이드 목록 미리보기를 함께 갱신한다', async () => {
    // Given the same account's other tab has loaded the old message and preview.
    renderPage('room');
    await waitFor(() => expect(screen.getAllByText('이전 메시지')).toHaveLength(2));
    state.messages.push(message('msg-new', '다른 탭에서 보낸 메시지'));
    // When the persisted sender event arrives, with no notification:new event.
    emitSenderMessage();
    // Then real HTTP responses update both surfaces.
    await waitFor(() => expect(screen.getAllByText('다른 탭에서 보낸 메시지')).toHaveLength(2));
    expect(within(screen.getByRole('complementary', { name: '채팅방 목록' })).getByText('다른 탭에서 보낸 메시지')).toBeInTheDocument();
  });

  it('단독 채팅 목록도 발신자 이벤트로 기존 미리보기를 갱신한다', async () => {
    // Given a standalone list with an already loaded preview.
    renderPage('list');
    await screen.findAllByText('이전 메시지');
    const initialRequests = state.listRequests;
    state.messages.push(message('msg-new', '목록에 갱신된 메시지'));
    // When only the sender's message event arrives.
    emitSenderMessage();
    // Then the mounted list consumes it and makes one HTTP refresh.
    expect(await screen.findAllByText('목록에 갱신된 메시지')).toHaveLength(2);
    expect(state.listRequests).toBe(initialRequests + 1);
  });

  it('팀 필터를 연 목록은 전체·필터 캐시를 각각 한 번 갱신한다', async () => {
    // Given both the base list and selected team list are active.
    renderPage('list');
    await screen.findAllByText('이전 메시지');
    fireEvent.click(screen.getAllByRole('button', { name: '팀' })[0]);
    await waitFor(() => expect(state.listRequests).toBe(2));
    state.messages.push(message('msg-new', '필터에도 갱신된 메시지'));
    // When the sender's message event arrives.
    emitSenderMessage();
    // Then both actual query variants refresh, without duplicate requests.
    expect(await screen.findAllByText('필터에도 갱신된 메시지')).toHaveLength(2);
    expect(state.listRequests).toBe(4);
  });
});
