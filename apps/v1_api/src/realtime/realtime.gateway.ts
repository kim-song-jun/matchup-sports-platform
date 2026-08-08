import { ForbiddenException, HttpException, Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Server, Socket } from 'socket.io';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { currentRuntimeConfiguration, resolveV1RequestIdentity } from '../auth/v1-session';
import { requireProductionFrontendOrigin } from '../common/security/v1-mutation-origin';
import { getPendingSocialSignupRoute } from '../auth/social-signup-access';
import { AppendGameEventDto } from '../games/dto/game-event.dto';
import { GamesService } from '../games/games.service';
import type { GameEventAppendResult } from '../games/games.types';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';

type V1Socket = Socket & {
  data: {
    userId?: string;
    authUser?: V1AuthUser;
    clientInstanceId?: string;
    authorizationSubjectVersion?: number;
  };
};

type GameBackfill = {
  readonly events: readonly unknown[];
  readonly lastSequence: number;
  readonly gap?: { readonly expectedSequence: number; readonly availableFrom: number } | null;
};

type RetryGameEventInput = {
  readonly rebasedExpectedVersion: number;
  readonly clientEventId: string;
  readonly takeoverToken: string;
  readonly payloadHash: string;
  readonly event: Record<string, unknown>;
};

type GameTakeoverGrantResult = {
  readonly gameId: string;
  readonly takeoverToken: string;
  readonly version: number;
  readonly lastSequence: number;
  readonly expiresAt: string;
};

type GameRealtimeOperations = {
  listEvents(user: V1AuthUser, gameId: string, afterSequence: number): Promise<GameBackfill>;
  appendEvent(
    user: V1AuthUser,
    gameId: string,
    idempotencyKey: string,
    dto: AppendGameEventDto,
  ): Promise<GameEventAppendResult>;
  retryEvent(
    user: V1AuthUser,
    gameId: string,
    input: RetryGameEventInput,
  ): Promise<GameEventAppendResult>;
  requestTakeover(
    user: V1AuthUser,
    gameId: string,
    input: { clientInstanceId: string; lastSequence: number },
  ): Promise<GameTakeoverGrantResult>;
  renewTakeover(
    user: V1AuthUser,
    gameId: string,
    input: { takeoverToken: string; clientInstanceId: string },
  ): Promise<GameTakeoverGrantResult>;
};

type GameSubscriptionPayload = {
  readonly gameId: string;
  readonly afterSequence: number;
};

type GameUnsubscriptionPayload = {
  readonly gameId: string;
};

type GameSnapshot = {
  readonly gameId: string;
  readonly version: number;
  readonly state: string;
  readonly lastSequence: number;
  readonly events: readonly unknown[];
};

type GameSubscriptionResult =
  | {
      readonly status: 'subscribed';
      readonly room: string;
      readonly afterSequence: number;
      readonly snapshot: GameSnapshot;
    }
  | { readonly status: 'unsubscribed'; readonly room: string }
  | { readonly status: 'denied'; readonly code: 'STAFF_SCOPE_DENIED' | 'VALIDATION_ERROR' };

type GameEventCommandPayload = {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly clientEventId: string;
  readonly takeoverToken: string;
  readonly payloadHash: string;
  readonly event: Record<string, unknown>;
};

type GameEventRetryPayload = Omit<GameEventCommandPayload, 'expectedVersion'> & {
  readonly rebasedExpectedVersion: number;
};

type GameTakeoverRequestPayload = {
  readonly gameId: string;
  readonly authorizationSubjectVersion: number;
  readonly clientInstanceId: string;
  readonly lastSequence: number;
};

type GameTakeoverRenewPayload = {
  readonly gameId: string;
  readonly takeoverToken: string;
  readonly clientInstanceId: string;
};

type GameTakeoverResult =
  | ({ readonly status: 'granted' } & GameTakeoverGrantResult)
  | { readonly status: 'denied'; readonly code: 'STAFF_SCOPE_DENIED' | 'TAKEOVER_TOKEN_EXPIRED' | 'VALIDATION_ERROR' };

type GameProtocolResult =
  | {
      readonly status: 'ack';
      readonly clientEventId: string;
      readonly sequence: number;
      readonly version: number;
    }
  | {
      readonly status: 'error';
      readonly code: string;
      readonly clientEventId?: string;
      readonly expectedVersion?: number;
    };

// main.ts computes this identically at bootstrap for the REST app's CORS —
// mirrored here so the WS gateway doesn't reflect-and-allow every origin in
// production while REST is locked to a single allow-listed FRONTEND_URL.
const isProduction = process.env.NODE_ENV === 'production';
const frontendOrigin = isProduction ? requireProductionFrontendOrigin(process.env.FRONTEND_URL) : null;

@WebSocketGateway({
  namespace: '/game-operations',
  cors: { origin: frontendOrigin ?? true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentStaffAccess: TournamentStaffAccessService,
    @Inject(GamesService) private readonly gamesService: GameRealtimeOperations,
    @InjectPinoLogger(RealtimeGateway.name) private readonly logger: PinoLogger,
  ) {}

  private readonly gameSubscriptions = new Map<
    string,
    Map<string, Map<string, Set<string>>>
  >();

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticateSocket(socket)
        .then(() => next())
        .catch((error: unknown) => {
          this.logger.error(
            { socketId: socket.id, err: error },
            'Socket pre-connect authentication failed',
          );
          next(new Error('SOCKET_AUTH_FAILED'));
        });
    });
  }

  async handleConnection(client: V1Socket): Promise<void> {
    // NestJS's global AllExceptionsFilter is HTTP-only and never runs for gateway
    // lifecycle hooks — an unhandled rejection here (e.g. a transient DB outage in
    // findFirst) would otherwise escape as an unhandled promise rejection and crash
    // the whole API process. Wrap the entire handshake so a DB/identity failure only
    // rejects this one client instead of taking every connection down with it.
    try {
      if (!hasAuthenticatedSocketData(client)) {
        await this.authenticateSocket(client);
      }
      const userId = client.data.userId;
      if (userId === undefined) {
        throw new Error('SOCKET_AUTH_STATE_INVALID');
      }
      await client.join(`user:${userId}`);
      this.logger.debug(
        { socketId: client.id, userId },
        'Socket joined user room',
      );
    } catch (err) {
      // err 필드에 Error 객체를 그대로 넘긴다 — pino의 표준 에러 직렬화가 stack까지
      // 포함해 주는데, 문자열로 미리 변환하면 그 정보가 사라진다.
      this.logger.error({ socketId: client.id, err }, 'Socket handshake failed');
      client.disconnect(true);
    }
  }

  private async authenticateSocket(client: V1Socket): Promise<void> {
    const identity = resolveV1RequestIdentity(
      {
        headers: { cookie: toSingleValue(client.handshake.headers.cookie) },
        header: (name: string) => {
          const authValue = isRecord(client.handshake.auth)
            ? client.handshake.auth[name]
            : undefined;
          if (typeof authValue === 'string' && authValue.trim()) return authValue;
          return toSingleValue(client.handshake.headers[name.toLowerCase()]);
        },
      },
      currentRuntimeConfiguration(),
    );
    if (identity === null) {
      throw new Error('SOCKET_IDENTITY_REQUIRED');
    }

    const connectionMetadata = parseConnectionMetadata(client.handshake.auth);
    if (connectionMetadata === null) {
      throw new Error('SOCKET_METADATA_INVALID');
    }

    const user = await this.prisma.v1User.findFirst({
      where: identity.kind === 'user_id' ? { id: identity.userId } : { email: identity.email },
      select: { id: true, email: true, accountStatus: true, onboardingStatus: true },
    });
    if (user === null || ['suspended', 'blocked', 'deleted'].includes(user.accountStatus)) {
      throw new Error('SOCKET_ACCOUNT_DENIED');
    }
    if (getPendingSocialSignupRoute(user.onboardingStatus)) {
      throw new Error('SOCKET_ONBOARDING_REQUIRED');
    }

    client.data.userId = user.id;
    client.data.authUser = user;
    client.data.clientInstanceId = connectionMetadata.clientInstanceId;
    client.data.authorizationSubjectVersion = connectionMetadata.authorizationSubjectVersion;
  }

  handleDisconnect(client: V1Socket): void {
    const userId = client.data.userId;
    const authUser = client.data.authUser;
    if (userId === undefined || authUser === undefined || authUser.id !== userId) {
      return;
    }
    this.removeSocketSubscriptions(userId, client.id);
  }

  @SubscribeMessage('game.subscribe')
  async subscribeToGame(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameSubscriptionResult> {
    const input = parseGameSubscription(payload);
    if (input === null) {
      return { status: 'denied', code: 'VALIDATION_ERROR' };
    }

    const userId = client.data.userId;
    const authUser = client.data.authUser;
    if (userId === undefined || authUser === undefined || authUser.id !== userId) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }

    const game = await this.prisma.v1Game.findUnique({
      where: { id: input.gameId },
      select: {
        id: true,
        state: true,
        version: true,
        lastSequence: true,
        tournamentFixture: {
          select: { id: true, tournamentId: true, fieldId: true },
        },
      },
    });
    if (game === null) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }

    const fixture = game.tournamentFixture;
    try {
      if (fixture !== null) {
        const principal = await this.tournamentStaffAccess.assertAccess({
          userId,
          action: 'read',
          resource: {
            tournamentId: fixture.tournamentId,
            fixtureId: fixture.id,
            ...(fixture.fieldId === null ? {} : { fieldId: fixture.fieldId }),
          },
        });
        if (
          principal.assignmentVersion !== null &&
          client.data.authorizationSubjectVersion !== principal.assignmentVersion
        ) {
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
        }
      }
      const backfill = await this.gamesService.listEvents(authUser, input.gameId, input.afterSequence);
      const room = gameRoom(input.gameId);
      await client.join(room);
      if (fixture !== null) {
        this.recordGameSubscription(userId, fixture.tournamentId, input.gameId, client.id);
      }
      const snapshot = {
        gameId: input.gameId,
        version: game.version,
        state: game.state,
        lastSequence: backfill.lastSequence,
        events: backfill.events,
      };
      client.emit('game.snapshot', snapshot);
      if (backfill.gap !== undefined && backfill.gap !== null) {
        client.emit('game.gap', backfill.gap);
      }
      return {
        status: 'subscribed',
        room,
        afterSequence: input.afterSequence,
        snapshot,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
      }
      throw error;
    }
  }

  @SubscribeMessage('game.time.ping')
  async pingGameTime(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<unknown> {
    const serverReceivedAt = Date.now();
    if (!isPlainObjectWithKeys(payload, ['clientSentAt']) || !isSafeNonnegative(payload.clientSentAt)) {
      return this.emitProtocolError(client, { code: 'VALIDATION_ERROR' });
    }
    const pong = {
      clientSentAt: payload.clientSentAt,
      serverReceivedAt,
      serverSentAt: Date.now(),
    };
    client.emit('game.time.pong', pong);
    return pong;
  }

  @SubscribeMessage('game.event.append')
  async appendGameEvent(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameProtocolResult> {
    const input = parseGameEventCommand(payload);
    if (input === null) {
      // 파싱 실패라 검증된 입력은 없지만, 상관관계 필드까지 버리면 클라이언트가 어떤 큐
      // 항목이 실패했는지 알 수 없어 재시도·표시를 붙이지 못한다(성공/도메인 실패 경로는
      // protocolError 가 항상 실어 보낸다). 형식이 맞는 값만 그대로 되돌려 준다 —
      // 그 값이 온전할 때가 정확히 상관관계를 지을 수 있는 경우다.
      return this.emitProtocolError(client, {
        code: 'VALIDATION_ERROR',
        ...correlationEcho(payload),
      });
    }
    const authUser = authenticatedSocketUser(client);
    if (authUser === null) {
      return this.emitProtocolError(client, {
        code: 'STAFF_SCOPE_DENIED',
        clientEventId: input.clientEventId,
        expectedVersion: input.expectedVersion,
      });
    }
    try {
      const dto = appendEventDto(input);
      const result = await this.gamesService.appendEvent(
        authUser,
        input.gameId,
        input.clientEventId,
        dto,
      );
      return this.acknowledgeGameEvent(client, input.gameId, input.event, result);
    } catch (error) {
      return this.emitProtocolError(client, protocolError(error, input));
    }
  }

  @SubscribeMessage('game.event.retry')
  async retryGameEvent(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameProtocolResult> {
    const input = parseGameEventRetry(payload);
    if (input === null) {
      return this.emitProtocolError(client, { code: 'VALIDATION_ERROR' });
    }
    const authUser = authenticatedSocketUser(client);
    if (authUser === null) {
      return this.emitProtocolError(client, {
        code: 'STAFF_SCOPE_DENIED',
        clientEventId: input.clientEventId,
        expectedVersion: input.rebasedExpectedVersion,
      });
    }
    try {
      const result = await this.gamesService.retryEvent(
        authUser,
        input.gameId,
        {
          rebasedExpectedVersion: input.rebasedExpectedVersion,
          clientEventId: input.clientEventId,
          takeoverToken: input.takeoverToken,
          payloadHash: input.payloadHash,
          event: input.event,
        },
      );
      return this.acknowledgeGameEvent(client, input.gameId, input.event, result);
    } catch (error) {
      return this.emitProtocolError(client, {
        ...protocolError(error, input),
        expectedVersion: input.rebasedExpectedVersion,
      });
    }
  }

  @SubscribeMessage('game.takeover.request')
  async requestGameTakeover(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameTakeoverResult> {
    const input = parseGameTakeoverRequest(payload);
    if (input === null) {
      return { status: 'denied', code: 'VALIDATION_ERROR' };
    }
    const authUser = authenticatedSocketUser(client);
    if (authUser === null) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }
    // Mirrors game.subscribe's staleness gate: a connection whose cached
    // authorization-subject version no longer matches the version it is
    // presenting must re-establish its session rather than take over a game.
    if (client.data.authorizationSubjectVersion !== input.authorizationSubjectVersion) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }
    try {
      const grant = await this.gamesService.requestTakeover(authUser, input.gameId, {
        clientInstanceId: input.clientInstanceId,
        lastSequence: input.lastSequence,
      });
      client.emit('game.takeover.granted', grant);
      return { status: 'granted', ...grant };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
      }
      throw error;
    }
  }

  @SubscribeMessage('game.takeover.renew')
  async renewGameTakeover(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameTakeoverResult> {
    const input = parseGameTakeoverRenew(payload);
    if (input === null) {
      return { status: 'denied', code: 'VALIDATION_ERROR' };
    }
    const authUser = authenticatedSocketUser(client);
    if (authUser === null) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }
    try {
      const grant = await this.gamesService.renewTakeover(authUser, input.gameId, {
        takeoverToken: input.takeoverToken,
        clientInstanceId: input.clientInstanceId,
      });
      client.emit('game.takeover.granted', grant);
      return { status: 'granted', ...grant };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const response = error.getResponse();
        const code =
          isRecord(response) && response.code === 'PERMISSION_DENIED'
            ? 'STAFF_SCOPE_DENIED'
            : 'TAKEOVER_TOKEN_EXPIRED';
        return { status: 'denied', code };
      }
      throw error;
    }
  }

  @SubscribeMessage('game.unsubscribe')
  async unsubscribeFromGame(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameSubscriptionResult> {
    const input = parseGameUnsubscription(payload);
    if (input === null) {
      return { status: 'denied', code: 'VALIDATION_ERROR' };
    }
    const userId = client.data.userId;
    if (userId === undefined) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }

    const room = gameRoom(input.gameId);
    await client.leave(room);
    this.removeGameSubscription(userId, input.gameId, client.id);
    return { status: 'unsubscribed', room };
  }

  evictUserFromScopedGameRooms(input: {
    readonly userId: string;
    readonly tournamentId: string;
    readonly assignmentVersion: number;
  }): void {
    const tournaments = this.gameSubscriptions.get(input.userId);
    const games = tournaments?.get(input.tournamentId);
    if (games === undefined) {
      return;
    }

    const userSockets = this.server.in(`user:${input.userId}`);
    for (const gameId of games.keys()) {
      const room = gameRoom(gameId);
      const socketIds = games.get(gameId) ?? new Set<string>();
      for (const socketId of socketIds) {
        this.server.to(socketId).emit('game.permission.revoked', {
          gameId,
          assignmentVersion: input.assignmentVersion,
        });
      }
      userSockets.socketsLeave(room);
    }
    tournaments?.delete(input.tournamentId);
    if (tournaments?.size === 0) {
      this.gameSubscriptions.delete(input.userId);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /**
   * Forcibly disconnects every socket currently joined to a user's room —
   * every open tab/device, not just one. Used when an admin transitions a
   * user's accountStatus to suspended/blocked/deleted: without this, a
   * socket connected before the status change keeps receiving realtime
   * notifications/chat until it happens to reconnect (handleConnection is
   * the only place accountStatus is re-checked).
   */
  forceDisconnectUser(userId: string): void {
    this.server.in(`user:${userId}`).disconnectSockets(true);
  }

  private acknowledgeGameEvent(
    client: V1Socket,
    gameId: string,
    event: Record<string, unknown>,
    result: GameEventAppendResult,
  ): Extract<GameProtocolResult, { status: 'ack' }> {
    const ack = {
      clientEventId: result.clientEventId,
      sequence: result.sequence,
      version: result.version,
      status: result.replayed ? 'replayed' : 'committed',
    };
    const committed = {
      gameId,
      sequence: result.sequence,
      version: result.version,
      event,
    };
    client.emit('game.event.ack', ack);
    client.emit('game.event.committed', committed);
    if (this.server !== undefined) {
      this.server.to(gameRoom(gameId)).except(client.id).emit('game.event.committed', committed);
    }
    return {
      status: 'ack',
      clientEventId: result.clientEventId,
      sequence: result.sequence,
      version: result.version,
    };
  }

  private emitProtocolError(
    client: V1Socket,
    error: Omit<Extract<GameProtocolResult, { status: 'error' }>, 'status'>,
  ): Extract<GameProtocolResult, { status: 'error' }> {
    const payload = { status: 'error' as const, ...error };
    client.emit('game.error', error);
    return payload;
  }

  private recordGameSubscription(
    userId: string,
    tournamentId: string,
    gameId: string,
    socketId: string,
  ): void {
    const tournaments = this.gameSubscriptions.get(userId) ?? new Map();
    const games = tournaments.get(tournamentId) ?? new Map();
    const sockets = games.get(gameId) ?? new Set();
    sockets.add(socketId);
    games.set(gameId, sockets);
    tournaments.set(tournamentId, games);
    this.gameSubscriptions.set(userId, tournaments);
  }

  private removeGameSubscription(userId: string, gameId: string, socketId: string): void {
    const tournaments = this.gameSubscriptions.get(userId);
    if (tournaments === undefined) {
      return;
    }
    for (const [tournamentId, games] of tournaments) {
      const sockets = games.get(gameId);
      if (sockets === undefined) {
        continue;
      }
      sockets.delete(socketId);
      if (sockets.size === 0) {
        games.delete(gameId);
      }
      if (games.size === 0) {
        tournaments.delete(tournamentId);
      }
    }
    if (tournaments.size === 0) {
      this.gameSubscriptions.delete(userId);
    }
  }

  private removeSocketSubscriptions(userId: string, socketId: string): void {
    const tournaments = this.gameSubscriptions.get(userId);
    if (tournaments === undefined) {
      return;
    }
    for (const games of tournaments.values()) {
      for (const [gameId, sockets] of games) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          games.delete(gameId);
        }
      }
    }
    for (const [tournamentId, games] of tournaments) {
      if (games.size === 0) {
        tournaments.delete(tournamentId);
      }
    }
    if (tournaments.size === 0) {
      this.gameSubscriptions.delete(userId);
    }
  }
}

function toSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

function parseGameSubscription(payload: unknown): GameSubscriptionPayload | null {
  if (!isPlainObjectWithKeys(payload, ['gameId', 'afterSequence'])) {
    return null;
  }
  if (
    typeof payload.gameId !== 'string' ||
    payload.gameId.trim().length === 0 ||
    typeof payload.afterSequence !== 'number' ||
    !Number.isSafeInteger(payload.afterSequence) ||
    payload.afterSequence < 0
  ) {
    return null;
  }
  return { gameId: payload.gameId, afterSequence: payload.afterSequence };
}

function parseGameUnsubscription(payload: unknown): GameUnsubscriptionPayload | null {
  if (!isPlainObjectWithKeys(payload, ['gameId'])) {
    return null;
  }
  if (typeof payload.gameId !== 'string' || payload.gameId.trim().length === 0) {
    return null;
  }
  return { gameId: payload.gameId };
}

function parseConnectionMetadata(payload: unknown): {
  readonly clientInstanceId: string;
  readonly authorizationSubjectVersion: number;
} | null {
  if (!isRecord(payload)) {
    return null;
  }
  if (
    !isNonemptyString(payload.clientInstanceId) ||
    !isSafeNonnegative(payload.authorizationSubjectVersion)
  ) {
    return null;
  }
  return {
    clientInstanceId: payload.clientInstanceId,
    authorizationSubjectVersion: payload.authorizationSubjectVersion,
  };
}

/**
 * 파싱에 실패한 payload 에서 상관관계 필드만 형식이 맞을 때 골라낸다.
 *
 * 검증을 통과하지 못한 입력이므로 의미를 신뢰하지 않는다 — 클라이언트가 자기가 보낸
 * 큐 항목을 되찾는 데만 쓰는 값이라, 타입이 맞는 경우에만 그대로 되돌린다. 값이 없거나
 * 형식이 어긋나면 아무 것도 싣지 않는다(잘못된 항목을 실패로 표시하게 만드느니 낫다).
 */
function correlationEcho(payload: unknown): {
  clientEventId?: string;
  expectedVersion?: number;
} {
  if (!isRecord(payload)) return {};
  const echo: { clientEventId?: string; expectedVersion?: number } = {};
  if (isNonemptyString(payload.clientEventId)) echo.clientEventId = payload.clientEventId;
  if (isSafeNonnegative(payload.expectedVersion)) echo.expectedVersion = payload.expectedVersion;
  return echo;
}

function parseGameEventCommand(payload: unknown): GameEventCommandPayload | null {
  if (
    !isPlainObjectWithKeys(payload, [
      'gameId',
      'expectedVersion',
      'clientEventId',
      'takeoverToken',
      'payloadHash',
      'event',
    ]) ||
    !isNonemptyString(payload.gameId) ||
    !isSafeNonnegative(payload.expectedVersion) ||
    !isNonemptyString(payload.clientEventId) ||
    !isNonemptyString(payload.takeoverToken) ||
    !isNonemptyString(payload.payloadHash)
  ) {
    return null;
  }
  const event = parseGameEvent(payload.event);
  return event === null
    ? null
    : {
        gameId: payload.gameId,
        expectedVersion: payload.expectedVersion,
        clientEventId: payload.clientEventId,
        takeoverToken: payload.takeoverToken,
        payloadHash: payload.payloadHash,
        event,
      };
}

function parseGameEventRetry(payload: unknown): GameEventRetryPayload | null {
  if (
    !isPlainObjectWithKeys(payload, [
      'gameId',
      'rebasedExpectedVersion',
      'clientEventId',
      'takeoverToken',
      'payloadHash',
      'event',
    ]) ||
    !isNonemptyString(payload.gameId) ||
    !isSafeNonnegative(payload.rebasedExpectedVersion) ||
    !isNonemptyString(payload.clientEventId) ||
    !isNonemptyString(payload.takeoverToken) ||
    !isNonemptyString(payload.payloadHash)
  ) {
    return null;
  }
  const event = parseGameEvent(payload.event);
  return event === null
    ? null
    : {
        gameId: payload.gameId,
        rebasedExpectedVersion: payload.rebasedExpectedVersion,
        clientEventId: payload.clientEventId,
        takeoverToken: payload.takeoverToken,
        payloadHash: payload.payloadHash,
        event,
      };
}

function parseGameTakeoverRequest(payload: unknown): GameTakeoverRequestPayload | null {
  if (
    !isPlainObjectWithKeys(payload, [
      'gameId',
      'authorizationSubjectVersion',
      'clientInstanceId',
      'lastSequence',
    ]) ||
    !isNonemptyString(payload.gameId) ||
    !isSafeNonnegative(payload.authorizationSubjectVersion) ||
    !isNonemptyString(payload.clientInstanceId) ||
    !isSafeNonnegative(payload.lastSequence)
  ) {
    return null;
  }
  return {
    gameId: payload.gameId,
    authorizationSubjectVersion: payload.authorizationSubjectVersion,
    clientInstanceId: payload.clientInstanceId,
    lastSequence: payload.lastSequence,
  };
}

function parseGameTakeoverRenew(payload: unknown): GameTakeoverRenewPayload | null {
  if (
    !isPlainObjectWithKeys(payload, ['gameId', 'takeoverToken', 'clientInstanceId']) ||
    !isNonemptyString(payload.gameId) ||
    !isNonemptyString(payload.takeoverToken) ||
    !isNonemptyString(payload.clientInstanceId)
  ) {
    return null;
  }
  return {
    gameId: payload.gameId,
    takeoverToken: payload.takeoverToken,
    clientInstanceId: payload.clientInstanceId,
  };
}

function parseGameEvent(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const requiredKeys = ['type', 'period', 'clockMs', 'occurredAt', 'payload'];
  const allowedKeys = [...requiredKeys, 'sideId', 'participantId', 'assistParticipantId'];
  if (
    !requiredKeys.every((key) => Object.hasOwn(payload, key)) ||
    !Object.keys(payload).every((key) => allowedKeys.includes(key)) ||
    !isNonemptyString(payload.type) ||
    !isSafePositive(payload.period) ||
    !isSafeNonnegative(payload.clockMs) ||
    !isNonemptyString(payload.occurredAt) ||
    !Number.isFinite(Date.parse(payload.occurredAt)) ||
    !isRecord(payload.payload) ||
    (payload.sideId !== undefined && !isNonemptyString(payload.sideId)) ||
    (payload.participantId !== undefined && !isNonemptyString(payload.participantId)) ||
    (payload.assistParticipantId !== undefined &&
      payload.assistParticipantId !== null &&
      !isNonemptyString(payload.assistParticipantId))
  ) {
    return null;
  }
  return payload;
}

function appendEventDto(input: GameEventCommandPayload): AppendGameEventDto {
  return plainToInstance(AppendGameEventDto, {
    expectedVersion: input.expectedVersion,
    clientEventId: input.clientEventId,
    takeoverToken: input.takeoverToken,
    ...input.event,
  });
}

function hasAuthenticatedSocketData(client: V1Socket): boolean {
  return (
    authenticatedSocketUser(client) !== null &&
    isNonemptyString(client.data.clientInstanceId) &&
    isSafeNonnegative(client.data.authorizationSubjectVersion)
  );
}

function authenticatedSocketUser(client: V1Socket): V1AuthUser | null {
  const userId = client.data.userId;
  const authUser = client.data.authUser;
  return userId !== undefined && authUser !== undefined && authUser.id === userId ? authUser : null;
}

function protocolError(
  error: unknown,
  input: GameEventCommandPayload | GameEventRetryPayload,
): Omit<Extract<GameProtocolResult, { status: 'error' }>, 'status'> {
  const expectedVersion =
    'expectedVersion' in input ? input.expectedVersion : input.rebasedExpectedVersion;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isRecord(response) && isNonemptyString(response.code)) {
      return {
        code: response.code,
        clientEventId: input.clientEventId,
        expectedVersion,
      };
    }
  }
  return {
    code: 'INTERNAL_ERROR',
    clientEventId: input.clientEventId,
    expectedVersion,
  };
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSafePositive(value: unknown): value is number {
  return isSafeNonnegative(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainObjectWithKeys(
  payload: unknown,
  allowedKeys: readonly string[],
): payload is Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const keys = Object.keys(payload);
  return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}
