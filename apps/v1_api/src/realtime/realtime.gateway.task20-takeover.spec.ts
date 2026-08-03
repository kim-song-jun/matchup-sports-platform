import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';

const GAME_ID = '92000000-0000-4000-8000-000000000099';
const USER = {
  id: 'task20-user',
  email: 'task20@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
} as const;

type SocketAdapter = {
  readonly id: string;
  readonly data: {
    userId?: string;
    authUser?: typeof USER;
    clientInstanceId?: string;
    authorizationSubjectVersion?: number;
  };
  readonly emit: jest.Mock<void, [string, unknown]>;
};

type Task20TakeoverGateway = {
  requestGameTakeover(client: SocketAdapter, payload: unknown): Promise<unknown>;
  renewGameTakeover(client: SocketAdapter, payload: unknown): Promise<unknown>;
};

function socket(overrides: Partial<SocketAdapter['data']> = {}): SocketAdapter {
  return {
    id: 'socket-task20',
    data: { userId: USER.id, authUser: USER, clientInstanceId: 'client-1', authorizationSubjectVersion: 1, ...overrides },
    emit: jest.fn(),
  };
}

function task20Gateway(gateway: RealtimeGateway): Task20TakeoverGateway {
  return {
    requestGameTakeover: (client, payload) =>
      Reflect.apply((gateway as unknown as Task20TakeoverGateway).requestGameTakeover, gateway, [client, payload]),
    renewGameTakeover: (client, payload) =>
      Reflect.apply((gateway as unknown as Task20TakeoverGateway).renewGameTakeover, gateway, [client, payload]),
  };
}

describe('Task 20 game-operations takeover realtime protocol', () => {
  let gateway: RealtimeGateway;
  const gamesService = {
    listEvents: jest.fn(),
    appendEvent: jest.fn(),
    retryEvent: jest.fn(),
    requestTakeover: jest.fn(),
    renewTakeover: jest.fn(),
  };
  const prisma = { v1Game: { findUnique: jest.fn() }, v1User: { findFirst: jest.fn() } };
  const staffAccess = { assertAccess: jest.fn() };
  const logger = { debug: jest.fn(), error: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
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

  it('grants a takeover on request, delegating to GamesService.requestTakeover and emitting game.takeover.granted', async () => {
    const client = socket();
    const grant = {
      gameId: GAME_ID,
      takeoverToken: 'a'.repeat(64),
      version: 3,
      lastSequence: 2,
      expiresAt: '2030-01-01T00:00:00.000Z',
    };
    gamesService.requestTakeover.mockResolvedValue(grant);

    const result = await task20Gateway(gateway).requestGameTakeover(client, {
      gameId: GAME_ID,
      authorizationSubjectVersion: 1,
      clientInstanceId: 'client-1',
      lastSequence: 2,
    });

    expect(gamesService.requestTakeover).toHaveBeenCalledWith(USER, GAME_ID, {
      clientInstanceId: 'client-1',
      lastSequence: 2,
    });
    expect(client.emit).toHaveBeenCalledWith('game.takeover.granted', grant);
    expect(result).toEqual({ status: 'granted', ...grant });
  });

  it('denies a takeover request whose authorizationSubjectVersion no longer matches the connection, without calling GamesService', async () => {
    const client = socket({ authorizationSubjectVersion: 1 });

    const result = await task20Gateway(gateway).requestGameTakeover(client, {
      gameId: GAME_ID,
      authorizationSubjectVersion: 2,
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });

    expect(result).toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
    expect(gamesService.requestTakeover).not.toHaveBeenCalled();
  });

  it('denies a malformed takeover request payload before touching authentication or GamesService', async () => {
    const client = socket();

    const result = await task20Gateway(gateway).requestGameTakeover(client, { gameId: GAME_ID });

    expect(result).toEqual({ status: 'denied', code: 'VALIDATION_ERROR' });
    expect(gamesService.requestTakeover).not.toHaveBeenCalled();
  });

  it('denies a takeover request from an unauthenticated socket', async () => {
    const client = socket({ userId: undefined, authUser: undefined });

    const result = await task20Gateway(gateway).requestGameTakeover(client, {
      gameId: GAME_ID,
      authorizationSubjectVersion: 1,
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });

    expect(result).toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
    expect(gamesService.requestTakeover).not.toHaveBeenCalled();
  });

  it('maps a STAFF_SCOPE_DENIED-shaped ForbiddenException from GamesService.requestTakeover to a denied result', async () => {
    const client = socket();
    gamesService.requestTakeover.mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'not authorized' }),
    );

    const result = await task20Gateway(gateway).requestGameTakeover(client, {
      gameId: GAME_ID,
      authorizationSubjectVersion: 1,
      clientInstanceId: 'client-1',
      lastSequence: 0,
    });

    expect(result).toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
  });

  it('renews a held takeover token, delegating to GamesService.renewTakeover and emitting game.takeover.granted', async () => {
    const client = socket();
    const grant = {
      gameId: GAME_ID,
      takeoverToken: 'b'.repeat(64),
      version: 4,
      lastSequence: 3,
      expiresAt: '2030-01-01T00:01:00.000Z',
    };
    gamesService.renewTakeover.mockResolvedValue(grant);

    const result = await task20Gateway(gateway).renewGameTakeover(client, {
      gameId: GAME_ID,
      takeoverToken: 'b'.repeat(64),
      clientInstanceId: 'client-1',
    });

    expect(gamesService.renewTakeover).toHaveBeenCalledWith(USER, GAME_ID, {
      takeoverToken: 'b'.repeat(64),
      clientInstanceId: 'client-1',
    });
    expect(client.emit).toHaveBeenCalledWith('game.takeover.granted', grant);
    expect(result).toEqual({ status: 'granted', ...grant });
  });

  it('maps a stale/expired renewal rejection from GamesService.renewTakeover to TAKEOVER_TOKEN_EXPIRED', async () => {
    const client = socket();
    gamesService.renewTakeover.mockRejectedValue(
      new ForbiddenException({ code: 'TAKEOVER_TOKEN_EXPIRED', message: 'expired' }),
    );

    const result = await task20Gateway(gateway).renewGameTakeover(client, {
      gameId: GAME_ID,
      takeoverToken: 'stale-token-value',
      clientInstanceId: 'client-1',
    });

    expect(result).toEqual({ status: 'denied', code: 'TAKEOVER_TOKEN_EXPIRED' });
  });

  it('maps a scope-denied rejection from GamesService.renewTakeover to STAFF_SCOPE_DENIED, distinct from an expired token', async () => {
    const client = socket();
    gamesService.renewTakeover.mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'not authorized' }),
    );

    const result = await task20Gateway(gateway).renewGameTakeover(client, {
      gameId: GAME_ID,
      takeoverToken: 'some-token-value',
      clientInstanceId: 'client-1',
    });

    expect(result).toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
  });

  it('denies a malformed renewal payload without calling GamesService', async () => {
    const client = socket();

    const result = await task20Gateway(gateway).renewGameTakeover(client, { gameId: GAME_ID });

    expect(result).toEqual({ status: 'denied', code: 'VALIDATION_ERROR' });
    expect(gamesService.renewTakeover).not.toHaveBeenCalled();
  });
});
