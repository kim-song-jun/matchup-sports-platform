import { describe, expect, it } from 'vitest';
import { chatRoomHref } from './chat-route';

describe('chatRoomHref', () => {
  it('maps legacy API room routes to the v1 web chat route', () => {
    expect(chatRoomHref('room-1', '/chat/rooms/room-1')).toBe('/chat/room-1');
  });

  it('keeps current web chat routes and falls back to the room id', () => {
    expect(chatRoomHref('room-1', '/chat/room-1')).toBe('/chat/room-1');
    expect(chatRoomHref('room-1', null)).toBe('/chat/room-1');
  });
});
