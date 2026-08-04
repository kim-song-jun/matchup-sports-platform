import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { getLoggerToken } from 'nestjs-pino';
import {
  createV1SessionToken,
  resolveV1RequestIdentity,
  V1_SESSION_COOKIE_NAME,
} from '../auth/v1-session';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';

const SESSION_SECRET = 'task-8-session-secret-at-least-32-bytes';
const GAME_ID = '60000000-0000-4000-8000-000000000008';
const USER = {
  id: 'user-task-8',
  email: 'task-8@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
} as const;

type TestSocketUser = {
  readonly id: string;
  readonly email: string;
  readonly accountStatus: 'active';
  readonly onboardingStatus: 'completed';
};

type SocketAdapter = {
  readonly id: string;
  readonly handshake: { readonly headers: Record<string, string>; readonly auth: Record<string, string> };
  readonly data: {
    userId?: string;
    authUser?: TestSocketUser;
    authorizationSubjectVersion?: number;
  };
  readonly join: jest.Mock<Promise<void>, [string]>;
  readonly leave: jest.Mock<Promise<void>, [string]>;
  readonly emit: jest.Mock<void, [string, unknown]>;
  readonly disconnect: jest.Mock<void, [boolean]>;
};

type SubscriptionResult = {
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
};

type Task8ProtocolGateway = {
  subscribeToGame(client: SocketAdapter, payload: unknown): Promise<SubscriptionResult | unknown>;
  handleConnection(client: SocketAdapter): Promise<void>;
  pingGameTime(client: SocketAdapter, payload: unknown): Promise<unknown>;
  appendGameEvent(client: SocketAdapter, payload: unknown): Promise<unknown>;
  retryGameEvent(client: SocketAdapter, payload: unknown): Promise<unknown>;
  evictUserFromScopedGameRooms(input: {
    readonly userId: string;
    readonly tournamentId: string;
    readonly assignmentVersion: number;
  }): void;
};

function socket(overrides: Partial<SocketAdapter> = {}): SocketAdapter {
  return {
    id: 'socket-task-8',
    handshake: { headers: {}, auth: {} },
    data: { userId: USER.id, authUser: USER },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

function task8Gateway(gateway: RealtimeGateway): Task8ProtocolGateway {
  return {
    subscribeToGame: (client, payload) =>
      Reflect.apply(gateway.subscribeToGame, gateway, [client, payload]),
    handleConnection: (client) => Reflect.apply(gateway.handleConnection, gateway, [client]),
    pingGameTime: (client, payload) =>
      Reflect.apply(gateway.pingGameTime, gateway, [client, payload]),
    appendGameEvent: (client, payload) =>
      Reflect.apply(gateway.appendGameEvent, gateway, [client, payload]),
    retryGameEvent: (client, payload) =>
      Reflect.apply(gateway.retryGameEvent, gateway, [client, payload]),
    evictUserFromScopedGameRooms: (input) =>
      Reflect.apply(gateway.evictUserFromScopedGameRooms, gateway, [input]),
  };
}

describe('Task 8 game-operations realtime protocol', () => {
  let gateway: RealtimeGateway;
  const prisma = {
    v1Game: { findUnique: jest.fn() },
    v1User: { findFirst: jest.fn() },
  };
  const gamesService = {
    listEvents: jest.fn(),
    appendEvent: jest.fn(),
    retryEvent: jest.fn(),
  };
  const staffAccess = { assertAccess: jest.fn() };
  const logger = { debug: jest.fn(), error: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.v1Game.findUnique.mockResolvedValue({
      id: GAME_ID,
      state: 'LIVE',
      version: 4,
      lastSequence: 3,
      tournamentFixture: null,
    });
    gamesService.listEvents.mockResolvedValue({ events: [], lastSequence: 3, gap: null });
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentStaffAccessService, useValue: staffAccess },
        { provide: GamesService, useValue: gamesService },
        { provide: getLoggerToken(RealtimeGateway.name), useValue: logger },
      ],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
  });

  it('Task 8 PIN rejects a forged production identity header without a valid HMAC session and preserves local identity compatibility', () => {
    const forged = {
      headers: {},
      header: (name: string) => (name === 'x-v1-user-id' ? 'forged-user' : undefined),
    };
    const signed = createV1SessionToken({ userId: USER.id, secret: SESSION_SECRET, issuedAtMs: 0 });
    const productionSession = {
      headers: { cookie: `${V1_SESSION_COOKIE_NAME}=${signed}` },
      header: forged.header,
    };

    expect(resolveV1RequestIdentity(forged, { nodeEnv: 'production', sessionSecret: SESSION_SECRET, nowMs: 1_000 })).toBeNull();
    expect(resolveV1RequestIdentity(productionSession, { nodeEnv: 'production', sessionSecret: SESSION_SECRET, nowMs: 1_000 })).toEqual({ kind: 'user_id', userId: USER.id });
    expect(resolveV1RequestIdentity(forged, { nodeEnv: 'test', sessionSecret: null })).toEqual({ kind: 'user_id', userId: 'forged-user' });
  });

  it('Task 8 PIN returns the GamesService reconnect snapshot ordered after the requested sequence', async () => {
    const client = socket();
    const events = [{ sequence: 2 }, { sequence: 3 }];
    gamesService.listEvents.mockResolvedValue({ events, lastSequence: 3, gap: null });

    await expect(task8Gateway(gateway).subscribeToGame(client, { gameId: GAME_ID, afterSequence: 1 })).resolves.toEqual({
      status: 'subscribed',
      room: `game:${GAME_ID}`,
      afterSequence: 1,
      snapshot: { gameId: GAME_ID, version: 4, state: 'LIVE', lastSequence: 3, events },
    });
    expect(client.join).toHaveBeenCalledWith(`game:${GAME_ID}`);
    expect(gamesService.listEvents).toHaveBeenCalledWith(USER, GAME_ID, 1);
  });

  it('Task 8 RED binds the gateway to the /game-operations namespace', () => {
    expect(Reflect.getMetadata(GATEWAY_OPTIONS, RealtimeGateway)).toEqual(
      expect.objectContaining({ namespace: '/game-operations' }),
    );
  });

  it('Task 8 RED rejects an authenticated handshake without stable clientInstanceId and authorizationSubjectVersion', async () => {
    const client = socket({
      data: {},
      handshake: { headers: {}, auth: { 'x-v1-user-id': USER.id } },
    });
    prisma.v1User.findFirst.mockResolvedValue(USER);

    await task8Gateway(gateway).handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalledWith(`user:${USER.id}`);
  });

  it('Task 8 RED answers game.time.ping with server receive and send timestamps', async () => {
    const client = socket();
    const before = Date.now();

    const pong = await task8Gateway(gateway).pingGameTime(client, { clientSentAt: 1_700_000_000_000 });

    expect(pong).toEqual({
      clientSentAt: 1_700_000_000_000,
      serverReceivedAt: expect.any(Number),
      serverSentAt: expect.any(Number),
    });
    expect(Date.now()).toBeGreaterThanOrEqual(before);
  });

  it('Task 8 RED delegates append to GamesService.appendEvent and sends ACK plus committed event', async () => {
    const client = socket();
    const payload = {
      gameId: GAME_ID,
      expectedVersion: 4,
      clientEventId: 'event-1',
      takeoverToken: 'nonempty-takeover-token',
      payloadHash: 'sha256:stable-payload',
      event: { type: 'SCORE', period: 1, clockMs: 12_000, occurredAt: '2026-08-01T10:00:00.000Z', payload: {} },
    };
    gamesService.appendEvent.mockResolvedValue({
      gameId: GAME_ID,
      state: 'LIVE',
      version: 5,
      durableCommandId: 'event-1',
      replayed: false,
      clientEventId: 'event-1',
      sequence: 4,
    });

    const result = await task8Gateway(gateway).appendGameEvent(client, payload);

    expect(result).toEqual(expect.objectContaining({ status: 'ack', clientEventId: 'event-1', sequence: 4, version: 5 }));
    expect(gamesService.appendEvent).toHaveBeenCalledWith(USER, GAME_ID, 'event-1', expect.objectContaining({ takeoverToken: 'nonempty-takeover-token' }));
    expect(client.emit).toHaveBeenCalledWith('game.event.ack', expect.objectContaining({ clientEventId: 'event-1', sequence: 4, version: 5 }));
    expect(client.emit).toHaveBeenCalledWith('game.event.committed', expect.objectContaining({ gameId: GAME_ID, sequence: 4, version: 5 }));
  });

  it('Task 8 RED delegates retry to GamesService.retryEvent with the original event envelope and never appendEvent', async () => {
    const client = socket();
    const payload = {
      gameId: GAME_ID,
      rebasedExpectedVersion: 5,
      clientEventId: 'event-1',
      takeoverToken: 'fresh-takeover-token',
      payloadHash: 'sha256:stable-payload',
      event: { type: 'SCORE', period: 1, clockMs: 12_000, occurredAt: '2026-08-01T10:00:00.000Z', payload: {} },
    };
    gamesService.retryEvent.mockResolvedValue({
      gameId: GAME_ID,
      state: 'LIVE',
      version: 5,
      durableCommandId: 'event-1',
      replayed: true,
      clientEventId: 'event-1',
      sequence: 4,
    });

    const result = await task8Gateway(gateway).retryGameEvent(client, payload);

    expect(result).toEqual(expect.objectContaining({ status: 'ack', clientEventId: 'event-1', sequence: 4, version: 5 }));
    expect(gamesService.retryEvent).toHaveBeenCalledWith(
      USER,
      GAME_ID,
      expect.objectContaining({
        rebasedExpectedVersion: 5,
        clientEventId: 'event-1',
        payloadHash: 'sha256:stable-payload',
        event: payload.event,
      }),
    );
    expect(gamesService.appendEvent).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('game.event.ack', expect.objectContaining({ clientEventId: 'event-1', sequence: 4, version: 5 }));
    expect(client.emit).toHaveBeenCalledWith('game.event.committed', expect.objectContaining({ gameId: GAME_ID, sequence: 4, version: 5 }));
  });

  it.each([
    ['empty takeover token', { expectedVersion: 4, clientEventId: 'event-1', takeoverToken: '', event: {} }],
    ['empty client event id', { expectedVersion: 4, clientEventId: '', takeoverToken: 'takeover', event: {} }],
    ['negative expected version', { expectedVersion: -1, clientEventId: 'event-1', takeoverToken: 'takeover', event: {} }],
    ['malformed event', { expectedVersion: 4, clientEventId: 'event-1', takeoverToken: 'takeover', event: { type: 'SCORE' } }],
  ])('Task 8 RED rejects malformed %s with game.error before an authoritative append', async (_label, malformed) => {
    const client = socket();

    const result = await task8Gateway(gateway).appendGameEvent(client, {
      gameId: GAME_ID,
      payloadHash: 'sha256:malformed',
      ...malformed,
    });

    expect(result).toEqual(expect.objectContaining({ status: 'error', code: 'VALIDATION_ERROR' }));
    expect(client.emit).toHaveBeenCalledWith('game.error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(gamesService.appendEvent).not.toHaveBeenCalled();
  });

  it('Task 8 RED emits game.gap when an otherwise authorized reconnect snapshot has a sequence gap', async () => {
    const client = socket();
    gamesService.listEvents.mockResolvedValue({
      events: [{ sequence: 3 }],
      lastSequence: 3,
      gap: { expectedSequence: 2, availableFrom: 3 },
    });

    await task8Gateway(gateway).subscribeToGame(client, { gameId: GAME_ID, afterSequence: 1 });

    expect(client.emit).toHaveBeenCalledWith('game.gap', { expectedSequence: 2, availableFrom: 3 });
  });

  it('Task 8 RED maps a domain append failure to game.error and never acknowledges or commits it', async () => {
    const client = socket();
    gamesService.appendEvent.mockRejectedValue(new ConflictException({ code: 'EVENT_INVALID', message: 'Invalid event' }));
    const payload = {
      gameId: GAME_ID,
      expectedVersion: 4,
      clientEventId: 'event-invalid',
      takeoverToken: 'nonempty-takeover-token',
      payloadHash: 'sha256:invalid-event',
      event: { type: 'SCORE', period: 1, clockMs: 12_000, occurredAt: '2026-08-01T10:00:00.000Z', payload: {} },
    };

    const result = await task8Gateway(gateway).appendGameEvent(client, payload);

    expect(result).toEqual(expect.objectContaining({ status: 'error', code: 'EVENT_INVALID', clientEventId: 'event-invalid' }));
    expect(client.emit).toHaveBeenCalledWith('game.error', expect.objectContaining({ code: 'EVENT_INVALID', clientEventId: 'event-invalid', expectedVersion: 4 }));
    expect(client.emit).not.toHaveBeenCalledWith('game.event.ack', expect.anything());
    expect(client.emit).not.toHaveBeenCalledWith('game.event.committed', expect.anything());
  });

  it('Task 8 permission revoked RED emits each matching game event before room leave and preserves nonmatching subscriptions', async () => {
    const matchingGameId = '60000000-0000-4000-8000-000000000009';
    const otherTournamentGameId = '60000000-0000-4000-8000-000000000010';
    const tournamentId = '70000000-0000-4000-8000-000000000008';
    const otherTournamentId = '70000000-0000-4000-8000-000000000009';
    const serverActions: Array<
      | { readonly kind: 'emit'; readonly room: string; readonly event: string; readonly payload: unknown }
      | { readonly kind: 'leave'; readonly room: string; readonly gameRoom: string }
    > = [];
    const server = {
      to: jest.fn((room: string) => ({
        emit: jest.fn((event: string, payload: unknown) => {
          serverActions.push({ kind: 'emit', room, event, payload });
        }),
      })),
      in: jest.fn((room: string) => ({
        socketsLeave: jest.fn((gameRoom: string) => {
          serverActions.push({ kind: 'leave', room, gameRoom });
        }),
      })),
    };
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
    const game = (gameId: string, scopedTournamentId: string, fixtureId: string) => ({
      id: gameId,
      state: 'LIVE',
      version: 4,
      lastSequence: 3,
      tournamentFixture: { id: fixtureId, tournamentId: scopedTournamentId, fieldId: null },
    });
    prisma.v1Game.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === GAME_ID) return Promise.resolve(game(GAME_ID, tournamentId, 'fixture-task-8-1'));
      if (where.id === matchingGameId) return Promise.resolve(game(matchingGameId, tournamentId, 'fixture-task-8-2'));
      return Promise.resolve(game(otherTournamentGameId, otherTournamentId, 'fixture-task-8-3'));
    });
    staffAccess.assertAccess.mockResolvedValue({
      userId: USER.id,
      role: 'field_operator',
      tournamentId,
      assignmentId: 'assignment-task-8',
      assignmentVersion: 0,
    });
    const client = socket({ data: { userId: USER.id, authUser: USER, authorizationSubjectVersion: 0 } });

    await task8Gateway(gateway).subscribeToGame(client, { gameId: GAME_ID, afterSequence: 0 });
    await task8Gateway(gateway).subscribeToGame(client, { gameId: matchingGameId, afterSequence: 0 });
    await task8Gateway(gateway).subscribeToGame(client, { gameId: otherTournamentGameId, afterSequence: 0 });

    task8Gateway(gateway).evictUserFromScopedGameRooms({
      userId: USER.id,
      tournamentId,
      assignmentVersion: 1,
    });

    const matchingRooms = [`game:${GAME_ID}`, `game:${matchingGameId}`];
    for (const room of matchingRooms) {
      const eventIndex = serverActions.findIndex(
        (action) =>
          action.kind === 'emit' &&
          action.room === client.id &&
          action.payload !== null &&
          typeof action.payload === 'object' &&
          'gameId' in action.payload &&
          action.payload.gameId === room.slice('game:'.length) &&
          action.event === 'game.permission.revoked',
      );
      const leaveIndex = serverActions.findIndex(
        (action) => action.kind === 'leave' && action.gameRoom === room,
      );
      expect(eventIndex).toBeGreaterThanOrEqual(0);
      expect(leaveIndex).toBeGreaterThan(eventIndex);
      expect(serverActions[eventIndex]).toEqual({
        kind: 'emit',
        room: client.id,
        event: 'game.permission.revoked',
        payload: { gameId: room.slice('game:'.length), assignmentVersion: 1 },
      });
    }
    expect(serverActions).not.toContainEqual(
      expect.objectContaining({
        kind: 'emit',
        room: `game:${otherTournamentGameId}`,
        event: 'game.permission.revoked',
      }),
    );
    expect(serverActions).not.toContainEqual(
      expect.objectContaining({ kind: 'leave', gameRoom: `game:${otherTournamentGameId}` }),
    );
  });

  it('Task 8 permission revoked targets only the revoked user when two users share the same game room', async () => {
    const tournamentId = '70000000-0000-4000-8000-000000000010';
    const userA = USER;
    const userB: TestSocketUser = {
      id: 'user-task-8-b',
      email: 'task-8-b@example.test',
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    const emitted: Array<{ readonly target: string; readonly event: string; readonly payload: unknown }> = [];
    const leaves: Array<{ readonly userRoom: string; readonly gameRoom: string }> = [];
    const server = {
      to: jest.fn((target: string) => ({
        emit: jest.fn((event: string, payload: unknown) => emitted.push({ target, event, payload })),
      })),
      in: jest.fn((userRoom: string) => ({
        socketsLeave: jest.fn((gameRoom: string) => leaves.push({ userRoom, gameRoom })),
      })),
    };
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
    prisma.v1Game.findUnique.mockResolvedValue({
      id: GAME_ID,
      state: 'LIVE',
      version: 4,
      lastSequence: 3,
      tournamentFixture: { id: 'fixture-task-8-shared', tournamentId, fieldId: null },
    });
    staffAccess.assertAccess.mockImplementation(({ userId }: { readonly userId: string }) =>
      Promise.resolve({
        userId,
        role: 'field_operator',
        tournamentId,
        assignmentId: 'assignment-task-8-shared',
        assignmentVersion: 0,
      }),
    );
    const revokedSocket = socket({
      id: 'socket-revoked',
      data: { userId: userA.id, authUser: userA, authorizationSubjectVersion: 0 },
    });
    const unaffectedSocket = socket({
      id: 'socket-unaffected',
      data: { userId: userB.id, authUser: userB, authorizationSubjectVersion: 0 },
    });

    await task8Gateway(gateway).subscribeToGame(revokedSocket, { gameId: GAME_ID, afterSequence: 0 });
    await task8Gateway(gateway).subscribeToGame(unaffectedSocket, { gameId: GAME_ID, afterSequence: 0 });
    task8Gateway(gateway).evictUserFromScopedGameRooms({
      userId: userA.id,
      tournamentId,
      assignmentVersion: 7,
    });

    expect(emitted).toEqual([
      {
        target: revokedSocket.id,
        event: 'game.permission.revoked',
        payload: { gameId: GAME_ID, assignmentVersion: 7 },
      },
    ]);
    expect(leaves).toEqual([{ userRoom: `user:${userA.id}`, gameRoom: `game:${GAME_ID}` }]);

    emitted.length = 0;
    leaves.length = 0;
    task8Gateway(gateway).evictUserFromScopedGameRooms({
      userId: userA.id,
      tournamentId,
      assignmentVersion: 7,
    });
    expect(emitted).toEqual([]);
    expect(leaves).toEqual([]);
  });

  // 파싱 실패 경로는 검증된 입력이 없다는 이유로 상관관계 필드를 통째로 버리고 있었다.
  // 성공/도메인 실패 경로는 항상 싣기 때문에, 클라이언트 큐는 파싱 실패한 항목만 어떤 것이
  // 실패했는지 알 수 없어 재시도·실패 표시를 붙이지 못했다. 이 계약이 되돌려지면 여기서 깨진다.
  it('echoes clientEventId/expectedVersion on a parse failure so the client can correlate the queued item', async () => {
    const client = socket();

    const result = await task8Gateway(gateway).appendGameEvent(client, {
      gameId: GAME_ID,
      expectedVersion: 3,
      clientEventId: 'event-42',
      takeoverToken: 'nonempty-takeover-token',
      payloadHash: 'sha256:stable-payload',
      // `event` 누락 -> parseGameEventCommand 실패
    });

    expect(result).toEqual({
      status: 'error',
      code: 'VALIDATION_ERROR',
      clientEventId: 'event-42',
      expectedVersion: 3,
    });
    expect(gamesService.appendEvent).not.toHaveBeenCalled();
  });

  // 검증을 통과하지 못한 입력이므로 값을 신뢰하지 않는다 — 형식이 어긋난 상관관계 필드를
  // 그대로 되돌리면 클라이언트가 엉뚱한 큐 항목을 실패로 표시하게 된다. 그럴 바엔 싣지 않는다.
  it('omits malformed correlation fields instead of echoing them back', async () => {
    const client = socket();

    const malformedId = await task8Gateway(gateway).appendGameEvent(client, {
      gameId: GAME_ID,
      expectedVersion: 3,
      clientEventId: 12_345, // 문자열이 아니다
      takeoverToken: 'nonempty-takeover-token',
      payloadHash: 'sha256:stable-payload',
    });
    expect(malformedId).toEqual({ status: 'error', code: 'VALIDATION_ERROR', expectedVersion: 3 });

    const notAnObject = await task8Gateway(gateway).appendGameEvent(client, 'nonsense');
    expect(notAnObject).toEqual({ status: 'error', code: 'VALIDATION_ERROR' });

    expect(gamesService.appendEvent).not.toHaveBeenCalled();
  });
});
