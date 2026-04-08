'use client';
import { io, Socket } from 'socket.io-client';

// Event payload types for typed subscriptions
export interface ChatMessagePayload {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender?: { id: string; nickname: string; profileImageUrl: string | null };
}

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead?: boolean;
  data?: Record<string, unknown>;
  category?: 'match' | 'team' | 'chat' | 'payment' | 'system';
  link?: string | null;
  ctaLabel?: string | null;
  createdAt: string;
}

export interface NotificationReadPayload {
  notificationId: string;
}

export interface NotificationReadAllPayload {
  count: number;
}

export interface ServerToClientEvents {
  'chat:message': (payload: ChatMessagePayload) => void;
  'notification:new': (payload: NotificationPayload) => void;
  'notification:read': (payload: NotificationReadPayload) => void;
  'notification:read-all': (payload: NotificationReadAllPayload) => void;
}

export interface ClientToServerEvents {
  'chat:join': (roomId: string) => void;
  'chat:leave': (roomId: string) => void;
  'chat:message': (payload: { roomId: string; content: string }) => void;
  'notification:read': (payload: { notificationId: string }) => void;
}

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let _socket: RealtimeSocket | null = null;

/**
 * Creates (or returns existing) a singleton Socket.IO connection authenticated with the given JWT.
 * Disconnects and recreates if the token has changed.
 */
export function createRealtimeSocket(token: string): RealtimeSocket {
  const existingAuth = _socket?.auth as Record<string, string> | undefined;
  if (_socket && existingAuth?.token === token) {
    if (!_socket.connected) {
      _socket.connect();
    }
    return _socket;
  }

  // Token changed or no socket yet — disconnect previous
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }

  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8111';

  _socket = io(url, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling'],
  }) as RealtimeSocket;

  return _socket;
}

/** Returns the current singleton socket without creating a new one. */
export function getSocket(): RealtimeSocket | null {
  return _socket;
}

/** Disconnects and clears the singleton socket. Call on logout. */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
