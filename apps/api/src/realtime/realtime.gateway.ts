import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3003', 'capacitor://localhost'],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId: string = payload.sub;
      (client.data as { userId: string }).userId = userId;
      await client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (userId=${userId})`);
    } catch {
      this.logger.warn(`Client disconnected due to auth failure: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as { userId?: string }).userId ?? 'unknown';
    this.logger.log(`Client disconnected: ${client.id} (userId=${userId})`);
  }

  // ─── Match room (legacy) ────────────────────────────────────────────────

  @SubscribeMessage('match:join')
  handleJoinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    client.join(`match:${data.matchId}`);
    return { event: 'match:joined', data: { matchId: data.matchId } };
  }

  @SubscribeMessage('match:leave')
  handleLeaveMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    client.leave(`match:${data.matchId}`);
  }

  // ─── Chat events ────────────────────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) {
      client.emit('chat:error', { code: 'CHAT_FORBIDDEN', message: '인증이 필요합니다.' });
      return;
    }

    try {
      await this.chatService.assertParticipant(data.roomId, userId);
      client.join(`chat:${data.roomId}`);
      return { ok: true };
    } catch {
      client.emit('chat:error', { code: 'CHAT_FORBIDDEN', message: '채팅방 접근 권한이 없습니다.' });
    }
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`chat:${data.roomId}`);
  }

  @SubscribeMessage('chat:message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; message: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return;

    try {
      // ChatService.postMessage persists and broadcasts — no duplicate emit here.
      await this.chatService.postMessage(data.roomId, userId, {
        content: data.message,
      });
    } catch (err) {
      this.logger.warn(`chat:message persist failed for userId=${userId} roomId=${data.roomId}: ${err}`);
      client.emit('chat:error', { code: 'CHAT_FORBIDDEN', message: '메시지 전송 실패' });
    }
  }

  @SubscribeMessage('chat:typing')
  handleChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    client.to(`chat:${data.roomId}`).emit('chat:typing', {
      userId,
      roomId: data.roomId,
    });
  }

  // ─── Notification events ────────────────────────────────────────────────

  @SubscribeMessage('notification:subscribe')
  handleNotificationSubscribe() {
    // No-op: user is already subscribed to their user room on connect.
    return { ok: true };
  }

  @SubscribeMessage('notification:read')
  async handleNotificationRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    const userId = (client.data as { userId?: string }).userId;
    if (!userId) return;
    await this.notificationsService.markRead(data.notificationId, userId);
  }

  // ─── Server-side emit helpers ───────────────────────────────────────────

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToRoom(roomId: string, event: string, payload: unknown) {
    this.server.to(`chat:${roomId}`).emit(event, payload);
  }

  /** @deprecated Use emitToRoom instead */
  emitTeamMeetdate(matchId: string, event: string, data: unknown) {
    this.server.to(`match:${matchId}`).emit(event, data);
  }
}
