import type { PinoLogger } from 'nestjs-pino';
import { GamesController } from './games.controller';
import { GameBroadcastRegistry } from './game-broadcast.registry';
import type { GamesService } from './games.service';
import type { AppendGameEventDto, AssignGoalAssistDto, ReverseGameEventDto } from './dto/game-event.dto';
import type { V1AuthUser } from '../auth/v1-auth-user';

/**
 * REST로 들어온 경기 이벤트 변경이 구독자에게 전달되는지 검증한다.
 *
 * 이 계약이 없던 동안, `game.event.committed`를 emit하는 코드는 게이트웨이의
 * `game.event.append`/`game.event.retry` 핸들러 안에만 있었다. 같은 이벤트 로그를 같은
 * `GamesService` 메서드로 쓰는 REST 경로(`POST /games/:id/events`,
 * `.../events/:eventId/reverse`, `.../events/:eventId/assist`)는 DB에는 커밋하면서
 * `game:<gameId>` 구독자에게 아무것도 보내지 않았고, 다른 운영 콘솔은 다음 수동
 * 재조회 전까지 그 변경을 몰랐다.
 */
describe('GamesController — REST 변경의 committed event delivery', () => {
  const user = { id: 'user-1', email: 'ops@example.com' } as V1AuthUser;

  const persistedEvent = {
    id: 'event-1',
    gameId: 'game-1',
    sequence: 7,
    clientEventId: 'client-1',
    type: 'GOAL',
    reversesEventId: null,
  };

  function setup(result: unknown) {
    const emitCommittedEvent = jest.fn();
    const service = {
      appendEvent: jest.fn().mockResolvedValue(result),
      reverseEvent: jest.fn().mockResolvedValue(result),
      assignGoalAssist: jest.fn().mockResolvedValue(result),
    } as unknown as GamesService;
    const controller = new GamesController(service, {
      emitCommittedEvent,
      refreshGameSubscribers: jest.fn().mockResolvedValue(undefined),
    } as unknown as GameBroadcastRegistry);
    return { controller, emitCommittedEvent, service };
  }

  const committedResult = {
    clientEventId: 'client-1',
    sequence: 7,
    version: 12,
    event: persistedEvent,
  };

  it('appendEvent 성공 후 저장된 version과 함께 committed event 전달을 요청한다', async () => {
    const { controller, emitCommittedEvent } = setup(committedResult);

    await controller.appendEvent(user, 'game-1', 'idem-1', {} as AppendGameEventDto);

    expect(emitCommittedEvent).toHaveBeenCalledTimes(1);
    expect(emitCommittedEvent).toHaveBeenCalledWith('game-1', 12, {
      gameId: 'game-1',
      sequence: 7,
      version: 12,
      event: persistedEvent,
    });
  });

  it('reverseEvent · assignGoalAssist 도 같은 이벤트를 보낸다', async () => {
    const reverse = setup(committedResult);
    await reverse.controller.reverseEvent(user, 'game-1', 'event-1', 'idem-2', {} as ReverseGameEventDto);
    expect(reverse.emitCommittedEvent).toHaveBeenCalledWith('game-1', 12, expect.objectContaining({ sequence: 7 }));

    const assist = setup(committedResult);
    await assist.controller.assignGoalAssist(user, 'game-1', 'event-1', 'idem-3', {} as AssignGoalAssistDto);
    expect(assist.emitCommittedEvent).toHaveBeenCalledWith('game-1', 12, expect.objectContaining({ sequence: 7 }));
  });

  it('영속 event가 없는 결과(구버전 멱등 replay)는 보내지 않는다', async () => {
    // `event: undefined`를 그대로 실어 보내면 수신 측 `liveEvents`에 id/reversesEventId가
    // undefined인 행이 들어가 스코어보드가 자기 골을 "이미 취소됨"으로 오판한다 —
    // games.types.ts의 `GameEventAppendResult.event` 주석에 기록된 실제 사고다.
    const { controller, emitCommittedEvent } = setup({ clientEventId: 'client-1', sequence: 7, version: 12 });

    await controller.appendEvent(user, 'game-1', 'idem-1', {} as AppendGameEventDto);

    expect(emitCommittedEvent).not.toHaveBeenCalled();
  });

  it('브로드캐스트 여부와 무관하게 서비스 결과를 그대로 반환한다', async () => {
    const { controller } = setup(committedResult);

    await expect(controller.appendEvent(user, 'game-1', 'idem-1', {} as AppendGameEventDto)).resolves.toBe(
      committedResult,
    );
  });

  describe('REST lifecycle command snapshot refresh', () => {
    function commandSetup(
      result: unknown,
      refreshGameSubscribers: (gameId: string, minimumVersion: number) => Promise<void>,
    ) {
      const warn = jest.fn();
      const registry = new GameBroadcastRegistry({ warn } as unknown as PinoLogger);
      registry.register({
        emitCommittedEvent: jest.fn(),
        refreshGameSubscribers,
      });
      const executeCommand = jest.fn().mockResolvedValue(result);
      const controller = new GamesController({ executeCommand } as unknown as GamesService, registry);
      return { controller, executeCommand, warn };
    }

    it('keeps the committed HTTP result independent of an in-flight snapshot refresh', async () => {
      const response = { gameId: 'game-1', state: 'LIVE', version: 3, replayed: false };
      let beginRefresh!: () => void;
      let continueRefresh!: () => void;
      let markRefreshFinished!: () => void;
      let refreshFinished = false;
      const refreshStarted = new Promise<void>((resolve) => { beginRefresh = resolve; });
      const finished = new Promise<void>((resolve) => { markRefreshFinished = resolve; });
      const { controller, executeCommand } = commandSetup(response, async (gameId, minimumVersion) => {
        expect(gameId).toBe('game-1');
        expect(minimumVersion).toBe(response.version);
        beginRefresh();
        await new Promise<void>((resolve) => { continueRefresh = resolve; });
        refreshFinished = true;
        markRefreshFinished();
      });

      const command = controller.command(user, 'game-1', 'start' as never, 'idem-start', {} as never);
      await refreshStarted;
      await expect(command).resolves.toBe(response);
      expect(executeCommand).toHaveBeenCalledTimes(1);
      expect(refreshFinished).toBe(false);
      continueRefresh();
      await finished;
      expect(refreshFinished).toBe(true);
    });

    it('does not refresh for an idempotent replay or a failed command', async () => {
      const refreshGameSubscribers = jest.fn().mockResolvedValue(undefined);
      const replay = { gameId: 'game-1', state: 'LIVE', version: 3, replayed: true };
      const replaySetup = commandSetup(replay, refreshGameSubscribers);
      await expect(replaySetup.controller.command(user, 'game-1', 'start' as never, 'idem-start', {} as never))
        .resolves.toBe(replay);
      expect(refreshGameSubscribers).not.toHaveBeenCalled();

      const error = new Error('command rejected');
      const failed = commandSetup(undefined, refreshGameSubscribers);
      failed.executeCommand.mockRejectedValueOnce(error);
      await expect(failed.controller.command(user, 'game-1', 'start' as never, 'idem-start', {} as never))
        .rejects.toBe(error);
      expect(refreshGameSubscribers).not.toHaveBeenCalled();
    });

    it('logs a failed async refresh without changing the committed response', async () => {
      const response = { gameId: 'game-1', state: 'LIVE', version: 3, replayed: false };
      let refreshSettled!: () => void;
      const settled = new Promise<void>((resolve) => { refreshSettled = resolve; });
      const { controller, warn } = commandSetup(response, async () => {
        try {
          throw new Error('socket refresh unavailable');
        } finally {
          refreshSettled();
        }
      });

      await expect(controller.command(user, 'game-1', 'start' as never, 'idem-start', {} as never))
        .resolves.toBe(response);
      await settled;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ gameId: 'game-1', err: expect.any(Error) }),
        'Game subscriber refresh failed',
      );
    });
  });
});
