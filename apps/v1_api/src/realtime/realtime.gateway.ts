import { ForbiddenException, HttpException, Inject, type OnModuleDestroy } from '@nestjs/common';
import type { TournamentStaffRuntimeDenialReason } from '../tournaments/staff/tournament-staff-access.service';
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
import type { V1CompetitionKind } from '@prisma/client';
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
 * Explicit expiresAt deadlines use server timers. This slower heartbeat pass is
 * retained as insurance for out-of-band assignment changes that do not publish a
 * revoke event; it is not the expiry enforcement clock.
 */
const STAFF_REVALIDATION_INTERVAL_MS = 60_000;
const MAX_STAFF_LEASE_TIMER_MS = 2_147_000_000;

type GameFixtureScope = {
  readonly tournamentId: string;
  readonly fixtureId: string;
  readonly teamMatchId?: string;
  readonly fieldId: string | null;
  readonly invalid?: boolean;
};

type GameBackfill = {
  readonly version: number;
  readonly state: string;
  readonly events: readonly unknown[];
  readonly lastSequence: number;
  readonly gap?: { readonly expectedSequence: number; readonly availableFrom: number } | null;
};

type StaffLease = {
  readonly generation: number;
  readonly userId: string;
  readonly gameId: string;
  readonly scope: GameFixtureScope;
  expiresAt: Date | null;
  state: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  timer: NodeJS.Timeout | undefined;
};

type StaffLeaseAttempt = {
  readonly generation: number;
  readonly userId: string;
  readonly gameId: string;
  readonly scope: GameFixtureScope;
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
  assertReadAccess(user: V1AuthUser, gameId: string): Promise<void>;
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
  | {
      readonly status: 'denied';
      readonly code: 'STAFF_SCOPE_DENIED' | 'VALIDATION_ERROR';
      readonly reason?: StaffDenialReason;
    };

/**
 * **`STAFF_SCOPE_DENIED` 하나에 구조적으로 다른 원인이 겹쳐 있었다.**
 *
 * 같은 코드가 ① 세션 미확립 ② 인가 주체 버전 불일치 ③ 정책 거부(배정 없음·범위 밖 …)
 * ④ 대상 없음(존재를 감추려 일부러 같은 코드로 낸다) 에 모두 쓰인다. 그래서 화면이
 * **재접속하면 풀리는 것**과 **진짜 권한 거부**를 구분하지 못했다 — 버전 불일치인데
 * "다시 시도" 버튼이 숨고, 문구는 버전 불일치 쪽 설명이라 진짜 거부에는 틀린 안내가 나갔다.
 *
 * **코드를 새로 만들지 않는다.** 소비처 둘이 코드로 분기하고 있어서(재시도 가능 목록 ·
 * 사용자 문구 매핑) 새 코드를 내면 **모르는 코드**로 떨어져 재시도 가능으로 오분류되고
 * 문구가 빠진다. 그래서 **`reason` 을 더한다(additive)** — 계약은 그대로다.
 *
 * REST 는 이미 원인을 구분해 보낸다(`details.reason`). ack 만 못 보내고 있었다.
 */
type StaffDenialReason =
  | TournamentStaffRuntimeDenialReason
  /** 인가 주체 버전이 어긋났다 — **재접속하면 풀린다.** 권한이 없어진 것이 아니다. */
  | 'AUTHORIZATION_SUBJECT_STALE'
  /** 소켓에 확립된 세션이 없다(또는 신원이 어긋났다). 재로그인·재연결이 답이다. */
  | 'SESSION_NOT_AUTHENTICATED';

/** 정책이 `ForbiddenException` 에 실어 보낸 원인. 형태가 다르면 `undefined` 로 둔다. */
function staffDenialReasonOf(error: unknown): TournamentStaffRuntimeDenialReason | undefined {
  if (!(error instanceof ForbiddenException)) return undefined;
  const response = error.getResponse();
  if (!isRecord(response)) return undefined;
  const details = response.details;
  if (!isRecord(details)) return undefined;
  const reason = details.reason;
  return typeof reason === 'string' ? (reason as TournamentStaffRuntimeDenialReason) : undefined;
}

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
      readonly reason?: StaffDenialReason;
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
      /**
       * 거부 원인. 큐가 재시도할지(재접속하면 풀린다) 포기할지(권한이 없다)를
       * 가르는 값이라, 구독·takeover ack 에만 실으면 정작 큐가 가장 자주 만나는
       * 이 경로에서 값을 못 받는다.
       */
      readonly reason?: StaffDenialReason;
      /** `VALIDATION_ERROR`에서만 채워진다. */
      readonly validation?: FieldValidationFailure;
    };

// main.ts computes this identically at bootstrap for the REST app's CORS —
// mirrored here so the WS gateway doesn't reflect-and-allow every origin in
// production while REST is locked to a single allow-listed FRONTEND_URL.
const isProduction = process.env.NODE_ENV === 'production';
const frontendOrigin = isProduction ? requireProductionFrontendOrigin(process.env.FRONTEND_URL) : null;

/**
 * `pingInterval`/`pingTimeout` 을 지정하지 않아 engine.io 기본값(**25s / 20s**)을 쓴다.
 *
 * **계산**: 클라이언트는 ping 을 받은 뒤 `pingInterval + pingTimeout` 타이머를 걸고 그
 * 안에 다음 ping 이 없으면 끊긴 것으로 본다 — 기본값에서 감지 지연의 **최악은 45초**다.
 * **관측**: 2026-09-08 alpha 에서 재연결까지 **26~32초**였다(연결이 주기 중간에 끊긴 경우라
 * 최악보다 짧다). 계산값과 관측값을 섞지 말 것.
 *
 * **재연결이 느린 게 아니라 끊긴 걸 늦게 아는 것이다** — 클라이언트에는 `reconnection*`
 * 옵션이 없어 재시도 간격이 최대 5초이므로(저장소 전체 grep 0건, `v1-socket.ts`·
 * `v1-game-operations-socket.ts`), 백오프만으로는 그 시간이 나오지 않는다. 지배항은 감지다.
 *
 * 값을 줄이면 감지는 빨라지지만 모든 연결의 하트비트 트래픽이 늘고, `pingTimeout` 을 함께
 * 조정하지 않으면 느린 네트워크의 멀쩡한 연결을 끊는다. 조정은 그 트레이드오프를 함께
 * 정할 때 한다 — 관측 당시 큐가 이벤트를 보관했다 배수해 **유실은 0** 이었다(정확성이 아니라
 * 체감 문제다).
 */
@WebSocketGateway({
  namespace: '/game-operations',
  cors: { origin: frontendOrigin ?? true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
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
  /** The last authorized lease. A new authorization attempt never shortens this lease. */
  private readonly staffLeases = new Map<string, Map<string, StaffLease>>();
  /** Authorization awaits live here until they atomically promote to `staffLeases`. */
  private readonly pendingStaffLeaseAttempts = new Map<string, Map<string, StaffLeaseAttempt>>();
  private readonly staffLeaseGenerations = new Map<string, Map<string, number>>();
  private readonly roomTransitions = new Map<string, Promise<void>>();
  /** Generation that currently owns the physical socket.io room membership. */
  private readonly staffRoomOwners = new Map<string, number>();
  private readonly socketClients = new Map<string, V1Socket>();
  private shuttingDown = false;

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
      if (this.shuttingDown || client.connected === false) {
        await client.leave(`user:${userId}`);
        return;
      }
      this.socketClients.set(client.id, client);
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
    this.socketClients.delete(client.id);
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
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'SESSION_NOT_AUTHENTICATED' };
    }

    const game = await this.prisma.v1Game.findUnique({
      where: { id: input.gameId },
      select: {
        id: true,
        state: true,
        version: true,
        lastSequence: true,
        teamMatch: {
          select: {
            id: true,
            tournamentId: true,
            leagueId: true,
            fieldId: true,
            tournament: { select: { kind: true } },
            league: { select: { kind: true } },
            tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
          },
        },
      },
    });
    if (game === null) {
      // **여기는 `reason` 을 일부러 비운다** — 대상이 없다는 사실 자체를 감추려고
      // 권한 거부와 같은 코드로 낸다. 원인을 붙이면 그 감춤이 무의미해진다.
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
    }

    const scope = gameRealtimeScope(game);
    let leaseGeneration: number | undefined;
    let leasePromoted = false;
    try {
      if (scope?.invalid === true) {
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
      }
      if (scope !== null) {
        // Reserve an attempt before the authorization await so revoke/disconnect can
        // invalidate it. The previously authorized lease and its deadline stay intact
        // until this attempt has a concrete principal and can be promoted atomically.
        leaseGeneration = this.reserveStaffLeaseAttempt(client, input.gameId, userId, scope);
        if (leaseGeneration === undefined) {
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'SESSION_NOT_AUTHENTICATED' };
        }
        const principal = await this.tournamentStaffAccess.assertAccess({
          userId,
          action: 'read',
          resource: {
            tournamentId: scope.tournamentId,
            fixtureId: scope.fixtureId,
            ...(scope.fieldId === null ? {} : { fieldId: scope.fieldId }),
          },
        });
        if (
          principal.assignmentVersion !== null &&
          client.data.authorizationSubjectVersion !== principal.assignmentVersion
        ) {
          // **재접속하면 풀린다** — 권한이 없어진 것이 아니다.
          await this.denyCurrentStaffAttempt(client, userId, input.gameId, leaseGeneration);
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'AUTHORIZATION_SUBJECT_STALE' };
        }
        if (principal.expiresAt !== null && principal.expiresAt.getTime() <= Date.now()) {
          await this.denyCurrentStaffAttempt(client, userId, input.gameId, leaseGeneration);
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'ASSIGNMENT_EXPIRED' };
        }
        if (
          !this.promoteStaffLeaseAttempt(
            client,
            input.gameId,
            leaseGeneration,
            principal.expiresAt ?? null,
          )
        ) {
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'ASSIGNMENT_REQUIRED' };
        }
        leasePromoted = true;
      }
      const room = gameRoom(input.gameId);
      if (scope === null) {
        leaseGeneration = this.reserveRoomGeneration(client, input.gameId);
        if (leaseGeneration === undefined) {
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'SESSION_NOT_AUTHENTICATED' };
        }
        await this.gamesService.assertReadAccess(authUser, input.gameId);
        if (!(await this.joinUnscopedGameRoom(client, input.gameId, leaseGeneration))) {
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
        }
      } else if (!(await this.joinAuthorizedGameRoom(client, input.gameId, leaseGeneration!))) {
        const cancelled = this.cancelAuthorizedLeaseIfGeneration(client.id, input.gameId, leaseGeneration!);
        if (cancelled) await this.leaveAuthorizedGameRoom(client, input.gameId, leaseGeneration!);
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'ASSIGNMENT_REQUIRED' };
      }
      const backfill = await this.gamesService.listEvents(authUser, input.gameId, input.afterSequence);
      if (scope !== null) {
        if (!this.activateStaffLease(client.id, input.gameId, leaseGeneration!)) {
          const cancelled = this.cancelAuthorizedLeaseIfGeneration(client.id, input.gameId, leaseGeneration!);
          if (cancelled || this.staffRoomOwners.get(this.roomTransitionKey(client.id, input.gameId)) === leaseGeneration) {
            await this.leaveAuthorizedGameRoom(client, input.gameId, leaseGeneration!);
          }
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'ASSIGNMENT_REQUIRED' };
        }
        this.recordGameSubscription(userId, scope.tournamentId, input.gameId, client.id);
      } else if (
        leaseGeneration === undefined ||
        !this.isRoomGenerationCurrent(client.id, input.gameId, leaseGeneration) ||
        this.staffRoomOwners.get(this.roomTransitionKey(client.id, input.gameId)) !== leaseGeneration
      ) {
        if (leaseGeneration !== undefined) {
          if (this.invalidateRoomGenerationIfCurrent(client.id, input.gameId, leaseGeneration)) {
            await this.forceLeaveGameRoom(client, input.gameId);
          } else {
            await this.leaveAuthorizedGameRoom(client, input.gameId, leaseGeneration);
          }
        }
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED' };
      }
      const snapshot = {
        gameId: input.gameId,
        version: backfill.version,
        state: backfill.state,
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
      let cleanupFailed = false;
      if (scope !== null) {
        if (leaseGeneration !== undefined) {
          const ownedAttempt = this.clearStaffLeaseAttempt(client.id, input.gameId, leaseGeneration);
          const cancelled = leasePromoted
            ? this.cancelAuthorizedLeaseIfGeneration(client.id, input.gameId, leaseGeneration)
            : false;
          if (cancelled) {
            try {
              await this.leaveAuthorizedGameRoom(client, input.gameId, leaseGeneration);
            } catch (leaveError) {
              this.logger.error(
                { socketId: client.id, gameId: input.gameId, err: leaveError },
                'Failed to leave failed game subscription',
              );
              client.disconnect(true);
              cleanupFailed = true;
            }
          } else if (ownedAttempt) {
            this.invalidateStaffAuthorization(client.id, input.gameId);
            this.removeGameSubscription(userId, input.gameId, client.id);
            try {
              await this.forceLeaveGameRoom(client, input.gameId);
            } catch (leaveError) {
              this.logger.error(
                { socketId: client.id, gameId: input.gameId, err: leaveError },
                'Failed to leave denied game subscription',
              );
              this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId: input.gameId });
              client.disconnect(true);
              cleanupFailed = true;
            }
          }
        }
      } else {
        if (leaseGeneration !== undefined) {
          try {
            if (this.invalidateRoomGenerationIfCurrent(client.id, input.gameId, leaseGeneration)) {
              await this.forceLeaveGameRoom(client, input.gameId);
            } else {
              await this.leaveAuthorizedGameRoom(client, input.gameId, leaseGeneration);
            }
          } catch (leaveError) {
            this.logger.error(
              { socketId: client.id, gameId: input.gameId, err: leaveError },
              'Failed to leave failed game subscription',
            );
            client.disconnect(true);
            cleanupFailed = true;
          }
        }
      }
      if (error instanceof ForbiddenException) {
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: staffDenialReasonOf(error) };
      }
      if (!cleanupFailed) {
        this.logger.error({ socketId: client.id, gameId: input.gameId, err: error }, 'Failed to subscribe to game room');
        this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId: input.gameId });
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
          reason: 'SESSION_NOT_AUTHENTICATED',
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
          reason: 'SESSION_NOT_AUTHENTICATED',
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
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'SESSION_NOT_AUTHENTICATED' };
    }
    // Mirrors game.subscribe's staleness gate: a connection whose cached
    // authorization-subject version no longer matches the version it is
    // presenting must re-establish its session rather than take over a game.
    if (client.data.authorizationSubjectVersion !== input.authorizationSubjectVersion) {
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'AUTHORIZATION_SUBJECT_STALE' };
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
        return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: staffDenialReasonOf(error) };
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
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'SESSION_NOT_AUTHENTICATED' };
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
          return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: staffDenialReasonOf(error) };
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
      return { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: 'SESSION_NOT_AUTHENTICATED' };
    }

    const room = gameRoom(input.gameId);
    this.invalidateStaffAuthorization(client.id, input.gameId);
    this.removeGameSubscription(userId, input.gameId, client.id);
    await this.forceLeaveGameRoom(client, input.gameId);
    return { status: 'unsubscribed', room };
  }

  async evictUserFromScopedGameRooms(input: {
    readonly userId: string;
    readonly tournamentId: string;
    readonly assignmentVersion: number;
  }): Promise<void> {
    const tournaments = this.gameSubscriptions.get(input.userId);
    const games = tournaments?.get(input.tournamentId);
    const gamesToEvict = new Map<string, Set<string>>();
    for (const [gameId, socketIds] of games ?? []) gamesToEvict.set(gameId, new Set(socketIds));
    // A pending authorization attempt may not have reached gameSubscriptions yet.
    // Include it so revoke invalidates the attempt before any asynchronous leave.
    for (const [socketId, attempts] of this.pendingStaffLeaseAttempts) {
      for (const [gameId, attempt] of attempts) {
        if (attempt.userId !== input.userId || attempt.scope.tournamentId !== input.tournamentId) continue;
        const socketIds = gamesToEvict.get(gameId) ?? new Set<string>();
        socketIds.add(socketId);
        gamesToEvict.set(gameId, socketIds);
      }
    }
    for (const [socketId, leases] of this.staffLeases) {
      for (const [gameId, lease] of leases) {
        if (lease.userId !== input.userId || lease.scope.tournamentId !== input.tournamentId) continue;
        const socketIds = gamesToEvict.get(gameId) ?? new Set<string>();
        socketIds.add(socketId);
        gamesToEvict.set(gameId, socketIds);
      }
    }
    if (gamesToEvict.size === 0) return;

    const pendingLeaves: Promise<void>[] = [];
    for (const [gameId, socketIds] of gamesToEvict) {
      for (const socketId of socketIds) {
        this.invalidateStaffAuthorization(socketId, gameId);
        const leave = this.forceLeaveSocketGame(socketId, gameId, () => {
          this.server.to(socketId).emit('game.permission.revoked', {
            gameId,
            assignmentVersion: input.assignmentVersion,
          });
        });
        pendingLeaves.push(leave.catch((error: unknown) => {
            this.logger.error({ socketId, gameId, err: error }, 'Failed to evict revoked staff socket');
            this.socketClients.get(socketId)?.disconnect(true);
          }));
      }
    }
    tournaments?.delete(input.tournamentId);
    if (tournaments?.size === 0) {
      this.gameSubscriptions.delete(input.userId);
    }
    await Promise.all(pendingLeaves);
  }

  private reserveStaffLeaseAttempt(
    client: V1Socket,
    gameId: string,
    userId: string,
    scope: GameFixtureScope,
  ): number | undefined {
    const generation = this.reserveRoomGeneration(client, gameId);
    if (generation === undefined) return undefined;
    const attempts = this.pendingStaffLeaseAttempts.get(client.id) ?? new Map<string, StaffLeaseAttempt>();
    attempts.set(gameId, { generation, userId, gameId, scope });
    this.pendingStaffLeaseAttempts.set(client.id, attempts);
    return generation;
  }

  private reserveRoomGeneration(client: V1Socket, gameId: string): number | undefined {
    if (!this.isSocketLive(client)) return undefined;
    const generations = this.staffLeaseGenerations.get(client.id) ?? new Map<string, number>();
    const generation = (generations.get(gameId) ?? 0) + 1;
    generations.set(gameId, generation);
    this.staffLeaseGenerations.set(client.id, generations);
    return generation;
  }

  private isSocketLive(client: V1Socket): boolean {
    return (
      !this.shuttingDown &&
      client.connected !== false &&
      this.socketClients.get(client.id) === client
    );
  }

  private isRoomGenerationCurrent(clientId: string, gameId: string, generation: number): boolean {
    return this.staffLeaseGenerations.get(clientId)?.get(gameId) === generation;
  }

  private invalidateRoomGenerationIfCurrent(clientId: string, gameId: string, generation: number): boolean {
    if (!this.isRoomGenerationCurrent(clientId, gameId, generation)) return false;
    this.invalidateStaffAuthorization(clientId, gameId);
    return true;
  }

  private clearStaffLeaseAttempt(clientId: string, gameId: string, generation: number): boolean {
    const attempts = this.pendingStaffLeaseAttempts.get(clientId);
    if (attempts?.get(gameId)?.generation !== generation) return false;
    attempts.delete(gameId);
    if (attempts.size === 0) this.pendingStaffLeaseAttempts.delete(clientId);
    return true;
  }

  private replaceStaffLeaseAttemptScope(
    clientId: string,
    gameId: string,
    generation: number,
    scope: GameFixtureScope,
  ): boolean {
    const attempts = this.pendingStaffLeaseAttempts.get(clientId);
    const attempt = attempts?.get(gameId);
    if (attempt?.generation !== generation) return false;
    attempts!.set(gameId, { ...attempt, scope });
    return true;
  }

  private promoteStaffLeaseAttempt(
    client: V1Socket,
    gameId: string,
    generation: number,
    expiresAt: Date | null,
  ): boolean {
    if (!this.isSocketLive(client)) return false;
    const attempts = this.pendingStaffLeaseAttempts.get(client.id);
    const attempt = attempts?.get(gameId);
    if (attempt?.generation !== generation) return false;
    if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
      this.clearStaffLeaseAttempt(client.id, gameId, generation);
      return false;
    }

    const leases = this.staffLeases.get(client.id) ?? new Map<string, StaffLease>();
    const previous = leases.get(gameId);
    if (previous?.timer !== undefined) clearTimeout(previous.timer);
    const lease: StaffLease = {
      generation,
      userId: attempt.userId,
      gameId,
      scope: attempt.scope,
      expiresAt,
      state: 'PENDING',
      timer: undefined,
    };
    leases.set(gameId, lease);
    this.staffLeases.set(client.id, leases);
    this.clearStaffLeaseAttempt(client.id, gameId, generation);
    if (previous !== undefined) {
      this.removeGameSubscription(previous.userId, gameId, client.id);
    }

    const roomKey = this.roomTransitionKey(client.id, gameId);
    if (previous !== undefined && this.staffRoomOwners.get(roomKey) === previous.generation) {
      this.staffRoomOwners.set(roomKey, generation);
    }
    if (expiresAt !== null) this.scheduleStaffLease(client, lease);
    return true;
  }

  private scheduleStaffLease(client: V1Socket, lease: StaffLease): void {
    if (lease.expiresAt === null) return;
    const remaining = lease.expiresAt.getTime() - Date.now();
    const delay = Math.max(0, Math.min(remaining, MAX_STAFF_LEASE_TIMER_MS));
    lease.timer = setTimeout(() => {
      if (lease.expiresAt !== null && lease.expiresAt.getTime() - Date.now() > 0) {
        this.scheduleStaffLease(client, lease);
        return;
      }
      void this.expireStaffLease(client, lease);
    }, delay);
    lease.timer.unref?.();
  }

  private isAuthorizedLeaseOwner(clientId: string, gameId: string, generation: number): boolean {
    return this.staffLeases.get(clientId)?.get(gameId)?.generation === generation;
  }

  private isAuthorizedLeaseAdmissible(clientId: string, gameId: string, generation: number): boolean {
    const lease = this.staffLeases.get(clientId)?.get(gameId);
    return (
      lease?.generation === generation &&
      lease.state !== 'SUSPENDED' &&
      (lease.expiresAt === null || lease.expiresAt.getTime() > Date.now())
    );
  }

  private activateStaffLease(clientId: string, gameId: string, generation: number): boolean {
    if (!this.isAuthorizedLeaseAdmissible(clientId, gameId, generation)) return false;
    if (this.staffRoomOwners.get(this.roomTransitionKey(clientId, gameId)) !== generation) return false;
    this.staffLeases.get(clientId)!.get(gameId)!.state = 'ACTIVE';
    return true;
  }

  private roomTransitionKey(socketId: string, gameId: string): string {
    return `${socketId}:${gameId}`;
  }

  private async transitionGameRoom(
    socketId: string,
    gameId: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const key = this.roomTransitionKey(socketId, gameId);
    const previous = this.roomTransitions.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.roomTransitions.set(key, current);
    try {
      await current;
    } finally {
      if (this.roomTransitions.get(key) === current) this.roomTransitions.delete(key);
    }
  }

  private async joinAuthorizedGameRoom(client: V1Socket, gameId: string, generation: number): Promise<boolean> {
    let admitted = false;
    await this.transitionGameRoom(client.id, gameId, async () => {
      if (!this.isSocketLive(client) || !this.isAuthorizedLeaseAdmissible(client.id, gameId, generation)) return;
      const key = this.roomTransitionKey(client.id, gameId);
      const previousOwner = this.staffRoomOwners.get(key);
      this.staffRoomOwners.set(key, generation);
      try {
        await client.join(gameRoom(gameId));
      } catch (error) {
        if (this.staffRoomOwners.get(key) === generation) {
          if (previousOwner === undefined) {
            try {
              await client.leave(gameRoom(gameId));
              this.staffRoomOwners.delete(key);
            } catch (leaveError) {
              this.logger.error(
                { socketId: client.id, gameId, err: leaveError },
                'Failed to roll back rejected staff room join',
              );
              client.disconnect(true);
              this.staffRoomOwners.delete(key);
              throw leaveError;
            }
          } else {
            this.staffRoomOwners.set(key, previousOwner);
          }
        }
        throw error;
      }
      if (!this.isSocketLive(client) || !this.isAuthorizedLeaseAdmissible(client.id, gameId, generation)) {
        if (this.staffRoomOwners.get(key) === generation) {
          await client.leave(gameRoom(gameId));
          this.staffRoomOwners.delete(key);
        }
        return;
      }
      admitted = true;
    });
    return admitted;
  }

  private async joinUnscopedGameRoom(client: V1Socket, gameId: string, generation: number): Promise<boolean> {
    let admitted = false;
    await this.transitionGameRoom(client.id, gameId, async () => {
      if (!this.isSocketLive(client) || !this.isRoomGenerationCurrent(client.id, gameId, generation)) return;
      const key = this.roomTransitionKey(client.id, gameId);
      const previousOwner = this.staffRoomOwners.get(key);
      this.staffRoomOwners.set(key, generation);
      try {
        await client.join(gameRoom(gameId));
      } catch (error) {
        if (this.staffRoomOwners.get(key) === generation) {
          if (previousOwner === undefined) {
            try {
              await client.leave(gameRoom(gameId));
              this.staffRoomOwners.delete(key);
            } catch (leaveError) {
              this.logger.error(
                { socketId: client.id, gameId, err: leaveError },
                'Failed to roll back rejected game room join',
              );
              client.disconnect(true);
              this.staffRoomOwners.delete(key);
              throw leaveError;
            }
          } else {
            this.staffRoomOwners.set(key, previousOwner);
          }
        }
        throw error;
      }
      if (!this.isSocketLive(client) || !this.isRoomGenerationCurrent(client.id, gameId, generation)) {
        if (this.staffRoomOwners.get(key) === generation) {
          await client.leave(gameRoom(gameId));
          this.staffRoomOwners.delete(key);
        }
        return;
      }
      admitted = true;
    });
    return admitted;
  }

  private async leaveAuthorizedGameRoom(client: V1Socket, gameId: string, generation: number): Promise<void> {
    const key = this.roomTransitionKey(client.id, gameId);
    await this.transitionGameRoom(client.id, gameId, async () => {
      if (this.staffRoomOwners.get(key) !== generation) return;
      await client.leave(gameRoom(gameId));
      if (this.staffRoomOwners.get(key) === generation) this.staffRoomOwners.delete(key);
    });
  }

  private async forceLeaveGameRoom(client: V1Socket, gameId: string, afterLeave?: () => void): Promise<void> {
    const key = this.roomTransitionKey(client.id, gameId);
    await this.transitionGameRoom(client.id, gameId, async () => {
      await client.leave(gameRoom(gameId));
      this.staffRoomOwners.delete(key);
      afterLeave?.();
    });
  }

  private async forceLeaveSocketGame(socketId: string, gameId: string, afterLeave?: () => void): Promise<void> {
    const client = this.socketClients.get(socketId);
    if (client !== undefined) {
      await this.forceLeaveGameRoom(client, gameId, afterLeave);
      return;
    }
    const key = this.roomTransitionKey(socketId, gameId);
    await this.transitionGameRoom(socketId, gameId, async () => {
      this.server.in(socketId).socketsLeave(gameRoom(gameId));
      this.staffRoomOwners.delete(key);
      afterLeave?.();
    });
  }

  private refreshAuthorizedLeaseExpiry(
    client: V1Socket,
    gameId: string,
    generation: number,
    expiresAt: Date | null,
  ): boolean {
    if (!this.isAuthorizedLeaseAdmissible(client.id, gameId, generation)) return false;
    if (expiresAt !== null && expiresAt.getTime() <= Date.now()) return false;
    const lease = this.staffLeases.get(client.id)!.get(gameId)!;
    if (lease.timer !== undefined) clearTimeout(lease.timer);
    lease.expiresAt = expiresAt;
    if (expiresAt !== null) this.scheduleStaffLease(client, lease);
    return true;
  }

  private cancelAuthorizedLeaseIfGeneration(clientId: string, gameId: string, generation: number): boolean {
    const leases = this.staffLeases.get(clientId);
    const lease = leases?.get(gameId);
    if (lease?.generation !== generation) return false;
    if (lease.timer !== undefined) clearTimeout(lease.timer);
    leases?.delete(gameId);
    if (leases?.size === 0) this.staffLeases.delete(clientId);
    this.removeGameSubscription(lease.userId, gameId, clientId);
    return true;
  }

  private invalidateStaffAuthorization(clientId: string, gameId: string): StaffLease | undefined {
    const generations = this.staffLeaseGenerations.get(clientId) ?? new Map<string, number>();
    generations.set(gameId, (generations.get(gameId) ?? 0) + 1);
    this.staffLeaseGenerations.set(clientId, generations);

    const attempts = this.pendingStaffLeaseAttempts.get(clientId);
    attempts?.delete(gameId);
    if (attempts?.size === 0) this.pendingStaffLeaseAttempts.delete(clientId);

    const leases = this.staffLeases.get(clientId);
    const lease = leases?.get(gameId);
    if (lease?.timer !== undefined) clearTimeout(lease.timer);
    if (lease !== undefined) lease.state = 'SUSPENDED';
    leases?.delete(gameId);
    if (leases?.size === 0) this.staffLeases.delete(clientId);
    return lease;
  }

  private invalidateAuthorizedLeaseIfGeneration(clientId: string, gameId: string, generation: number): StaffLease | undefined {
    if (!this.isAuthorizedLeaseOwner(clientId, gameId, generation)) return undefined;
    return this.invalidateStaffAuthorization(clientId, gameId);
  }

  private async expireStaffLease(client: V1Socket, scheduledLease: StaffLease): Promise<void> {
    const lease = this.staffLeases.get(client.id)?.get(scheduledLease.gameId);
    if (lease?.generation !== scheduledLease.generation || lease.expiresAt === null) return;
    if (lease.expiresAt.getTime() > Date.now()) {
      this.scheduleStaffLease(client, lease);
      return;
    }

    const expiredLease = this.invalidateAuthorizedLeaseIfGeneration(client.id, lease.gameId, lease.generation);
    if (expiredLease === undefined) return;
    const rejoinGeneration = this.reserveStaffLeaseAttempt(
      client,
      expiredLease.gameId,
      expiredLease.userId,
      expiredLease.scope,
    );
    if (rejoinGeneration === undefined) return;
    this.removeGameSubscription(expiredLease.userId, expiredLease.gameId, client.id);
    try {
      await this.forceLeaveGameRoom(client, expiredLease.gameId);
    } catch (error) {
      this.clearStaffLeaseAttempt(client.id, expiredLease.gameId, rejoinGeneration);
      this.logger.error(
        { socketId: client.id, gameId: expiredLease.gameId, err: error },
        'Failed to leave expired staff room',
      );
      this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId: expiredLease.gameId });
      client.disconnect(true);
      return;
    }

    if (
      this.pendingStaffLeaseAttempts.get(client.id)?.get(expiredLease.gameId)?.generation !== rejoinGeneration
    ) {
      return;
    }

    let promoted = false;
    try {
      const game = await this.loadGameForStaffLease(expiredLease.gameId);
      if (game === null) {
        if (this.clearStaffLeaseAttempt(client.id, expiredLease.gameId, rejoinGeneration)) {
          client.emit('game.permission.revoked', { gameId: expiredLease.gameId, assignmentVersion: null });
        }
        return;
      }
      const scope = gameRealtimeScope(game);
      if (
        scope === null ||
        scope.invalid === true ||
        !this.replaceStaffLeaseAttemptScope(client.id, expiredLease.gameId, rejoinGeneration, scope)
      ) {
        if (this.clearStaffLeaseAttempt(client.id, expiredLease.gameId, rejoinGeneration)) {
          client.emit('game.permission.revoked', { gameId: expiredLease.gameId, assignmentVersion: null });
        }
        return;
      }
      const principal = await this.tournamentStaffAccess.assertAccess({
        userId: expiredLease.userId,
        action: 'read',
        resource: {
          tournamentId: scope.tournamentId,
          fixtureId: scope.fixtureId,
          ...(scope.fieldId === null ? {} : { fieldId: scope.fieldId }),
        },
      });
      if (!this.matchesAuthorizationVersion(client, principal.assignmentVersion)) {
        if (this.clearStaffLeaseAttempt(client.id, expiredLease.gameId, rejoinGeneration)) {
          client.emit('game.permission.revoked', {
            gameId: expiredLease.gameId,
            assignmentVersion: principal.assignmentVersion,
          });
        }
        return;
      }
      if (principal.expiresAt !== null && principal.expiresAt.getTime() <= Date.now()) {
        if (this.clearStaffLeaseAttempt(client.id, expiredLease.gameId, rejoinGeneration)) {
          client.emit('game.permission.revoked', {
            gameId: expiredLease.gameId,
            assignmentVersion: principal.assignmentVersion,
          });
        }
        return;
      }
      if (
        !this.promoteStaffLeaseAttempt(
          client,
          expiredLease.gameId,
          rejoinGeneration,
          principal.expiresAt ?? null,
        )
      ) {
        return;
      }
      promoted = true;
      if (!(await this.joinAuthorizedGameRoom(client, expiredLease.gameId, rejoinGeneration))) return;
      const backfill = await this.gamesService.listEvents(client.data.authUser!, expiredLease.gameId, 0);
      if (!this.activateStaffLease(client.id, expiredLease.gameId, rejoinGeneration)) {
        const cancelled = this.cancelAuthorizedLeaseIfGeneration(client.id, expiredLease.gameId, rejoinGeneration);
        if (cancelled) await this.leaveAuthorizedGameRoom(client, expiredLease.gameId, rejoinGeneration);
        return;
      }
      this.recordGameSubscription(expiredLease.userId, scope.tournamentId, expiredLease.gameId, client.id);
      client.emit('game.snapshot', {
        gameId: expiredLease.gameId,
        version: backfill.version,
        state: backfill.state,
        lastSequence: backfill.lastSequence,
        events: backfill.events,
      });
      if (backfill.gap !== undefined && backfill.gap !== null) client.emit('game.gap', backfill.gap);
    } catch (error) {
      const ownedAttempt = this.clearStaffLeaseAttempt(client.id, expiredLease.gameId, rejoinGeneration);
      const cancelled = promoted
        ? this.cancelAuthorizedLeaseIfGeneration(client.id, expiredLease.gameId, rejoinGeneration)
        : false;
      if (cancelled) {
        try {
          await this.leaveAuthorizedGameRoom(client, expiredLease.gameId, rejoinGeneration);
        } catch (leaveError) {
          this.logger.error(
            { socketId: client.id, gameId: expiredLease.gameId, err: leaveError },
            'Failed to leave failed staff rejoin room',
          );
          client.disconnect(true);
        }
      }
      if (!ownedAttempt && !cancelled) return;
      if (error instanceof ForbiddenException) {
        client.emit('game.permission.revoked', { gameId: expiredLease.gameId, assignmentVersion: null });
        return;
      }
      this.logger.error(
        { socketId: client.id, gameId: expiredLease.gameId, err: error },
        'Failed to revalidate expired staff lease',
      );
      this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId: expiredLease.gameId });
      client.disconnect(true);
    }
  }

  private async revokeAuthorizedLease(
    client: V1Socket,
    userId: string,
    gameId: string,
    generation: number,
    afterLeave?: () => void,
  ): Promise<'stale' | 'left' | 'leave_failed'> {
    const invalidated = this.invalidateAuthorizedLeaseIfGeneration(client.id, gameId, generation);
    if (invalidated === undefined) return 'stale';
    this.removeGameSubscription(userId, gameId, client.id);
    try {
      await this.forceLeaveGameRoom(client, gameId, afterLeave);
      return 'left';
    } catch (error) {
      this.logger.error({ socketId: client.id, gameId, err: error }, 'Failed to leave revoked staff room');
      this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId });
      client.disconnect(true);
      return 'leave_failed';
    }
  }

  private async denyCurrentStaffAttempt(
    client: V1Socket,
    userId: string,
    gameId: string,
    generation: number,
  ): Promise<boolean> {
    if (!this.clearStaffLeaseAttempt(client.id, gameId, generation)) return false;
    this.invalidateStaffAuthorization(client.id, gameId);
    this.removeGameSubscription(userId, gameId, client.id);
    try {
      await this.forceLeaveGameRoom(client, gameId);
    } catch (error) {
      this.logger.error({ socketId: client.id, gameId, err: error }, 'Failed to leave denied staff room');
      this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId });
      client.disconnect(true);
    }
    return true;
  }

  private sameStaffScope(left: GameFixtureScope, right: GameFixtureScope): boolean {
    return (
      left.tournamentId === right.tournamentId &&
      left.fixtureId === right.fixtureId &&
      left.teamMatchId === right.teamMatchId &&
      left.fieldId === right.fieldId &&
      left.invalid === right.invalid
    );
  }

  private matchesAuthorizationVersion(client: V1Socket, assignmentVersion: number | null): boolean {
    return assignmentVersion === null || client.data.authorizationSubjectVersion === assignmentVersion;
  }

  private async loadGameForStaffLease(gameId: string): Promise<{
    readonly id: string;
    readonly state: string;
    readonly version: number;
    readonly lastSequence: number;
    readonly teamMatch: GameRealtimeScopeRecord['teamMatch'];
  } | null> {
    return this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        state: true,
        version: true,
        lastSequence: true,
        teamMatch: {
          select: {
            id: true,
            tournamentId: true,
            leagueId: true,
            fieldId: true,
            tournament: { select: { kind: true } },
            league: { select: { kind: true } },
            tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
          },
        },
      },
    });
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
    // 한 번의 findMany 로 canonical/legacy tournament scope를 모두 읽어 온다.
    const scopes = await this.loadGameFixtureScopes(subscribedGameIds);

    for (const gameId of subscribedGameIds) {
      const leaseAtStart = this.staffLeases.get(client.id)?.get(gameId);
      if (leaseAtStart === undefined || leaseAtStart.state !== 'ACTIVE') continue;
      const leaseGeneration = leaseAtStart.generation;
      const scope = scopes.get(gameId) ?? null;
      if (scope === null || scope.invalid === true || !this.sameStaffScope(leaseAtStart.scope, scope)) {
        await this.revokeAuthorizedLease(client, userId, gameId, leaseGeneration, () => {
          client.emit('game.permission.revoked', { gameId, assignmentVersion: null });
        });
        continue;
      }
      try {
        const principal = await this.tournamentStaffAccess.assertAccess({
          userId,
          action: 'read',
          resource: {
            tournamentId: scope.tournamentId,
            fixtureId: scope.fixtureId,
            ...(scope.fieldId === null ? {} : { fieldId: scope.fieldId }),
          },
        });
        if (!this.isAuthorizedLeaseAdmissible(client.id, gameId, leaseGeneration)) continue;
        if (!this.matchesAuthorizationVersion(client, principal.assignmentVersion)) {
          await this.revokeAuthorizedLease(client, userId, gameId, leaseGeneration, () => {
            client.emit('game.permission.revoked', { gameId, assignmentVersion: principal.assignmentVersion });
          });
          continue;
        }
        if (principal.expiresAt !== null && principal.expiresAt.getTime() <= Date.now()) {
          await this.revokeAuthorizedLease(client, userId, gameId, leaseGeneration, () => {
            client.emit('game.permission.revoked', { gameId, assignmentVersion: principal.assignmentVersion });
          });
          continue;
        }
        if (leaseAtStart.expiresAt?.getTime() !== (principal.expiresAt?.getTime() ?? null)) {
          this.refreshAuthorizedLeaseExpiry(client, gameId, leaseGeneration, principal.expiresAt ?? null);
        }
      } catch (error) {
        if (!(error instanceof ForbiddenException)) {
          await this.revokeAuthorizedLease(client, userId, gameId, leaseGeneration, () => {
            this.logger.error({ socketId: client.id, gameId, err: error }, 'Failed to revalidate staff subscription');
            this.emitProtocolError(client, { code: 'INTERNAL_ERROR' }, { gameId });
          });
          continue;
        }
        await this.revokeAuthorizedLease(client, userId, gameId, leaseGeneration, () => {
          client.emit('game.permission.revoked', { gameId, assignmentVersion: null });
        });
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
        teamMatch: {
          select: {
            id: true,
            tournamentId: true,
            leagueId: true,
            fieldId: true,
            tournament: { select: { kind: true } },
            league: { select: { kind: true } },
            tournamentDetails: { select: { teamMatchId: true, tournamentId: true } },
          },
        },
      },
    });
    const scopes = new Map<string, GameFixtureScope>();
    for (const game of games) {
      const scope = gameRealtimeScope(game);
      if (scope === null) {
        continue;
      }
      scopes.set(game.id, scope);
    }
    return scopes;
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

  onModuleDestroy(): void {
    this.shuttingDown = true;
    for (const leases of this.staffLeases.values()) {
      for (const lease of leases.values()) {
        if (lease.timer !== undefined) clearTimeout(lease.timer);
      }
    }
    this.staffLeases.clear();
    this.pendingStaffLeaseAttempts.clear();
    this.staffLeaseGenerations.clear();
    this.staffRoomOwners.clear();
    this.socketClients.clear();
    this.gameSubscriptions.clear();
    this.roomTransitions.clear();
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
    if (tournaments !== undefined) {
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

    const leases = this.staffLeases.get(socketId);
    if (leases !== undefined) {
      for (const lease of leases.values()) {
        if (lease.timer !== undefined) clearTimeout(lease.timer);
      }
    }
    this.staffLeases.delete(socketId);
    this.pendingStaffLeaseAttempts.delete(socketId);
    this.staffLeaseGenerations.delete(socketId);
    for (const key of this.staffRoomOwners.keys()) {
      if (key.startsWith(`${socketId}:`)) this.staffRoomOwners.delete(key);
    }
  }
}

function toSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

type GameRealtimeScopeRecord = {
  readonly teamMatch: {
    readonly id: string;
    readonly tournamentId: string | null;
    readonly leagueId: string | null;
    readonly fieldId: string | null;
    readonly tournament: { readonly kind: V1CompetitionKind | null } | null;
    readonly league: { readonly kind: V1CompetitionKind | null } | null;
    readonly tournamentDetails: { readonly teamMatchId: string; readonly tournamentId: string } | null;
  } | null;
};

function gameRealtimeScope(game: GameRealtimeScopeRecord): GameFixtureScope | null {
  const teamMatch = game.teamMatch;
  const competitionId = teamMatch?.tournamentId ?? teamMatch?.leagueId ?? null;
  const isRegularLeague =
    teamMatch?.tournament?.kind === 'regular_league' || teamMatch?.league?.kind === 'regular_league';
  if (
    teamMatch !== null &&
    teamMatch !== undefined &&
    teamMatch.tournamentId !== null &&
    teamMatch.leagueId !== null &&
    teamMatch.tournamentId !== teamMatch.leagueId
  ) {
    return {
      tournamentId: teamMatch.tournamentId,
      fixtureId: teamMatch.id,
      teamMatchId: teamMatch.id,
      fieldId: teamMatch.fieldId,
      invalid: true,
    };
  }
  if (teamMatch?.tournamentDetails !== null && teamMatch?.tournamentDetails !== undefined) {
    const details = teamMatch.tournamentDetails;
    if (
      competitionId === null ||
      isRegularLeague ||
      details.teamMatchId !== teamMatch.id ||
      details.tournamentId !== competitionId
    ) {
      return {
        tournamentId: details.tournamentId,
        fixtureId: teamMatch.id,
        teamMatchId: teamMatch.id,
        fieldId: teamMatch.fieldId,
        invalid: true,
      };
    }
    return {
      tournamentId: competitionId,
      fixtureId: teamMatch.id,
      teamMatchId: teamMatch.id,
      fieldId: teamMatch.fieldId,
    };
  }

  if (teamMatch !== null && teamMatch !== undefined && competitionId !== null && isRegularLeague) {
    return { tournamentId: competitionId, fixtureId: teamMatch.id, teamMatchId: teamMatch.id, fieldId: teamMatch.fieldId };
  }

  if (teamMatch !== null && teamMatch !== undefined && competitionId !== null) {
    return { tournamentId: competitionId, fixtureId: teamMatch.id, teamMatchId: teamMatch.id, fieldId: teamMatch.fieldId, invalid: true };
  }

  return null;
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
