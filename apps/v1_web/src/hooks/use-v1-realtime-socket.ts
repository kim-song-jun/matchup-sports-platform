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
      queryClient.invalidateQueries({ queryKey: v1Keys.chatRoom(roomId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.chatMessages(roomId) });
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
