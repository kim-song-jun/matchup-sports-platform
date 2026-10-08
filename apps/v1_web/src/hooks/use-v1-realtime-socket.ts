import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getV1Socket } from '@/lib/v1-socket';
import { v1Keys } from '@/lib/query-keys';

export function useV1NotificationSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.notificationsRoot() });
      queryClient.invalidateQueries({ queryKey: v1Keys.notificationUnreadSummary() });
    };
    const safetyHandler = () => {
      void queryClient.cancelQueries({ queryKey: v1Keys.chatRooms() }).then(() => queryClient.resetQueries({ queryKey: v1Keys.chatRooms() }));
      void queryClient.invalidateQueries({ queryKey: [...v1Keys.all, 'chat', 'blocked-users'] });
    };
    socket.on('chat:safety-changed', safetyHandler);
    socket.on('notification:new', handler);
    return () => {
      socket.off('chat:safety-changed', safetyHandler);
      socket.off('notification:new', handler);
    };
  }, [queryClient]);
}

export function useV1ChatRoomSocket(roomId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const handler = () => {
      // 메시지 쿼리도 이 prefix 아래에 있다. 두 번 무효화하면 진행 중인 요청을
      // 취소하고 다시 시작하므로 현재 방의 subtree를 한 번만 갱신한다.
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRoom(roomId) });
    };
    // The global bridge may have mounted before login; the active room must
    // also clear cached content when either participant changes a block.
    const safetyHandler = () => {
      void queryClient.cancelQueries({ queryKey: v1Keys.chatRooms() }).then(() => queryClient.resetQueries({ queryKey: v1Keys.chatRooms() }));
    };
    socket.on('chat:safety-changed', safetyHandler);
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:safety-changed', safetyHandler);
      socket.off('chat:message', handler);
    };
  }, [queryClient, roomId]);
}

export function useV1ChatListSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const root = v1Keys.chatRooms();
    const handler = () => {
      void queryClient.invalidateQueries({
        queryKey: root,
        // 필터 목록은 prefix 뒤에 'list'와 filters가 붙고, 상세는 roomId가 붙는다.
        // 같은 화면의 방 listener와 겹치지 않게 전체·필터 목록만 갱신한다.
        predicate: (query) => query.queryKey.length === root.length
          || (query.queryKey.length === root.length + 2
            && query.queryKey[root.length] === 'list'
            && typeof query.queryKey[root.length + 1] === 'object'),
      });
    };
    socket.on('chat:message', handler);
    return () => { socket.off('chat:message', handler); };
  }, [queryClient]);
}
