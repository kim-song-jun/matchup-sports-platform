import { ForbiddenException, HttpException, Inject } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
import { GameBroadcastRegistry } from '../games/game-broadcast.registry';
import { GameTakeoverService } from '../games/game-takeover.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { GamesService } from '../games/games.service';
import type { GameEventAppendResult } from '../games/games.types';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';

type V1Socket = Socket & {
  data: {
    userId?: string;
    authUser?: V1AuthUser;
    clientInstanceId?: string;
    authorizationSubjectVersion?: number;
    lastStaffRevalidationAt?: number;
  };
};

/**
 * 하트비트(15초)마다 재검증하면 구독 게임 수 × 동시 소켓 수만큼 DB 조회가 반복된다
 * (게임당 fixture 조회 1 + assertAccess 내부 조회 2). 만료된 스태프를 쫓아내는 데
 * 15초 해상도가 필요한 것은 아니므로 소켓당 재검증을 60초로 묶는다 — 하트비트가
 * 만드는 DB 부하가 1/4로 줄어든다.
 *
 * **"최대 60초"는 클라이언트가 계속 핑을 보낼 때만 성립한다.** 핑을 멈춘(또는 멈추게
 * 만든) 소켓은 이 재검증에 닿지 않아 만료 뒤에도 방송을 계속 받는다 — 이 저장소에는
 * cron 인프라가 없어 서버가 스스로 도는 스윕을 붙일 수 없다는 것이 그 이유이고,
 * 여기 적힌 보증은 그만큼만 유효하다. 다만 **쓰기는 별개로 안전하다**: 커맨드는
 * 매번 games.service 의 resolveActor 가 현재 DB 상태로 권한을 다시 판정하므로,
 * 만료된 스태프가 핑을 멈춘 채 이벤트를 기록할 수는 없다. 즉 남는 위험은
 * "이미 열려 있던 콘솔이 라이브 데이터를 계속 본다" 하나다.
 */
const STAFF_REVALIDATION_INTERVAL_MS = 60_000;

type GameFixtureScope = {
  readonly tournamentId: string;
  readonly fixtureId: string;
  readonly fieldId: string | null;
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
  | {
      readonly status: 'denied';
      readonly code:
        | 'STAFF_SCOPE_DENIED'
        | 'TAKEOVER_TOKEN_EXPIRED'
        // Backlog fix (realtime-takeover-and-eviction-protocol): renew-only.
        // See `renewGameTakeover` for when this is returned instead of
        // `TAKEOVER_TOKEN_EXPIRED`, and `GameTakeoverService.isSuperseded`
        // for why the two must not be conflated.
        | 'TAKEOVER_SUPERSEDED'
        | 'VALIDATION_ERROR';
    };

/**
 * UX 감사 추가(alpha 실사고, 2026-08): 옐로카드/파울 기록이 `VALIDATION_ERROR`로
 * 거부됐는데 로그·클라이언트 응답 어디에도 "어느 필드가 왜" 틀렸는지가 없어
 * 원인을 확정할 수 없었다(`docker logs`에는 `code`/`clientEventId`뿐). 이 타입은
 * 그 진단을 필드 "이름"만으로 싣는다 — 선수명 등 실제 값은 절대 담지 않는다
 * (`actorId`를 해시해서만 로그에 남기는 이 파일의 기존 관례와 동일한 이유).
 */
type FieldValidationFailure = {
  readonly missingKeys: readonly string[];
  readonly unknownKeys: readonly string[];
  readonly invalidFields: readonly string[];
};

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
      /** `VALIDATION_ERROR`에서만 채워진다. */
      readonly validation?: FieldValidationFailure;
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
    private readonly gameBroadcast: GameBroadcastRegistry,
    private readonly gameTakeover: GameTakeoverService,
    private readonly managedTerms: ManagedTermsRuntimeService,
  ) {}

  private readonly gameSubscriptions = new Map<
    string,
    Map<string, Map<string, Set<string>>>
  >();

  afterInit(server: Server): void {
    // Hand the games lane a way to reach this namespace's rooms without
    // GamesModule importing RealtimeModule (which would close the module graph
    // into a cycle — RealtimeModule already imports GamesModule). See
    // games/game-broadcast.registry.ts for why the binding is runtime rather
    // than a Nest injection token.
    this.gameBroadcast.register({
      emitToGame: (gameId, event, payload) => {
        server.to(gameRoom(gameId)).emit(event, payload);
      },
    });

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
    // REST 는 새 필수 약관 미동의 사용자를 (약관 화면 외) 전 경로에서 막는다
    // (v1-auth.guard.ts, TERMS_RECONSENT_REQUIRED). 이 소켓은 읽기 전용이 아니라
    // game.event.append 같은 **쓰기 커맨드**를 받으므로, 여기서 막지 않으면 재동의
    // 강제가 REST 에만 걸리고 실시간 경로로 그대로 우회된다. 계정 상태·온보딩과
    // 같은 자리에서 같은 기준으로 본다.
    const compliance = await this.managedTerms.signupCompliance(user.id);
    if (!compliance.compliant) {
      throw new Error('SOCKET_TERMS_RECONSENT_REQUIRED');
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
      // alpha 실사고 조사에서 clientEventId 없는 VALIDATION_ERROR 3건이 연달아
      // 찍힌 걸 봤다 — 이 핑 경로가 같은 코드로 거부되는 경로일 가능성이
      // 있다고 지목됐다(그렇다면 시계 오프셋 동기화가 끊긴다). 확정하지 못한
      // 채로 남겨두지 않고 여기도 같은 진단을 남긴다.
      return this.emitProtocolError(client, { code: 'VALIDATION_ERROR', validation: diagnoseClockPing(payload) });
    }
    const pong = {
      clientSentAt: payload.clientSentAt,
      serverReceivedAt,
      serverSentAt: Date.now(),
    };
    client.emit('game.time.pong', pong);
    // 감사 발견(T-staff-realtime-eviction): game.subscribe 는 최초 입장 시점에만
    // assertAccess 를 부른다. 그 뒤 배정이 expiresAt 으로 만료돼도 이미 join 된
    // 소켓을 빼내는 코드가 없어서(축출은 revokeStaff → evictUserFromScopedGameRooms
    // 경로 하나뿐) 만료된 스태프가 이미 열어 둔 콘솔 탭으로 방송을 계속 받는다.
    // 이 레포엔 cron 인프라(@nestjs/schedule)가 없어(team-contacts.service.ts
    // settleExpiry 주석 참고) 배치 스윕 대신, 콘솔이 15초마다 이미 보내는
    // 이 하트비트에 재검증을 얹는다(lazy-flip 패턴).
    try {
      await this.revalidateStaffAccessForSocket(client);
    } catch (error) {
      this.logger.error(
        { socketId: client.id, err: error },
        'Failed to revalidate staff access on clock heartbeat',
      );
    }
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
        validation: diagnoseGameEventCommand(payload),
        ...correlationEcho(payload),
      });
    }
    const authUser = authenticatedSocketUser(client);
    if (authUser === null) {
      return this.emitProtocolError(
        client,
        {
          code: 'STAFF_SCOPE_DENIED',
          clientEventId: input.clientEventId,
          expectedVersion: input.expectedVersion,
        },
        { gameId: input.gameId },
      );
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
      return this.emitProtocolError(client, protocolError(error, input), {
        gameId: input.gameId,
        actorId: authUser.id,
      });
    }
  }

  @SubscribeMessage('game.event.retry')
  async retryGameEvent(
    @ConnectedSocket() client: V1Socket,
    @MessageBody() payload: unknown,
  ): Promise<GameProtocolResult> {
    const input = parseGameEventRetry(payload);
    if (input === null) {
      return this.emitProtocolError(client, {
        code: 'VALIDATION_ERROR',
        validation: diagnoseGameEventRetry(payload),
        ...correlationEcho(payload),
      });
    }
    const authUser = authenticatedSocketUser(client);
    if (authUser === null) {
      return this.emitProtocolError(
        client,
        {
          code: 'STAFF_SCOPE_DENIED',
          clientEventId: input.clientEventId,
          expectedVersion: input.rebasedExpectedVersion,
        },
        { gameId: input.gameId },
      );
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
      return this.emitProtocolError(
        client,
        {
          ...protocolError(error, input),
          expectedVersion: input.rebasedExpectedVersion,
        },
        { gameId: input.gameId, actorId: authUser.id },
      );
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
        if (isRecord(response) && response.code === 'PERMISSION_DENIED') {
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
        }
        // `GamesService.renewTakeover` always throws `TAKEOVER_TOKEN_EXPIRED`
        // here regardless of WHY the underlying `GameTakeoverService.renew`
        // returned null -- it cannot tell "someone/something else now holds a
        // still-live grant for this game" (superseded) apart from "nothing
        // holds it, my own token just lapsed" (naturally expired). Only the
        // first case is a real handoff the client must respect; blindly
        // auto-reacquiring on it is exactly what makes two consoles (two
        // operators, or one operator with two tabs) fight over the token
        // forever at the ~20s renew cadence. Disambiguate here using the
        // registry directly (this gateway is where the client-facing code is
        // decided) so the client can tell the two apart without either
        // `GamesService` or the wire contract changing for the common case.
        const code = this.gameTakeover.isSuperseded(input.gameId, input.takeoverToken)
          ? 'TAKEOVER_SUPERSEDED'
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

  /**
   * `game.time.ping` 하트비트(15초 주기, use-v1-game-operations-console.ts)에서
   * 호출된다. 이 소켓이 현재 구독 중인 게임들에 대해 스태프 접근을 다시 판정해,
   * `game.subscribe` 이후 expiresAt 이 지났거나 배정 자체가 사라진 경우 그
   * 게임 방에서만 이 소켓을 내보낸다 — `evictUserFromScopedGameRooms`(revoke
   * 경로)처럼 그 유저의 tournamentId 전체를 통째로 비우지 않는다: 재판정
   * 대상은 "지금 이 소켓이 실제로 붙어 있는 게임들"뿐이라 범위가 이미
   * 정확하고, 같은 유저의 다른 유효한 배정까지 건드릴 이유가 없다.
   */
  private async revalidateStaffAccessForSocket(client: V1Socket): Promise<void> {
    const userId = client.data.userId;
    if (userId === undefined) {
      return;
    }
    const tournaments = this.gameSubscriptions.get(userId);
    if (tournaments === undefined) {
      return;
    }
    const subscribedGameIds: string[] = [];
    for (const games of tournaments.values()) {
      for (const [gameId, socketIds] of games) {
        if (socketIds.has(client.id)) {
          subscribedGameIds.push(gameId);
        }
      }
    }
    if (subscribedGameIds.length === 0) {
      return;
    }

    const now = Date.now();
    const lastAt = client.data.lastStaffRevalidationAt;
    if (lastAt !== undefined && now - lastAt < STAFF_REVALIDATION_INTERVAL_MS) {
      return;
    }
    client.data.lastStaffRevalidationAt = now;

    // 게임마다 findUnique 를 돌리면 구독 수만큼 왕복이 늘어난다(N+1).
    // 한 번의 findMany 로 픽스처 스코프를 모두 읽어 온다.
    const scopes = await this.loadGameFixtureScopes(subscribedGameIds);

    for (const gameId of subscribedGameIds) {
      const scope = scopes.get(gameId) ?? null;
      if (scope === null) {
        // 픽스처가 없는 게임(team-match 등)은 애초에 스태프 스코프 검사 없이
        // 구독됐다 — game.subscribe 의 `if (fixture !== null)` 분기와 동일 기준.
        continue;
      }
      try {
        await this.tournamentStaffAccess.assertAccess({
          userId,
          action: 'read',
          resource: {
            tournamentId: scope.tournamentId,
            fixtureId: scope.fixtureId,
            ...(scope.fieldId === null ? {} : { fieldId: scope.fieldId }),
          },
        });
      } catch (error) {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
        await client.leave(gameRoom(gameId));
        this.removeGameSubscription(userId, gameId, client.id);
        client.emit('game.permission.revoked', { gameId, assignmentVersion: null });
      }
    }
  }

  private async loadGameFixtureScopes(
    gameIds: readonly string[],
  ): Promise<ReadonlyMap<string, GameFixtureScope>> {
    const games = await this.prisma.v1Game.findMany({
      where: { id: { in: [...gameIds] } },
      select: {
        id: true,
        tournamentFixture: { select: { id: true, tournamentId: true, fieldId: true } },
      },
    });
    const scopes = new Map<string, GameFixtureScope>();
    for (const game of games) {
      const fixture = game.tournamentFixture;
      if (fixture === null) {
        continue;
      }
      scopes.set(game.id, {
        tournamentId: fixture.tournamentId,
        fixtureId: fixture.id,
        fieldId: fixture.fieldId,
      });
    }
    return scopes;
  }

  private async loadGameFixtureScope(gameId: string): Promise<{
    readonly tournamentId: string;
    readonly fixtureId: string;
    readonly fieldId: string | null;
  } | null> {
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: {
        tournamentFixture: { select: { id: true, tournamentId: true, fieldId: true } },
      },
    });
    const fixture = game?.tournamentFixture ?? null;
    if (fixture === null) {
      return null;
    }
    return { tournamentId: fixture.tournamentId, fixtureId: fixture.id, fieldId: fixture.fieldId };
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
    // Root-cause fix (2026-08 ops-console realtime scoreboard bug): broadcast
    // the FULL persisted event (`result.event`, real `id` + `reversesEventId:
    // null` + ...) instead of the raw, un-persisted request `event` param.
    // See `GameEventAppendResult.event`'s doc comment (games.types.ts) for
    // the full failure chain this caused. `result.event` falls back to the
    // raw param only for an idempotent replay of a request stored before
    // this field existed — the frontend's sequence-based de-dup already
    // discards replayed broadcasts, so a raw-shaped fallback there is inert,
    // never a live scoreboard input.
    const committed = {
      gameId,
      sequence: result.sequence,
      version: result.version,
      event: result.event ?? event,
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

  /**
   * Single choke point for every `game.event.append`/`game.event.retry`
   * rejection (validation failure, auth denial, domain error, unexpected
   * exception). Before this, none of these ever reached the PinoLogger the
   * gateway already has injected — a rejected command left zero trace
   * anywhere (client saw a generic banner, server logs stayed silent, and
   * the failed command's own DB write was rolled back by `withCommand`'s
   * transaction) — so an operator-visible failure could never be diagnosed
   * after the fact. This must stay failure-only: the ack path
   * (`acknowledgeGameEvent`) does not log, and must not start to.
   *
   * `context.actorId` is hashed (never logged raw) to match this repo's
   * existing PII-masking convention for user identifiers in logs (see
   * `admin-ops.service.ts`'s `userIdHash`).
   */
  private emitProtocolError(
    client: V1Socket,
    error: Omit<Extract<GameProtocolResult, { status: 'error' }>, 'status'>,
    context?: { readonly gameId?: string; readonly actorId?: string },
  ): Extract<GameProtocolResult, { status: 'error' }> {
    const payload = { status: 'error' as const, ...error };
    const logPayload = {
      code: error.code,
      clientEventId: error.clientEventId,
      gameId: context?.gameId,
      actorIdHash: context?.actorId === undefined ? undefined : hashForLog(context.actorId),
      // alpha 실사고: 필드 이름만(값은 절대 포함 안 함) — 이게 없어서 VALIDATION_ERROR의
      // 실제 원인을 로그만으로는 확정할 수 없었다.
      validation: error.validation,
    };
    if (error.code === 'INTERNAL_ERROR') {
      this.logger.error(logPayload, 'Rejected a game operations command');
    } else {
      this.logger.warn(logPayload, 'Rejected a game operations command');
    }
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
  // Copilot 리뷰: `game.event.append`의 파싱 실패 payload는 `expectedVersion`
  // 필드를 쓰지만, `game.event.retry`의 파싱 실패 payload는 같은 자리를
  // `rebasedExpectedVersion`으로 부른다(`protocolError()`의 성공 경로가 이미
  // 같은 매핑을 한다 — `'expectedVersion' in input ? ... : input.
  // rebasedExpectedVersion`). 이 폴백이 없으면 retry 파싱 실패에서는 버전
  // 상관관계 정보가 통째로 빠져 클라이언트/로그가 어떤 큐 항목이 실패했는지
  // 더 부정확하게 추적한다.
  if (isSafeNonnegative(payload.expectedVersion)) {
    echo.expectedVersion = payload.expectedVersion;
  } else if (isSafeNonnegative(payload.rebasedExpectedVersion)) {
    echo.expectedVersion = payload.rebasedExpectedVersion;
  }
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

const GAME_EVENT_COMMAND_KEYS = [
  'gameId',
  'expectedVersion',
  'clientEventId',
  'takeoverToken',
  'payloadHash',
  'event',
] as const;
const GAME_EVENT_RETRY_KEYS = [
  'gameId',
  'rebasedExpectedVersion',
  'clientEventId',
  'takeoverToken',
  'payloadHash',
  'event',
] as const;

/**
 * `parseGameEventCommand`/`parseGameEventRetry`가 null을 돌려준 뒤에만 호출되는
 * 진단 전용 경로 — 어느 필드가 missing/unknown/invalid인지 "이름"만 만든다(값은
 * 절대 포함하지 않는다). 두 envelope은 버전 필드 이름(`expectedVersion` vs
 * `rebasedExpectedVersion`)만 다르므로 하나의 함수를 공유한다.
 */
function diagnoseGameEventEnvelope(
  payload: unknown,
  requiredKeys: readonly string[],
): FieldValidationFailure {
  if (!isRecord(payload)) {
    return { missingKeys: [], unknownKeys: [], invalidFields: ['(payload는 object가 아님)'] };
  }
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(payload, key));
  const unknownKeys = Object.keys(payload).filter((key) => !requiredKeys.includes(key));
  const invalidFields: string[] = [];
  if (Object.hasOwn(payload, 'gameId') && !isNonemptyString(payload.gameId)) {
    invalidFields.push('gameId');
  }
  const versionKey = requiredKeys.includes('expectedVersion') ? 'expectedVersion' : 'rebasedExpectedVersion';
  if (Object.hasOwn(payload, versionKey) && !isSafeNonnegative(payload[versionKey])) {
    invalidFields.push(versionKey);
  }
  if (Object.hasOwn(payload, 'clientEventId') && !isNonemptyString(payload.clientEventId)) {
    invalidFields.push('clientEventId');
  }
  if (Object.hasOwn(payload, 'takeoverToken') && !isNonemptyString(payload.takeoverToken)) {
    invalidFields.push('takeoverToken');
  }
  if (Object.hasOwn(payload, 'payloadHash') && !isNonemptyString(payload.payloadHash)) {
    invalidFields.push('payloadHash');
  }
  if (Object.hasOwn(payload, 'event')) {
    const nested = diagnoseGameEvent(payload.event);
    return {
      missingKeys: [...missingKeys, ...nested.missingKeys.map((key) => `event.${key}`)],
      unknownKeys: [...unknownKeys, ...nested.unknownKeys.map((key) => `event.${key}`)],
      invalidFields: [...invalidFields, ...nested.invalidFields.map((key) => `event.${key}`)],
    };
  }
  return { missingKeys, unknownKeys, invalidFields };
}

function diagnoseGameEventCommand(payload: unknown): FieldValidationFailure {
  return diagnoseGameEventEnvelope(payload, GAME_EVENT_COMMAND_KEYS);
}

function diagnoseGameEventRetry(payload: unknown): FieldValidationFailure {
  return diagnoseGameEventEnvelope(payload, GAME_EVENT_RETRY_KEYS);
}

/** `parseGameEvent`의 진단 전용 짝 — 같은 규칙(requiredKeys/allowedKeys)을
 * 그대로 미러링하되 첫 위반에서 멈추지 않고 전부 모은다. */
function diagnoseGameEvent(payload: unknown): FieldValidationFailure {
  if (!isRecord(payload)) {
    return { missingKeys: [], unknownKeys: [], invalidFields: ['(event은 object가 아님)'] };
  }
  const requiredKeys = ['type', 'period', 'clockMs', 'occurredAt', 'payload'];
  const allowedKeys = [...requiredKeys, 'sideId', 'participantId', 'assistParticipantId'];
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(payload, key));
  const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.includes(key));
  const invalidFields: string[] = [];
  if (Object.hasOwn(payload, 'type') && !isNonemptyString(payload.type)) invalidFields.push('type');
  if (Object.hasOwn(payload, 'period') && !isSafePositive(payload.period)) invalidFields.push('period');
  if (Object.hasOwn(payload, 'clockMs') && !isSafeNonnegative(payload.clockMs)) invalidFields.push('clockMs');
  if (
    Object.hasOwn(payload, 'occurredAt') &&
    (!isNonemptyString(payload.occurredAt) || !Number.isFinite(Date.parse(payload.occurredAt as string)))
  ) {
    invalidFields.push('occurredAt');
  }
  if (Object.hasOwn(payload, 'payload') && !isRecord(payload.payload)) invalidFields.push('payload');
  if (payload.sideId !== undefined && !isNonemptyString(payload.sideId)) invalidFields.push('sideId');
  if (payload.participantId !== undefined && !isNonemptyString(payload.participantId)) {
    invalidFields.push('participantId');
  }
  if (
    payload.assistParticipantId !== undefined &&
    payload.assistParticipantId !== null &&
    !isNonemptyString(payload.assistParticipantId)
  ) {
    invalidFields.push('assistParticipantId');
  }
  return { missingKeys, unknownKeys, invalidFields };
}

/** `pingGameTime`의 진단 전용 짝 — payload가 단일 필드라 별도 envelope 헬퍼 없이
 * 직접 만든다. */
function diagnoseClockPing(payload: unknown): FieldValidationFailure {
  if (!isRecord(payload)) {
    return { missingKeys: [], unknownKeys: [], invalidFields: ['(payload는 object가 아님)'] };
  }
  const requiredKeys = ['clientSentAt'];
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(payload, key));
  const unknownKeys = Object.keys(payload).filter((key) => !requiredKeys.includes(key));
  const invalidFields =
    Object.hasOwn(payload, 'clientSentAt') && !isSafeNonnegative(payload.clientSentAt) ? ['clientSentAt'] : [];
  return { missingKeys, unknownKeys, invalidFields };
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

// Same short-sha256 masking convention `admin-ops.service.ts` uses for
// `userIdHash` — logs must correlate an actor across events without ever
// printing a raw user id.
function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
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
