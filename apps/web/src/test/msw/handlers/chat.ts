import { http } from 'msw';
import { success, paged } from './_utils';
import { mockChatRoom, mockDirectChatRoom, mockChatMessage } from '../../fixtures/chat';

export const chatHandlers = [
  http.get('/api/v1/chat/unread-count', () => {
    return success({ unreadCount: 2 });
  }),

  http.get('/api/v1/chat/rooms', () => {
    return paged([mockChatRoom, mockDirectChatRoom]);
  }),

  http.post('/api/v1/chat/rooms', () => {
    return success(mockChatRoom);
  }),

  http.get('/api/v1/chat/rooms/:id', ({ params }) => {
    return success({
      ...mockChatRoom,
      id: params.id as string,
      messages: [mockChatMessage],
      nextCursor: null,
    });
  }),

  http.post('/api/v1/chat/rooms/:id/messages', ({ params }) => {
    return success({ ...mockChatMessage, roomId: params.id as string });
  }),

  http.patch('/api/v1/chat/rooms/:id/read', ({ params }) => {
    return success({ roomId: params.id as string, readAt: new Date().toISOString() });
  }),
];
