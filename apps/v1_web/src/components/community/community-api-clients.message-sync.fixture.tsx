import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { expect } from 'vitest';
import type { V1ChatMessage, V1ChatRoom, V1ChatRoomDetail } from '@/types/api';
import { useV1ChatMessages, useV1ChatRoom, useV1ChatRooms, useV1SendChatMessage } from '@/hooks/use-v1-api';
import { useV1ChatListSocket, useV1ChatRoomSocket } from '@/hooks/use-v1-realtime-socket';

const linkedTarget = { type: 'team', id: 'team-1', title: '동기화 테스트 팀', route: '/teams/team-1' } as const;
const roomDetail: V1ChatRoomDetail = {
  roomId: 'room-1', roomType: 'team', title: '동기화 테스트 팀', status: 'active', teamContact: null,
  linkedTarget,
  me: { participantId: 'participant-a', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId: null },
  participants: [{ userId: 'user-a', displayName: '나', role: 'owner' }],
};
export function message(messageId: string, content: string): V1ChatMessage {
  return {
    messageId, content, sender: { userId: 'user-a', displayName: '나', profileImageUrl: null },
    messageType: 'text', mine: true, status: 'sent', sentAt: '2026-10-08T10:00:00.000Z', unreadCount: 0,
  };
}
const requestGates: (() => void)[] = [];
export function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  requestGates.push(resolve);
  return { promise, resolve };
}
export function releaseMessageSyncRequests(): void {
  for (const release of requestGates) release();
  requestGates.length = 0;
}
// Mutable HTTP state is reset by the owning spec before each scenario.
export const state: {
  messages: V1ChatMessage[];
  listRequests: number;
  reads: { detail: number; messages: number };
  refreshGate: ReturnType<typeof deferred> | undefined;
} = { messages: [], listRequests: 0, reads: { detail: 0, messages: 0 }, refreshGate: undefined };
export const clients: QueryClient[] = [];
export const timestamp = '2026-10-08T10:00:00.000Z';
export const pageInfo = { nextCursor: null, hasNext: false };
function roomListItem(): V1ChatRoom {
  const last = state.messages.at(-1);
  return {
    roomId: 'room-1', roomType: 'team', title: roomDetail.title, status: 'active', linkedTarget,
    linkedTargetCancelled: false, teamContact: null, unreadCount: 0, pinned: false, muted: false,
    lastMessage: last ? { messageId: last.messageId, contentPreview: last.content ?? '', sentAt: last.sentAt } : null,
  };
}
export const server = setupServer(
  http.get('*/api/v1/chat/rooms', async () => {
    state.listRequests += 1;
    const items = [roomListItem()];
    await state.refreshGate?.promise;
    return HttpResponse.json({ status: 'success', data: { items, pageInfo }, timestamp });
  }),
  http.get('*/api/v1/chat/rooms/room-1', async () => {
    state.reads.detail += 1;
    await state.refreshGate?.promise;
    return HttpResponse.json({ status: 'success', data: roomDetail, timestamp });
  }),
  http.get('*/api/v1/chat/rooms/room-1/messages', async () => {
    state.reads.messages += 1;
    const items = [...state.messages].reverse();
    await state.refreshGate?.promise;
    return HttpResponse.json({ status: 'success', data: { items, pageInfo }, timestamp });
  }),
  http.patch('*/api/v1/chat/rooms/room-1/me', async ({ request }) => {
    const body = await request.json();
    const lastReadMessageId = typeof body === 'object' && body !== null && 'lastReadMessageId' in body
      ? body.lastReadMessageId : null;
    return HttpResponse.json({ status: 'success', data: {
      roomId: 'room-1', status: 'active', pinned: false, mutedUntil: null, lastReadMessageId,
    }, timestamp });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
function SendConsumer() {
  useV1ChatListSocket();
  useV1ChatRoomSocket('room-1');
  const rooms = useV1ChatRooms();
  useV1ChatRooms(undefined, { roomType: 'team', limit: 50 });
  const room = useV1ChatRoom('room-1');
  const history = useV1ChatMessages('room-1', { limit: 50 });
  const send = useV1SendChatMessage('room-1');
  return <>
    <output aria-label="preview">{rooms.data?.items[0]?.lastMessage?.contentPreview}</output>
    <output aria-label="history">{history.data?.items.map((item) => item.content).join('|')}</output>
    <output aria-label="history-error">{history.isError ? history.error.message : ''}</output>
    <output aria-label="detail">{room.status}</output>
    <output aria-label="send">{send.isError ? send.error.message : send.status}</output>
    <button onClick={() => send.mutate({ content: '보낸 메시지' })}>HTTP 메시지 보내기</button>
  </>;
}
export function renderSendConsumer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><SendConsumer /></QueryClientProvider>);
  return client;
}
export async function renderSender() {
  const client = renderSendConsumer();
  await waitFor(() => expect(screen.getByLabelText('history')).toHaveTextContent('이전 메시지'));
  await waitFor(() => expect(screen.getByLabelText('preview')).toHaveTextContent('이전 메시지'));
  await waitFor(() => expect(screen.getByLabelText('detail')).toHaveTextContent('success'));
  expect({ list: state.listRequests, ...state.reads }).toEqual({ list: 2, detail: 1, messages: 1 });
  return client;
}
export function sendResult(messageId = 'msg-new') {
  return HttpResponse.json({ status: 'success', data: {
    messageId, roomId: 'room-1', content: '보낸 메시지', status: 'sent', sentAt: timestamp,
  }, timestamp });
}
