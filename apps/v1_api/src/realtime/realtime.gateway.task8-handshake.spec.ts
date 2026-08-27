import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import {
  createV1SessionToken,
  V1_SESSION_COOKIE_NAME,
} from '../auth/v1-session';
import { GameBroadcastRegistry } from '../games/game-broadcast.registry';
import { GameTakeoverService } from '../games/game-takeover.service';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';

const SESSION_SECRET = 'task-8-handshake-session-secret-32-bytes';
const GAME_ID = '60000000-0000-4000-8000-000000000008';
const USER = {
  id: 'user-task-8-handshake',
  email: 'task-8-handshake@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
} as const;

type TestSocket = {
  readonly id: string;
  readonly handshake: {
    readonly headers: Record<string, string>;
    readonly auth: Record<string, unknown>;
  };
  readonly data: {
    userId?: string;
    authUser?: typeof USER;
    clientInstanceId?: string;
    authorizationSubjectVersion?: number;
  };
  readonly join: jest.Mock<Promise<void>, [string]>;
  readonly leave: jest.Mock<Promise<void>, [string]>;
  readonly emit: jest.Mock<void, [string, unknown]>;
  readonly disconnect: jest.Mock<void, [boolean]>;
};

type SocketMiddleware = (
  socket: TestSocket,
  next: (error?: Error) => void,
) => void | Promise<void>;

function socket(
  headers: Record<string, string> = {},
  auth: Record<string, unknown> = {},
): TestSocket {
  return {
    id: 'socket-task-8-handshake',
    handshake: {
      headers,
      auth: {
        clientInstanceId: 'task-8-handshake-client',
        authorizationSubjectVersion: 0,
        ...auth,
      },
    },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function sessionCookie(userId = USER.id, issuedAtMs?: number): string {
  const token = createV1SessionToken({
    userId,
    secret: SESSION_SECRET,
    ...(issuedAtMs === undefined ? {} : { issuedAtMs }),
  });
  return `${V1_SESSION_COOKIE_NAME}=${token}`;
}

describe('Task 8 realtime authenticated pre-connect handshake', () => {
  let gateway: RealtimeGateway;
  const prisma = {
    v1User: { findFirst: jest.fn() },
    v1Game: { findUnique: jest.fn() },
  };
  const gamesService = { listEvents: jest.fn() };
  const staffAccess = { assertAccess: jest.fn() };
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const server = { use: jest.fn<void, [SocketMiddleware]>() };
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSessionSecret = process.env.V1_SESSION_SECRET;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'production';
    process.env.V1_SESSION_SECRET = SESSION_SECRET;
    prisma.v1User.findFirst.mockResolvedValue(USER);
    prisma.v1Game.findUnique.mockResolvedValue({
      id: GAME_ID,
      state: 'LIVE',
      version: 4,
      lastSequence: 0,
      tournamentFixture: null,
    });
    gamesService.listEvents.mockResolvedValue({ events: [], lastSequence: 0, gap: null });

    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentStaffAccessService, useValue: staffAccess },
        { provide: GamesService, useValue: gamesService },
        { provide: getLoggerToken(RealtimeGateway.name), useValue: logger },
        { provide: GameBroadcastRegistry, useValue: { register: jest.fn(), emitToGame: jest.fn() } },
        { provide: GameTakeoverService, useValue: { isSuperseded: jest.fn().mockReturnValue(false) } },
      ],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = originalSessionSecret;
  });

  function handleConnection(client: TestSocket): Promise<void> {
    return Reflect.apply(gateway.handleConnection, gateway, [client]);
  }

  function subscribeToGame(client: TestSocket, payload: unknown): Promise<unknown> {
    return Reflect.apply(gateway.subscribeToGame, gateway, [client, payload]);
  }

  function captureMiddleware(): SocketMiddleware {
    Reflect.apply(gateway.afterInit, gateway, [server]);
    expect(server.use).toHaveBeenCalledTimes(1);
    return server.use.mock.calls[0][0];
  }

  async function invokeMiddleware(
    middleware: SocketMiddleware,
    client: TestSocket,
    next: jest.Mock<void, [error?: Error]>,
  ): Promise<void> {
    const returned = middleware(client, next);
    if (returned !== undefined && typeof returned === 'object' && 'then' in returned) {
      await returned;
    }
    if (next.mock.calls.length === 0) {
      await new Promise<void>((resolve) => {
        const original = next.getMockImplementation();
        next.mockImplementation((error?: Error) => {
          original?.(error);
          resolve();
        });
      });
    }
  }

  it('PIN keeps the existing local identity/account gate green', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.V1_SESSION_SECRET;
    const client = socket({}, { 'x-v1-user-id': USER.id });

    await handleConnection(client);

    expect(client.data.userId).toBe(USER.id);
    expect(client.join).toHaveBeenCalledWith(`user:${USER.id}`);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('RED registers pre-connect middleware and makes authenticated identity visible before subscribe runs', async () => {
    const client = socket({ cookie: sessionCookie() });
    let subscribePromise: Promise<unknown> | undefined;
    const next = jest.fn<void, [error?: Error]>((error?: Error) => {
      expect(error).toBeUndefined();
      expect(client.data.userId).toBe(USER.id);
      expect(client.data.authUser).toEqual(USER);
      subscribePromise = subscribeToGame(client, { gameId: GAME_ID, afterSequence: 0 });
    });

    await invokeMiddleware(captureMiddleware(), client, next);

    expect(next).toHaveBeenCalledWith();
    await expect(subscribePromise).resolves.toEqual(
      expect.objectContaining({ status: 'subscribed', room: `game:${GAME_ID}` }),
    );
    expect(prisma.v1User.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER.id } }),
    );
  });

  it('RED rejects forged identity headers when no valid production session is present before connect', async () => {
    const client = socket({ 'x-v1-user-id': USER.id });
    const next = jest.fn<void, [error?: Error]>();

    await invokeMiddleware(captureMiddleware(), client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
    expect(client.data).toEqual({});
  });

  it.each([
    ['malformed session cookie', 'teameet_v1_session=not-a-session'],
    ['stale session cookie', sessionCookie(USER.id, 0)],
  ])('RED rejects a %s before connect', async (_label, cookie) => {
    const client = socket({ cookie });
    const next = jest.fn<void, [error?: Error]>();

    await invokeMiddleware(captureMiddleware(), client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
    expect(client.data).toEqual({});
  });

  it('RED rejects suspended accounts before connect', async () => {
    prisma.v1User.findFirst.mockResolvedValue({ ...USER, accountStatus: 'suspended' });
    const client = socket({ cookie: sessionCookie() });
    const next = jest.fn<void, [error?: Error]>();

    await invokeMiddleware(captureMiddleware(), client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(client.data).toEqual({});
  });

  it('RED rejects pending social-signup accounts before connect', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      ...USER,
      onboardingStatus: 'social_profile_required',
    });
    const client = socket({ cookie: sessionCookie() });
    const next = jest.fn<void, [error?: Error]>();

    await invokeMiddleware(captureMiddleware(), client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(client.data).toEqual({});
  });

  it('RED rejects a database failure instead of allowing an unauthenticated connect', async () => {
    const dbError = new Error('task-8 database unavailable');
    prisma.v1User.findFirst.mockRejectedValue(dbError);
    const client = socket({ cookie: sessionCookie() });
    const next = jest.fn<void, [error?: Error]>();

    await invokeMiddleware(captureMiddleware(), client, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(client.data).toEqual({});
  });
});
