import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getLoggerToken } from 'nestjs-pino';
import { GameBroadcastRegistry } from '../games/game-broadcast.registry';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';

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
  }): void;
};

function buildSocket(
  handshakeHeaders: Record<string, string> = {},
  handshakeAuth: Record<string, string> = {},
) {
  return {
    id: 'socket-1',
    handshake: {
      headers: handshakeHeaders,
      auth: {
        clientInstanceId: 'gateway-spec-client',
        authorizationSubjectVersion: 0,
        ...handshakeAuth,
      },
    },
    data: {},
    join: jest.fn(),
    leave: jest.fn(),
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

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  const prisma = {
    v1User: { findFirst: jest.fn() },
    v1Game: { findUnique: jest.fn() },
  };
  const gamesService = { listEvents: jest.fn() };
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
    gamesService.listEvents.mockResolvedValue({ events: [], lastSequence: 0 });
    delete process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentStaffAccessService, useValue: staffAccess },
        { provide: GamesService, useValue: gamesService },
        { provide: getLoggerToken(RealtimeGateway.name), useValue: logger },
        // 게이트웨이가 afterInit 에서 자신을 등록하는 룸 브로드캐스터. 이 스펙들은
        // 소켓 경로만 검증하므로 주입만 만족하면 된다(REST 경로 브로드캐스트는
        // games.controller.broadcast.spec.ts 가 따로 검증한다).
        { provide: GameBroadcastRegistry, useValue: { register: jest.fn(), emitToGame: jest.fn() } },
      ],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
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

    async function connectAuthenticatedSocket() {
      prisma.v1User.findFirst.mockResolvedValue(activeUser);
      const socket = buildSocket({}, { 'x-v1-user-id': activeUser.id });
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
      };
    }

    function resolveScopedGame() {
      prisma.v1Game.findUnique.mockResolvedValue(gameScopeRecord(GAME_SCOPE));
      staffAccess.assertAccess.mockResolvedValue(staffPrincipal(GAME_SCOPE));
    }

    function gameScopeRecord(scope: GameScope) {
      return {
        id: scope.gameId,
        state: 'LIVE',
        version: 4,
        lastSequence: 0,
        tournamentFixture: {
          id: scope.fixtureId,
          tournamentId: scope.tournamentId,
          fieldId: scope.fieldId,
        },
      };
    }

    function staffPrincipal(scope: GameScope) {
      return {
        userId: activeUser.id,
        role: 'field_operator',
        tournamentId: scope.tournamentId,
        fixtureId: scope.fixtureId,
        fieldOrCourtId: scope.fieldId,
        authorizationSubject: `assignment:${scope.gameId}@0`,
        assignmentId: `scope-${scope.gameId}`,
        assignmentVersion: 0,
      };
    }

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
      ).resolves.toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });

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
      gamesService.listEvents.mockResolvedValue({ events, lastSequence: 3 });

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
        .mockResolvedValueOnce({ events: [{ sequence: 2 }], lastSequence: 2 })
        .mockResolvedValueOnce({ events: [{ sequence: 3 }], lastSequence: 3 });
      const firstSocket = await connectAuthenticatedSocket();
      const reconnectSocket = await connectAuthenticatedSocket();

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
      expect(socket.join).not.toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
    });

    it('Task 8 authorizes team-match subscriptions through GamesService without staff scope', async () => {
      const socket = await connectAuthenticatedSocket();
      prisma.v1Game.findUnique.mockResolvedValue({
        id: GAME_SCOPE.gameId,
        state: 'SCHEDULED',
        version: 1,
        lastSequence: 0,
        tournamentFixture: null,
      });
      gamesService.listEvents.mockResolvedValue({ events: [], lastSequence: 0 });

      await expect(
        task8Gateway().subscribeToGame(socket, { gameId: GAME_SCOPE.gameId, afterSequence: 0 }),
      ).resolves.toMatchObject({ status: 'subscribed', room: `game:${GAME_SCOPE.gameId}` });

      expect(staffAccess.assertAccess).not.toHaveBeenCalled();
      expect(gamesService.listEvents).toHaveBeenCalledWith(activeUser, GAME_SCOPE.gameId, 0);
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

      task8Gateway().evictUserFromScopedGameRooms({
        userId: activeUser.id,
        tournamentId: GAME_SCOPE.tournamentId,
        assignmentVersion: 1,
      });

      expect(server.in).toHaveBeenCalledWith(`user:${activeUser.id}`);
      expect(server.socketsLeave).toHaveBeenCalledWith(`game:${GAME_SCOPE.gameId}`);
      expect(server.socketsLeave).not.toHaveBeenCalledWith(`game:${OTHER_GAME_SCOPE.gameId}`);
      expect(server.disconnectSockets).not.toHaveBeenCalled();
    });
  });
});
