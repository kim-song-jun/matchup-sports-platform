import { GamesController } from './games.controller';
import type { GameBroadcastRegistry } from './game-broadcast.registry';
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
 * `game:<gameId>` 룸에는 아무것도 보내지 않았고, 구독 중인 다른 운영 콘솔은 다음 수동
 * 재조회 전까지 그 변경을 몰랐다.
 */
describe('GamesController — REST 변경의 룸 브로드캐스트', () => {
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
    const emitToGame = jest.fn();
    const service = {
      appendEvent: jest.fn().mockResolvedValue(result),
      reverseEvent: jest.fn().mockResolvedValue(result),
      assignGoalAssist: jest.fn().mockResolvedValue(result),
    } as unknown as GamesService;
    const controller = new GamesController(service, { emitToGame } as unknown as GameBroadcastRegistry);
    return { controller, emitToGame, service };
  }

  const committedResult = {
    clientEventId: 'client-1',
    sequence: 7,
    version: 12,
    event: persistedEvent,
  };

  it('appendEvent 성공 후 game.event.committed 를 해당 게임 룸에 보낸다', async () => {
    const { controller, emitToGame } = setup(committedResult);

    await controller.appendEvent(user, 'game-1', 'idem-1', {} as AppendGameEventDto);

    expect(emitToGame).toHaveBeenCalledTimes(1);
    expect(emitToGame).toHaveBeenCalledWith('game-1', 'game.event.committed', {
      gameId: 'game-1',
      sequence: 7,
      version: 12,
      event: persistedEvent,
    });
  });

  it('reverseEvent · assignGoalAssist 도 같은 이벤트를 보낸다', async () => {
    const reverse = setup(committedResult);
    await reverse.controller.reverseEvent(user, 'game-1', 'event-1', 'idem-2', {} as ReverseGameEventDto);
    expect(reverse.emitToGame).toHaveBeenCalledWith('game-1', 'game.event.committed', expect.objectContaining({ sequence: 7 }));

    const assist = setup(committedResult);
    await assist.controller.assignGoalAssist(user, 'game-1', 'event-1', 'idem-3', {} as AssignGoalAssistDto);
    expect(assist.emitToGame).toHaveBeenCalledWith('game-1', 'game.event.committed', expect.objectContaining({ sequence: 7 }));
  });

  it('영속 event가 없는 결과(구버전 멱등 replay)는 보내지 않는다', async () => {
    // `event: undefined`를 그대로 실어 보내면 수신 측 `liveEvents`에 id/reversesEventId가
    // undefined인 행이 들어가 스코어보드가 자기 골을 "이미 취소됨"으로 오판한다 —
    // games.types.ts의 `GameEventAppendResult.event` 주석에 기록된 실제 사고다.
    const { controller, emitToGame } = setup({ clientEventId: 'client-1', sequence: 7, version: 12 });

    await controller.appendEvent(user, 'game-1', 'idem-1', {} as AppendGameEventDto);

    expect(emitToGame).not.toHaveBeenCalled();
  });

  it('브로드캐스트 여부와 무관하게 서비스 결과를 그대로 반환한다', async () => {
    const { controller } = setup(committedResult);

    await expect(controller.appendEvent(user, 'game-1', 'idem-1', {} as AppendGameEventDto)).resolves.toBe(
      committedResult,
    );
  });
});
