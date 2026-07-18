import { io, type Socket } from 'socket.io-client';
import { getStoredV1Session } from './session-storage';

let socket: Socket | null = null;

export function getV1Socket(): Socket {
  if (socket) return socket;

  const { userId, userEmail } = getStoredV1Session();
  socket = io('/', {
    path: '/socket.io',
    auth: {
      ...(userId ? { 'x-v1-user-id': userId } : {}),
      ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
    },
    withCredentials: true,
  });
  return socket;
}

export function disconnectV1Socket(): void {
  socket?.disconnect();
  socket = null;
}
