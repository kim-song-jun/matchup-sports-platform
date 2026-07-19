import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { currentRuntimeConfiguration, resolveV1RequestIdentity } from '../auth/v1-session';
import { requireProductionFrontendOrigin } from '../common/security/v1-mutation-origin';
import { getPendingSocialSignupRoute } from '../auth/social-signup-access';

type V1Socket = Socket & { data: { userId?: string } };

// main.ts computes this identically at bootstrap for the REST app's CORS —
// mirrored here so the WS gateway doesn't reflect-and-allow every origin in
// production while REST is locked to a single allow-listed FRONTEND_URL.
const isProduction = process.env.NODE_ENV === 'production';
const frontendOrigin = isProduction ? requireProductionFrontendOrigin(process.env.FRONTEND_URL) : null;

@WebSocketGateway({ cors: { origin: frontendOrigin ?? true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: V1Socket): Promise<void> {
    // NestJS's global AllExceptionsFilter is HTTP-only and never runs for gateway
    // lifecycle hooks — an unhandled rejection here (e.g. a transient DB outage in
    // findFirst) would otherwise escape as an unhandled promise rejection and crash
    // the whole API process. Wrap the entire handshake so a DB/identity failure only
    // rejects this one client instead of taking every connection down with it.
    try {
      const identity = resolveV1RequestIdentity(
        {
          headers: { cookie: toSingleValue(client.handshake.headers.cookie) },
          // socket.io-client sends the dev-header identity (x-v1-user-id/x-v1-user-email)
          // as the `auth` handshake payload, not as real HTTP headers — browsers can't set
          // arbitrary headers on a WS/polling handshake, which is exactly why socket.io has
          // a separate `auth` option. Check that first, falling back to real headers for any
          // client that does send them directly.
          header: (name: string) => {
            const authValue = (client.handshake.auth as Record<string, unknown> | undefined)?.[name];
            if (typeof authValue === 'string' && authValue.trim()) return authValue;
            return toSingleValue(client.handshake.headers[name.toLowerCase()]);
          },
        },
        currentRuntimeConfiguration(),
      );

      if (!identity) {
        client.disconnect(true);
        return;
      }

      const user = await this.prisma.v1User.findFirst({
        where: identity.kind === 'user_id' ? { id: identity.userId } : { email: identity.email },
        select: { id: true, accountStatus: true, onboardingStatus: true },
      });

      if (!user || ['suspended', 'blocked', 'deleted'].includes(user.accountStatus)) {
        client.disconnect(true);
        return;
      }

      // Mirror V1AuthGuard's second gate: a pending-social-signup account is blocked from
      // nearly every REST endpoint, so it shouldn't hold an authenticated realtime channel either.
      if (getPendingSocialSignupRoute(user.onboardingStatus)) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      await client.join(`user:${user.id}`);
      this.logger.debug(`Socket ${client.id} joined user:${user.id}`);
    } catch (err) {
      this.logger.error(
        `Socket ${client.id} handshake failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}

function toSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
