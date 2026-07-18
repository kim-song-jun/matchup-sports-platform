import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { currentRuntimeConfiguration, resolveV1RequestIdentity } from '../auth/v1-session';
import { assertChatParticipant } from '../chat/chat-participant.guard';

type V1Socket = Socket & { data: { userId?: string } };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: V1Socket): Promise<void> {
    const identity = resolveV1RequestIdentity(
      {
        headers: { cookie: toSingleValue(client.handshake.headers.cookie) },
        header: (name: string) => toSingleValue(client.handshake.headers[name.toLowerCase()]),
      },
      currentRuntimeConfiguration(),
    );

    if (!identity) {
      client.disconnect(true);
      return;
    }

    const user = await this.prisma.v1User.findFirst({
      where: identity.kind === 'user_id' ? { id: identity.userId } : { email: identity.email },
      select: { id: true, accountStatus: true },
    });

    if (!user || ['suspended', 'blocked', 'deleted'].includes(user.accountStatus)) {
      client.disconnect(true);
      return;
    }

    client.data.userId = user.id;
    await client.join(`user:${user.id}`);
    this.logger.debug(`Socket ${client.id} joined user:${user.id}`);
  }

  @SubscribeMessage('chat:join')
  async handleChatJoin(client: V1Socket, payload: { roomId?: string }): Promise<void> {
    const userId = client.data.userId;
    const roomId = payload?.roomId;
    if (!userId || !roomId) return;

    const isParticipant = await assertChatParticipant(this.prisma, userId, roomId);
    if (!isParticipant) return;

    await client.join(`chat:${roomId}`);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}

function toSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
