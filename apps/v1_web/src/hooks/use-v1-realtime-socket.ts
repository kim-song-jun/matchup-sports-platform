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
    socket.on('notification:new', handler);
    return () => {
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
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:message', handler);
    };
  }, [queryClient, roomId]);
}
