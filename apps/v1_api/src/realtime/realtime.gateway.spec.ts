import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getLoggerToken } from 'nestjs-pino';
import { GameBroadcastRegistry } from '../games/game-broadcast.registry';
import { GameTakeoverService } from '../games/game-takeover.service';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';

type GameScope = {
  readonly gameId: string;
  readonly tournamentId: string;
  readonly fixtureId: string;
  readonly fieldId: string;
};

const GAME_SCOPE = {
  gameId: '60000000-0000-4000-8000-000000000001',
  tournamentId: '10000000-0000-4000-8000-000000000001',
  fixtureId: '40000000-0000-4000-8000-000000000001',
  fieldId: '50000000-0000-4000-8000-000000000001',
} as const;
const OTHER_GAME_SCOPE = {
  gameId: '60000000-0000-4000-8000-000000000002',
  tournamentId: '10000000-0000-4000-8000-000000000002',
  fixtureId: '40000000-0000-4000-8000-000000000002',
  fieldId: '50000000-0000-4000-8000-000000000002',
} as const;

type Task8SubscriptionResult =
  | {
      readonly status: 'subscribed';
      readonly room: string;
      readonly afterSequence: number;
      readonly snapshot: {
        readonly gameId: string;
        readonly version: number;
        readonly state: string;
        readonly lastSequence: number;
        readonly events: readonly unknown[];
      };
    }
  | { readonly status: 'unsubscribed'; readonly room: string }
  | { readonly status: 'denied'; readonly code: 'STAFF_SCOPE_DENIED' | 'VALIDATION_ERROR' };

type Task8RealtimeGatewayContract = {
  subscribeToGame(
    client: ReturnType<typeof buildSocket>,
    payload: unknown,
  ): Promise<Task8SubscriptionResult>;
  unsubscribeFromGame(
    client: ReturnType<typeof buildSocket>,
    payload: unknown,
  ): Promise<Task8SubscriptionResult>;
  evictUserFromScopedGameRooms(input: {
    readonly userId: string;
    readonly tournamentId: string;
    readonly assignmentVersion: number;
  }): Promise<void>;
  pingGameTime(client: ReturnType<typeof buildSocket>, payload: unknown): Promise<unknown>;
};

function buildSocket(
  handshakeHeaders: Record<string, string> = {},
  handshakeAuth: Record<string, string> = {},
  socketId = 'socket-1',
) {
  const rooms = new Set<string>();
  return {
    id: socketId,
    handshake: {
      headers: handshakeHeaders,
      auth: {
        clientInstanceId: 'gateway-spec-client',
        authorizationSubjectVersion: 0,
        ...handshakeAuth,
      },
    },
    data: {},
    rooms,
    join: jest.fn(async (room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn(async (room: string) => {
      rooms.delete(room);
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function handleConnection(
  gateway: RealtimeGateway,
  socket: ReturnType<typeof buildSocket>,
): Promise<void> {
  return Reflect.apply(gateway.handleConnection, gateway, [socket]);
}

function handleDisconnect(gateway: RealtimeGateway, socket: ReturnType<typeof buildSocket>): void {
  Reflect.apply(gateway.handleDisconnect, gateway, [socket]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let moduleRef: TestingModule;
  const prisma = {
    v1User: { findFirst: jest.fn() },
    v1Game: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
  const gamesService = { assertReadAccess: jest.fn(), listEvents: jest.fn() };
  const server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn().mockReturnThis(),
    socketsLeave: jest.fn(),
    disconnectSockets: jest.fn(),
  };
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const staffAccess = { assertAccess: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.v1User.findFirst.mockReset();
    prisma.v1Game.findUnique.mockReset();
    prisma.v1Game.findMany.mockReset().mockResolvedValue([]);
    gamesService.listEvents.mockReset().mockResolvedValue({ version: 4, state: 'LIVE', events: [], lastSequence: 0 });
    gamesService.assertReadAccess.mockReset().mockResolvedValue(undefined);
    staffAccess.assertAccess.mockReset();
    delete process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        // 핸드셰이크가 REST 와 같은 기준으로 약관 재동의를 본다. 이 스위트들의 관심사는
        // 약관이 아니므로 "동의 완료" 로 고정한 더블을 넣는다 — 재동의 차단 자체는
        // 전용 테스트가 따로 덮는다.
        { provide: ManagedTermsRuntimeService, useValue: { signupCompliance: async () => ({ compliant: true }) } },
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentStaffAccessService, useValue: staffAccess },
        { provide: GamesService, useValue: gamesService },
        { provide: getLoggerToken(RealtimeGateway.name), useValue: logger },
        // 게이트웨이가 afterInit 에서 자신을 등록하는 룸 브로드캐스터. 이 스펙들은
        // 소켓 경로만 검증하므로 주입만 만족하면 된다(REST 경로 브로드캐스트는
        // games.controller.broadcast.spec.ts 가 따로 검증한다).
        { provide: GameBroadcastRegistry, useValue: { register: jest.fn(), emitToGame: jest.fn() } },
        // 백로그 결함 수정(realtime-takeover-and-eviction-protocol): 게이트웨이가
        // renew 실패의 superseded/naturally-expired 여부를 직접 이 서비스로
        // 물어본다(games.gateway.task20-takeover.spec.ts가 그 분기를 검증한다).
        // 이 파일의 스펙들은 그 분기와 무관하므로 기본값(false = 자연 만료
        // 취급)만 만족하면 된다.
        { provide: GameTakeoverService, useValue: { isSuperseded: jest.fn().mockReturnValue(false) } },
      ],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.useRealTimers();
  });

  it('joins the user room on a handshake carrying the identity via the auth payload (the real client path)', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'active',
      onboardingStatus: 'completed',
    });
    // apps/v1_web/src/lib/v1-socket.ts sends the dev identity via socket.io's
    // `auth` option, not as a real HTTP header — this is the path that matters.
    const socket = buildSocket({}, { 'x-v1-user-id': 'user-1' });

    await handleConnection(gateway, socket);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('also accepts the identity via a real HTTP header, for any client that sends one', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'active',
      onboardingStatus: 'completed',
    });
    const socket = buildSocket({ 'x-v1-user-id': 'user-1' }, {});

    await handleConnection(gateway, socket);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket with no resolvable identity', async () => {
    const socket = buildSocket({}, {});

    await handleConnection(gateway, socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket for a suspended account', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'suspended',
      onboardingStatus: 'completed',
    });
    const socket = buildSocket({}, { 'x-v1-user-id': 'user-1' });

    await handleConnection(gateway, socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket for an account with pending social signup', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'active',
      onboardingStatus: 'social_profile_required',
    });
    const socket = buildSocket({}, { 'x-v1-user-id': 'user-1' });

    await handleConnection(gateway, socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects the socket and logs instead of crashing when the DB lookup rejects', async () => {
    const dbError = new Error('connection terminated unexpectedly');
    prisma.v1User.findFirst.mockRejectedValue(dbError);
    const socket = buildSocket({}, { 'x-v1-user-id': 'user-1' });

    // If handleConnection let the rejection propagate, this await would throw and
    // fail the test the same way it would crash the real Node process.
    await expect(handleConnection(gateway, socket)).resolves.toBeUndefined();

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ socketId: socket.id, err: dbError }),
      expect.any(String),
    );
  });

  it('emitToUser sends the event to that user room only', () => {
    gateway.emitToUser('user-1', 'notification:new', { id: 'notif-1' });

    expect(server.to).toHaveBeenCalledWith('user:user-1');
    expect(server.emit).toHaveBeenCalledWith('notification:new', { id: 'notif-1' });
  });

  it('forceDisconnectUser disconnects every socket in that user room only', () => {
    gateway.forceDisconnectUser('user-1');

    expect(server.in).toHaveBeenCalledWith('user:user-1');
    expect(server.disconnectSockets).toHaveBeenCalledWith(true);
  });

  describe('Task 8 authenticated game-room subscriptions', () => {
    const activeUser = {
      id: 'user-1',
      email: 'user-1@example.test',
      accountStatus: 'active',
      onboardingStatus: 'completed',
    } as const;

    async function connectAuthenticatedSocket(socketId = 'socket-1') {
      prisma.v1User.findFirst.mockResolvedValue(activeUser);
      const socket = buildSocket({}, { 'x-v1-user-id': activeUser.id }, socketId);
      await handleConnection(gateway, socket);
      return socket;
    }

    function task8Gateway(): Task8RealtimeGatewayContract {
      return {
        subscribeToGame: (client, payload) =>
          Reflect.apply(gateway.subscribeToGame, gateway, [client, payload]),
        unsubscribeFromGame: (client, payload) =>
          Reflect.apply(gateway.unsubscribeFromGame, gateway, [client, payload]),
        evictUserFromScopedGameRooms: (input) =>
          Reflect.apply(gateway.evictUserFromScopedGameRooms, gateway, [input]),
        pingGameTime: (client, payload) =>
          Reflect.apply(gateway.pingGameTime, gateway, [client, payload]),
      };
    }

    function resolveScopedGame() {
      prisma.v1Game.findUnique.mockResolvedValue(gameScopeRecord(GAME_SCOPE));
      // 하트비트 재검증은 구독 게임들의 픽스처 스코프를 한 번의 findMany 로 읽는다
      // (게임당 findUnique 를 돌리면 구독 수만큼 왕복이 늘어나서 바꿨다).
      prisma.v1Game.findMany.mockResolvedValue([
        gameScopeRecord(GAME_SCOPE),
        gameScopeRecord(OTHER_GAME_SCOPE),
      ]);
      staffAccess.assertAccess.mockResolvedValue(staffPrincipal(GAME_SCOPE));
    }

    function gameScopeRecord(scope: GameScope) {
      return canonicalGameScopeRecord(scope);
    }

    function canonicalGameScopeRecord(scope: GameScope) {
      return {
        id: scope.gameId,
        state: 'LIVE',
        version: 4,
        lastSequence: 0,
        teamMatch: {
          id: scope.fixtureId,
          tournamentId: scope.tournamentId,
          leagueId: null,
          fieldId: scope.fieldId,
          tournament: { kind: 'regular_tournament' },
          league: null,
          tournamentDetails: {
            teamMatchId: scope.fixtureId,
            tournamentId: scope.tournamentId,
          },
        },
      };
    }

    function leagueGameScopeRecord(scope: GameScope) {
      return {
        id: scope.gameId,
        state: 'LIVE',
        version: 4,
        lastSequence: 0,
        teamMatch: {
          id: scope.fixtureId,
          tournamentId: scope.tournamentId,
          leagueId: scope.tournamentId,
          fieldId: scope.fieldId,
          tournament: { kind: 'regular_league' },
          league: { kind: 'regular_league' },
          tournamentDetails: null,
        },
      };
    }

    function staffPrincipal(scope: GameScope, expiresAt: Date | null = null) {
      return {
        userId: activeUser.id,
        role: 'field_operator',
        tournamentId: scope.tournamentId,
        fixtureId: scope.fixtureId,
        fieldOrCourtId: scope.fieldId,
        authorizationSubject: `assignment:${scope.gameId}@0`,
        assignmentId: `scope-${scope.gameId}`,
        assignmentVersion: 0,
        expiresAt,
      };
    }

    it('removes an expired scoped socket without waiting for a heartbeat', async () => {
      jest.useFakeTimers();
      try {
        const socket = await connectAuthenticatedSocket();
        const expiresAt = new Date(Date.now() + 1_000);
        prisma.v1Game.findUnique
          .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE))
          .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE));
        staffAccess.assertAccess
          .mockResolvedValueOnce(staffPrincipal(GAME_SCOPE, expiresAt))
          .mockRejectedValueOnce(
            new ForbiddenException({ code: 'STAFF_SCOPE_DENIED', details: { reason: 'ASSIGNMENT_EXPIRED' } }),
          );

        await expect(
          task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
        ).resolves.toMatchObject({ status: 'subscribed' });
        await jest.advanceTimersByTimeAsync(1_100);

        expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
        expect(socket.emit).toHaveBeenCalledWith('game.permission.revoked', {
          gameId: GAME_SCOPE.gameId,
          assignmentVersion: null,
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not join a room when the authorization subject version is stale', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      staffAccess.assertAccess.mockResolvedValueOnce({
        ...staffPrincipal(GAME_SCOPE),
        assignmentVersion: 9,
        expiresAt: null,
      });

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toMatchObject({ status: 'denied', reason: 'AUTHORIZATION_SUBJECT_STALE' });
      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
      expect(gamesService.listEvents).not.toHaveBeenCalled();
    });

    it('keeps the active lease deadline while a replacement authorization is pending', async () => {
      jest.useFakeTimers();
      try {
        const socket = await connectAuthenticatedSocket();
        const expiresAt = new Date(Date.now() + 500);
        const pendingAuthorization = deferred<ReturnType<typeof staffPrincipal>>();
        prisma.v1Game.findUnique.mockResolvedValue(gameScopeRecord(GAME_SCOPE));
        const authorizationEntered = deferred<void>();
        staffAccess.assertAccess
          .mockResolvedValueOnce(staffPrincipal(GAME_SCOPE, expiresAt))
          .mockImplementation(() => {
            authorizationEntered.resolve();
            return pendingAuthorization.promise;
          });

        await task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
        const replacement = task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
        await authorizationEntered.promise;
        await jest.advanceTimersByTimeAsync(600);
        expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);

        pendingAuthorization.resolve(staffPrincipal(GAME_SCOPE, new Date(Date.now() - 1)));
        await expect(replacement).resolves.toMatchObject({ status: 'denied' });
      } finally {
        jest.useRealTimers();
      }
    });

    it('disconnecting during pending authorization invalidates the late join', async () => {
      const socket = await connectAuthenticatedSocket();
      const authorization = deferred<ReturnType<typeof staffPrincipal>>();
      const authorizationEntered = deferred<void>();
      prisma.v1Game.findUnique.mockResolvedValue(gameScopeRecord(GAME_SCOPE));
      staffAccess.assertAccess.mockImplementationOnce(() => {
        authorizationEntered.resolve();
        return authorization.promise;
      });
      const subscribing = task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });

      await authorizationEntered.promise;
      handleDisconnect(gateway, socket);
      authorization.resolve(staffPrincipal(GAME_SCOPE));

      await expect(subscribing).resolves.toMatchObject({ status: 'denied' });
      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
      expect(socket.join).not.toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
    });

    it('expiry during a pending backfill cannot resurrect the expired subscription', async () => {
      jest.useFakeTimers();
      try {
        const socket = await connectAuthenticatedSocket();
        const expiresAt = new Date(Date.now() + 500);
        const backfill = deferred<{ version: number; state: string; events: unknown[]; lastSequence: number }>();
        const backfillEntered = deferred<void>();
        prisma.v1Game.findUnique
          .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE))
          .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE));
        staffAccess.assertAccess
          .mockResolvedValueOnce(staffPrincipal(GAME_SCOPE, expiresAt))
          .mockRejectedValueOnce(new ForbiddenException({ code: 'STAFF_SCOPE_DENIED' }));
        gamesService.listEvents.mockImplementationOnce(() => {
          backfillEntered.resolve();
          return backfill.promise;
        });

        const subscribing = task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
        await backfillEntered.promise;
        await jest.advanceTimersByTimeAsync(600);
        backfill.resolve({ version: 4, state: 'LIVE', events: [], lastSequence: 0 });

        await expect(subscribing).resolves.toMatchObject({ status: 'denied' });
        expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
        expect(socket.emit).toHaveBeenCalledWith('game.permission.revoked', expect.anything());
      } finally {
        jest.useRealTimers();
      }
    });

    it.each(['resolve', 'reject'] as const)('does not let an older pending backfill %s leave a newer successful subscription', async (olderOutcome) => {
      const socket = await connectAuthenticatedSocket();
      const firstBackfill = deferred<{ version: number; state: string; events: unknown[]; lastSequence: number }>();
      const secondBackfill = deferred<{ version: number; state: string; events: unknown[]; lastSequence: number }>();
      const firstBackfillEntered = deferred<void>();
      const secondBackfillEntered = deferred<void>();
      prisma.v1Game.findUnique
        .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE))
        .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE));
      staffAccess.assertAccess
        .mockResolvedValueOnce(staffPrincipal(GAME_SCOPE))
        .mockResolvedValueOnce(staffPrincipal(GAME_SCOPE));
      gamesService.listEvents
        .mockImplementationOnce(() => {
          firstBackfillEntered.resolve();
          return firstBackfill.promise;
        })
        .mockImplementationOnce(() => {
          secondBackfillEntered.resolve();
          return secondBackfill.promise;
        });

      const first = task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
      await firstBackfillEntered.promise;
      const second = task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
      await secondBackfillEntered.promise;
      secondBackfill.resolve({ version: 5, state: 'LIVE', events: [{ sequence: 5 }], lastSequence: 5 });
      await expect(second).resolves.toMatchObject({ status: 'subscribed', snapshot: { version: 5 } });

      if (olderOutcome === 'resolve') {
        firstBackfill.resolve({ version: 4, state: 'LIVE', events: [{ sequence: 4 }], lastSequence: 4 });
      } else {
        firstBackfill.reject(new Error('older backfill interrupted'));
      }
      if (olderOutcome === 'resolve') {
        await expect(first).resolves.toMatchObject({ status: 'denied' });
      } else {
        await expect(first).rejects.toThrow('older backfill interrupted');
      }
      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(true);
      expect(socket.emit).toHaveBeenCalledWith('game.snapshot', expect.objectContaining({ version: 5 }));
    });

    it('Task 8 subscribes an authenticated, authorized user to the stable game room', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toEqual({
        status: 'subscribed',
        room: `game:${GAME_SCOPE.gameId}`,
        afterSequence: 0,
        snapshot: {
          gameId: GAME_SCOPE.gameId,
          version: 4,
          state: 'LIVE',
          lastSequence: 0,
          events: [],
        },
      });

      expect(staffAccess.assertAccess).toHaveBeenCalledWith({
        userId: activeUser.id,
        action: 'read',
        resource: {
          tournamentId: GAME_SCOPE.tournamentId,
          fixtureId: GAME_SCOPE.fixtureId,
          fieldId: GAME_SCOPE.fieldId,
        },
      });
      expect(gamesService.listEvents).toHaveBeenCalledWith(activeUser, GAME_SCOPE.gameId, 0);
      expect(socket.join.mock.calls).toEqual([
        [`user:${activeUser.id}`],
        [`game:${GAME_SCOPE.gameId}`],
      ]);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('Task 168 uses canonical TeamMatch details for subscription and heartbeat eviction', async () => {
      const socket = await connectAuthenticatedSocket();
      const canonical = canonicalGameScopeRecord(GAME_SCOPE);
      prisma.v1Game.findUnique.mockResolvedValue(canonical);
      prisma.v1Game.findMany.mockResolvedValue([canonical]);
      staffAccess.assertAccess.mockResolvedValue(staffPrincipal(GAME_SCOPE));

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toMatchObject({ status: 'subscribed', room: `game:${GAME_SCOPE.gameId}` });
      expect(staffAccess.assertAccess).toHaveBeenCalledWith({
        userId: activeUser.id,
        action: 'read',
        resource: {
          tournamentId: GAME_SCOPE.tournamentId,
          fixtureId: GAME_SCOPE.fixtureId,
          fieldId: GAME_SCOPE.fieldId,
        },
      });

      staffAccess.assertAccess.mockRejectedValueOnce(
        new ForbiddenException({ code: 'STAFF_SCOPE_DENIED', details: { reason: 'ASSIGNMENT_EXPIRED' } }),
      );
      await task8Gateway().pingGameTime(socket, { clientSentAt: Date.now() });
      expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.emit).toHaveBeenCalledWith('game.permission.revoked', {
        gameId: GAME_SCOPE.gameId,
        assignmentVersion: null,
      });
    });

    it('Task 168 keeps regular-league TeamMatch scopes in the revoke registry without bracket details', async () => {
      const socket = await connectAuthenticatedSocket();
      const leagueGame = leagueGameScopeRecord(GAME_SCOPE);
      prisma.v1Game.findUnique.mockResolvedValue(leagueGame);
      prisma.v1Game.findMany.mockResolvedValue([leagueGame]);
      staffAccess.assertAccess.mockResolvedValue(staffPrincipal(GAME_SCOPE));

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toMatchObject({ status: 'subscribed' });
      expect(staffAccess.assertAccess).toHaveBeenCalledWith({
        userId: activeUser.id,
        action: 'read',
        resource: {
          tournamentId: GAME_SCOPE.tournamentId,
          fixtureId: GAME_SCOPE.fixtureId,
          fieldId: GAME_SCOPE.fieldId,
        },
      });

      staffAccess.assertAccess.mockRejectedValueOnce(
        new ForbiddenException({ code: 'STAFF_SCOPE_DENIED', details: { reason: 'ASSIGNMENT_EXPIRED' } }),
      );
      await task8Gateway().pingGameTime(socket, { clientSentAt: Date.now() });
      expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.emit).toHaveBeenCalledWith('game.permission.revoked', {
        gameId: GAME_SCOPE.gameId,
        assignmentVersion: null,
      });
    });

    it('Task 168 fails closed when a non-league TeamMatch has competition IDs but no Details', async () => {
      const socket = await connectAuthenticatedSocket();
      const malformed = leagueGameScopeRecord(GAME_SCOPE);
      malformed.teamMatch.tournament = { kind: 'regular_tournament' };
      malformed.teamMatch.league = { kind: 'regular_tournament' };
      prisma.v1Game.findUnique.mockResolvedValue(malformed);

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
      expect(staffAccess.assertAccess).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);

      const detailsMalformed = {
        ...malformed,
        teamMatch: {
          ...malformed.teamMatch,
          tournament: { kind: 'regular_league' },
          league: { kind: 'regular_league' },
          tournamentDetails: {
            teamMatchId: GAME_SCOPE.fixtureId,
            tournamentId: GAME_SCOPE.tournamentId,
          },
        },
      };
      prisma.v1Game.findUnique.mockResolvedValue(detailsMalformed);
      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
      expect(staffAccess.assertAccess).not.toHaveBeenCalled();
    });

    it('Task 8 returns deterministic denial and never joins a game room without staff scope', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      staffAccess.assertAccess.mockRejectedValue(
        new ForbiddenException({
          code: 'STAFF_SCOPE_DENIED',
          message: 'Tournament staff scope is denied',
        }),
      );

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });

      expect(socket.join).toHaveBeenCalledWith(`user:${activeUser.id}`);
      expect(socket.join).not.toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('Task 8 denies a stale authorization-subject version before snapshot or room admission', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      staffAccess.assertAccess.mockResolvedValue({
        ...staffPrincipal(GAME_SCOPE),
        assignmentVersion: 1,
      });

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toEqual({
        status: 'denied',
        code: 'STAFF_SCOPE_DENIED',
        // **재접속하면 풀리는 원인** — 진짜 권한 거부와 구분돼야 화면이 재시도를 열 수 있다.
        reason: 'AUTHORIZATION_SUBJECT_STALE',
      });

      expect(gamesService.listEvents).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
    });

    it.each([
      ['missing gameId', { afterSequence: 0 }],
      ['empty gameId', { gameId: '', afterSequence: 0 }],
      ['negative afterSequence', { gameId: GAME_SCOPE.gameId, afterSequence: -1 }],
      ['fractional afterSequence', { gameId: GAME_SCOPE.gameId, afterSequence: 0.5 }],
      [
        'unsafe afterSequence',
        { gameId: GAME_SCOPE.gameId, afterSequence: Number.MAX_SAFE_INTEGER + 1 },
      ],
      [
        'socket-supplied identity',
        { gameId: GAME_SCOPE.gameId, afterSequence: 0, userId: 'spoofed' },
      ],
    ])('Task 8 rejects %s without joining or authorizing the game room', async (_label, payload) => {
      const socket = await connectAuthenticatedSocket();

      await expect(task8Gateway().subscribeToGame(socket, payload)).resolves.toEqual({
        status: 'denied',
        code: 'VALIDATION_ERROR',
      });

      expect(prisma.v1Game.findUnique).not.toHaveBeenCalled();
      expect(staffAccess.assertAccess).not.toHaveBeenCalled();
      expect(gamesService.listEvents).not.toHaveBeenCalled();
      expect(socket.join).toHaveBeenCalledWith(`user:${activeUser.id}`);
      expect(socket.join).not.toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
    });

    it('Task 8 returns the authoritative reconnect backfill in ascending sequence order', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      const events = [{ sequence: 2 }, { sequence: 3 }];
      gamesService.listEvents.mockResolvedValue({ version: 4, state: 'LIVE', events, lastSequence: 3 });

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 1 }),
      ).resolves.toMatchObject({
        status: 'subscribed',
        afterSequence: 1,
        snapshot: { lastSequence: 3, events },
      });
      expect(gamesService.listEvents).toHaveBeenCalledWith(activeUser, GAME_SCOPE.gameId, 1);
    });

    it('Task 8 reauthorizes after reconnect and resumes from the last contiguous sequence', async () => {
      resolveScopedGame();
      gamesService.listEvents
        .mockResolvedValueOnce({ version: 4, state: 'LIVE', events: [{ sequence: 2 }], lastSequence: 2 })
        .mockResolvedValueOnce({ version: 4, state: 'LIVE', events: [{ sequence: 3 }], lastSequence: 3 });
      const firstSocket = await connectAuthenticatedSocket();
      const reconnectSocket = await connectAuthenticatedSocket('socket-2');

      await task8Gateway().subscribeToGame(firstSocket, {
        gameId: GAME_SCOPE.gameId,
        afterSequence: 1,
      });
      handleDisconnect(gateway, firstSocket);
      await expect(
        task8Gateway().subscribeToGame(reconnectSocket, {
          gameId: GAME_SCOPE.gameId,
          afterSequence: 2,
        }),
      ).resolves.toMatchObject({
        status: 'subscribed',
        snapshot: { lastSequence: 3, events: [{ sequence: 3 }] },
      });

      expect(staffAccess.assertAccess).toHaveBeenCalledTimes(2);
      expect(gamesService.listEvents).toHaveBeenLastCalledWith(activeUser, GAME_SCOPE.gameId, 2);
    });

    it('Task 8 never joins when reconnect backfill is interrupted before acknowledgement', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      gamesService.listEvents.mockRejectedValue(new Error('backfill interrupted'));

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 2 }),
      ).rejects.toThrow('backfill interrupted');

      expect(socket.join).toHaveBeenCalledWith(`user:${activeUser.id}`);
      expect(socket.join).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
    });

    it('Task 8 authorizes team-match subscriptions through GamesService without staff scope', async () => {
      const socket = await connectAuthenticatedSocket();
      prisma.v1Game.findUnique.mockResolvedValue({
        id: GAME_SCOPE.gameId,
        state: 'SCHEDULED',
        version: 1,
        lastSequence: 0,
      });
      gamesService.listEvents.mockResolvedValue({ version: 1, state: 'SCHEDULED', events: [], lastSequence: 0 });

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toMatchObject({ status: 'subscribed', room: `game:${GAME_SCOPE.gameId}` });

      expect(staffAccess.assertAccess).not.toHaveBeenCalled();
      expect(gamesService.listEvents).toHaveBeenCalledWith(activeUser, GAME_SCOPE.gameId, 0);
    });

    it('does not join or snapshot a friendly game while its read authorization is pending or denied', async () => {
      const socket = await connectAuthenticatedSocket();
      const authorization = deferred<void>();
      const authorizationEntered = deferred<void>();
      prisma.v1Game.findUnique.mockResolvedValue({
        id: GAME_SCOPE.gameId,
        sourceType: 'TEAM_MATCH',
        state: 'LIVE',
        version: 1,
        lastSequence: 0,
        teamMatch: {
          id: GAME_SCOPE.fixtureId,
          tournamentId: null,
          leagueId: null,
          fieldId: null,
          tournament: null,
          league: null,
          tournamentDetails: null,
        },
      });
      gamesService.assertReadAccess.mockImplementationOnce(() => {
        authorizationEntered.resolve();
        return authorization.promise;
      });
      const subscribing = task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
      await authorizationEntered.promise;
      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
      authorization.reject(new ForbiddenException({ code: 'GAME_READ_DENIED' }));

      await expect(subscribing).resolves.toMatchObject({ status: 'denied' });
      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
      expect(gamesService.listEvents).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('game.snapshot', expect.anything());
    });

    it('leaves a room when admission completes after the lease deadline even if the expiry timer has not fired', async () => {
      jest.useFakeTimers();
      try {
        const socket = await connectAuthenticatedSocket();
        const joinEntered = deferred<void>();
        const joinCompletion = deferred<void>();
        const expiresAt = new Date(Date.now() + 1_000);
        prisma.v1Game.findUnique.mockResolvedValue(gameScopeRecord(GAME_SCOPE));
        staffAccess.assertAccess.mockResolvedValueOnce(staffPrincipal(GAME_SCOPE, expiresAt));
        socket.join.mockImplementation(async (room: string) => {
          socket.rooms.add(room);
          if (room === `game:${GAME_SCOPE.gameId}`) {
            joinEntered.resolve();
            await joinCompletion.promise;
          }
        });

        const subscribing = task8Gateway().subscribeToGame(socket, {
          gameId: GAME_SCOPE.gameId,
          afterSequence: 0,
        });
        await joinEntered.promise;
        jest.setSystemTime(expiresAt.getTime() + 1);
        joinCompletion.resolve();

        await expect(subscribing).resolves.toMatchObject({ status: 'denied' });
        expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
        expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
        expect(socket.emit).not.toHaveBeenCalledWith('game.snapshot', expect.anything());
      } finally {
        jest.useRealTimers();
      }
    });

    it('Task 8 leaves the exact stable game room when the authenticated user unsubscribes', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      expect(task8Gateway().unsubscribeFromGame).toEqual(expect.any(Function));
      await task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });

      await expect(
        task8Gateway().unsubscribeFromGame(socket, { gameId: GAME_SCOPE.gameId }),
      ).resolves.toEqual({ status: 'unsubscribed', room: `game:${GAME_SCOPE.gameId}` });

      expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('Task 8 evicts only matching game rooms through the server without disconnecting the user room', async () => {
      const socket = await connectAuthenticatedSocket();
      prisma.v1Game.findUnique
        .mockResolvedValueOnce(gameScopeRecord(GAME_SCOPE))
        .mockResolvedValueOnce(gameScopeRecord(OTHER_GAME_SCOPE));
      staffAccess.assertAccess
        .mockResolvedValueOnce(staffPrincipal(GAME_SCOPE))
        .mockResolvedValueOnce(staffPrincipal(OTHER_GAME_SCOPE));
      expect(task8Gateway().evictUserFromScopedGameRooms).toEqual(expect.any(Function));
      await task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
      await task8Gateway().subscribeToGame(socket, {
        gameId: OTHER_GAME_SCOPE.gameId,
        afterSequence: 0,
      });

      await task8Gateway().evictUserFromScopedGameRooms({
        userId: activeUser.id,
        tournamentId: GAME_SCOPE.tournamentId,
        assignmentVersion: 1,
      });

      expect(socket.rooms.has(`game:${GAME_SCOPE.gameId}`)).toBe(false);
      expect(socket.rooms.has(`game:${OTHER_GAME_SCOPE.gameId}`)).toBe(true);
      expect(socket.rooms.has(`user:${activeUser.id}`)).toBe(true);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    // T-staff-realtime-eviction: game.subscribe 는 최초 입장 시점에만
    // assertAccess 를 검사한다. 배정이 expiresAt 으로 만료돼도 이미 join 된
    // 소켓을 빼내는 코드가 없으면 만료 후에도 그 경기의 방송을 계속 받는다.
    // 클라이언트가 15초마다 보내는 game.time.ping 하트비트에 재검증이
    // 실제로 얹혀 있는지를 이 두 테스트가 증명한다.
    it('game.time.ping 하트비트가 만료로 거부된 배정을 감지해 그 게임 방에서만 소켓을 내보낸다', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      await task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
      expect(socket.join).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);

      staffAccess.assertAccess.mockRejectedValueOnce(
        new ForbiddenException({
          code: 'STAFF_SCOPE_DENIED',
          message: 'Tournament staff scope is denied',
          details: { reason: 'ASSIGNMENT_EXPIRED' },
        }),
      );

      await task8Gateway().pingGameTime(socket, { clientSentAt: Date.now() });

      expect(socket.leave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(socket.emit).toHaveBeenCalledWith('game.permission.revoked', {
        gameId: GAME_SCOPE.gameId,
        assignmentVersion: null,
      });
      // 재구독을 시도하면 방금 만료로 제거된 상태에서 다시 정상 판정을 받는지
      // 확인 — 내부 gameSubscriptions 맵에서도 실제로 지워졌다는 방증.
      staffAccess.assertAccess.mockResolvedValueOnce(staffPrincipal(GAME_SCOPE));
      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toMatchObject({ status: 'subscribed' });
    });

    it('game.time.ping 하트비트는 접근이 여전히 유효한 구독을 건드리지 않는다', async () => {
      const socket = await connectAuthenticatedSocket();
      resolveScopedGame();
      await task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 });
      socket.leave.mockClear();
      socket.emit.mockClear();

      await task8Gateway().pingGameTime(socket, { clientSentAt: Date.now() });

      expect(socket.leave).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('game.permission.revoked', expect.anything());
    });
  });
});
