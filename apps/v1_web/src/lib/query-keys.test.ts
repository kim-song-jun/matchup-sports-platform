import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { clearV1IdentityCache, v1Keys } from './query-keys';

describe('clearV1IdentityCache', () => {
  it('removes all v1-scoped cached queries so a new identity never sees a previous identity data', () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(v1Keys.chatRoom('room-a'), { id: 'room-a', title: '이전 사용자의 채팅방' });
    queryClient.setQueryData(v1Keys.chatRooms(), [{ id: 'room-a' }]);
    queryClient.setQueryData(v1Keys.authMe(), { id: 'user-1' });

    expect(queryClient.getQueryData(v1Keys.chatRoom('room-a'))).toEqual({
      id: 'room-a',
      title: '이전 사용자의 채팅방',
    });

    clearV1IdentityCache(queryClient);

    expect(queryClient.getQueryData(v1Keys.chatRoom('room-a'))).toBeUndefined();
    expect(queryClient.getQueryData(v1Keys.chatRooms())).toBeUndefined();
    expect(queryClient.getQueryData(v1Keys.authMe())).toBeUndefined();
  });
});
