import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { GameBroadcastRegistry } from '../games/game-broadcast.registry';
import { GameTakeoverService } from '../games/game-takeover.service';
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
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  // 백로그 결함 수정(realtime-takeover-and-eviction-protocol): 게이트웨이는
  // renew 실패를 잡은 뒤 이 서비스에 "지금 이 게임을 쥔, 내 것과 다른 살아있는
  // grant가 있는가"를 직접 물어 TAKEOVER_TOKEN_EXPIRED와 TAKEOVER_SUPERSEDED를
  // 가른다. 기본값 false = "아무도 안 쥐고 있다(자연 만료)".
  const gameTakeover = { isSuperseded: jest.fn().mockReturnValue(false) };

  beforeEach(async () => {
    jest.clearAllMocks();
    gameTakeover.isSuperseded.mockReturnValue(false);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentStaffAccessService, useValue: staffAccess },
        { provide: GamesService, useValue: gamesService },
        { provide: getLoggerToken(RealtimeGateway.name), useValue: logger },
        { provide: GameBroadcastRegistry, useValue: { register: jest.fn(), emitToGame: jest.fn() } },
        { provide: GameTakeoverService, useValue: gameTakeover },
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
    expect(gameTakeover.isSuperseded).toHaveBeenCalledWith(GAME_ID, 'stale-token-value');
  });

  /**
   * 백로그 결함 수정(realtime-takeover-and-eviction-protocol): renew 실패가
   * 항상 TAKEOVER_TOKEN_EXPIRED로만 뭉개지면, 두 콘솔(운영자 두 명, 또는 한
   * 사람이 탭 두 개)이 같은 게임의 토큰을 서로 뺏는 핑퐁이 된다 — 잃은 쪽이
   * "내 토큰이 그냥 만료됐구나"라고 오해해 자동으로 재요청하고, 그게 상대의
   * 토큰을 덮어써 상대도 같은 오해로 재요청하는 게 무한 반복된다. 이 테스트는
   * `GameTakeoverService.isSuperseded`가 true(=다른, 아직 살아있는 grant가
   * 이 게임을 쥐고 있다)를 돌려줄 때 게이트웨이가 그 사실을 구분해서
   * TAKEOVER_SUPERSEDED로 보내는지 검증한다 — 프론트 훅은 이 코드에서는
   * 자동 재요청하지 않는다(use-v1-game-operations-console.ts).
   */
  it('maps a renewal rejection to TAKEOVER_SUPERSEDED when a different, still-live grant now holds the game', async () => {
    const client = socket();
    gamesService.renewTakeover.mockRejectedValue(
      new ForbiddenException({ code: 'TAKEOVER_TOKEN_EXPIRED', message: 'expired' }),
    );
    gameTakeover.isSuperseded.mockReturnValue(true);

    const result = await task20Gateway(gateway).renewGameTakeover(client, {
      gameId: GAME_ID,
      takeoverToken: 'outbid-token-value',
      clientInstanceId: 'client-1',
    });

    expect(result).toEqual({ status: 'denied', code: 'TAKEOVER_SUPERSEDED' });
    expect(gameTakeover.isSuperseded).toHaveBeenCalledWith(GAME_ID, 'outbid-token-value');
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
