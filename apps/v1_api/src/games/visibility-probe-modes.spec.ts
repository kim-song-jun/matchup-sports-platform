import { V1GameEventType, V1GameState, V1VisibilityMode } from '@prisma/client';
import { GamesService } from './games.service';

/**
 * `GET /games/:gameId/visibility` 가 저장된 정책 네 값을 전부 해석하는지 고정한다.
 * 이 프로브는 한때 `STATUS_ONLY` 가 아니면 전부 `live` 로 접어버려서, 운영자가
 * `OFFICIAL_ONLY` 로 제한한 경기의 진행 중 점수·라이브 이벤트·명단이 그대로 나갔다.
 */

const LINEUP_ROW = { id: 'lineup-1', sideId: 'side-home', state: 'SUBMITTED' } as const;
const LIVE_GOAL = {
  id: 'event-1',
  sequence: 1,
  type: V1GameEventType.GOAL,
  sideId: 'side-home',
  reversesEventId: null,
} as const;

function serviceWith(input: {
  readonly mode: V1VisibilityMode;
  readonly publicLive: 'on' | 'off';
  readonly officialScore: { home: number; away: number } | null;
}) {
  const prisma = {
    v1Game: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'game-1',
        state: V1GameState.LIVE,
        visibilityPolicy: {
          gameId: 'game-1',
          mode: input.mode,
          // 이미 지난 시각이라 명단 공개 자격 자체는 충족한다 — 그런데도 명단이
          // 나가면 안 되는 것이 official_only 의 계약이다.
          // 라인업 공개 시각이 지난 상태를 만든다 — 이 픽스처는 "모드가 틀리면 라인업이
          // 실제로 나간다" 를 보이는 것이 목적이라 고정 날짜가 아니라 상대 과거로 둔다.
          lineupAt: new Date(Date.now() - 60 * 60 * 1000),
          version: 0,
        },
        sides: [
          { id: 'side-home', sideKey: 'HOME' },
          { id: 'side-away', sideKey: 'AWAY' },
        ],
        lineups: [LINEUP_ROW],
        events: [LIVE_GOAL],
        currentOfficialRevision:
          input.officialScore === null ? null : { id: 'rev-1', score: input.officialScore },
      }),
    },
    v1GameOperationFlag: {
      findUnique: jest.fn().mockResolvedValue({ value: input.publicLive }),
    },
  };
  return new GamesService(prisma as never, {} as never, {} as never);
}

describe('GET /games/:gameId/visibility resolves every stored policy mode', () => {
  it('never leaks the in-progress score, live events or lineup of an OFFICIAL_ONLY game', async () => {
    const service = serviceWith({
      mode: V1VisibilityMode.OFFICIAL_ONLY,
      publicLive: 'on',
      officialScore: null,
    });

    const projection = await service.getVisibility('game-1');

    expect(projection).toEqual({
      gameId: 'game-1',
      state: V1GameState.LIVE,
      effectiveMode: 'official_only',
      scoreStatus: 'unavailable',
      lineup: null,
      score: null,
      events: [],
      records: [],
    });
  });

  it('serves the official result of an OFFICIAL_ONLY game once a revision exists', async () => {
    const service = serviceWith({
      mode: V1VisibilityMode.OFFICIAL_ONLY,
      publicLive: 'on',
      officialScore: { home: 2, away: 1 },
    });

    const projection = await service.getVisibility('game-1');

    expect(projection).toEqual(
      expect.objectContaining({
        effectiveMode: 'official_only',
        scoreStatus: 'official',
        // 이벤트로 계산한 진행 점수는 1:0 이다 — 확정본 2:1 이 나와야 한다.
        score: { home: 2, away: 1 },
        lineup: null,
      }),
    );
  });

  it('answers a HIDDEN game with the same 404 a missing game gets', async () => {
    const service = serviceWith({
      mode: V1VisibilityMode.HIDDEN,
      publicLive: 'on',
      officialScore: { home: 2, away: 1 },
    });

    await expect(service.getVisibility('game-1')).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({ code: 'GAME_NOT_FOUND' }),
    });
  });

  it('keeps STATUS_ONLY status-only and LIVE live when the kill switch is on', async () => {
    const statusOnly = await serviceWith({
      mode: V1VisibilityMode.STATUS_ONLY,
      publicLive: 'on',
      officialScore: null,
    }).getVisibility('game-1');
    const live = await serviceWith({
      mode: V1VisibilityMode.LIVE,
      publicLive: 'on',
      officialScore: null,
    }).getVisibility('game-1');

    expect(statusOnly).toEqual(
      expect.objectContaining({
        effectiveMode: 'status_only',
        scoreStatus: 'live',
        score: null,
        events: [],
        lineup: null,
      }),
    );
    expect(live).toEqual(
      expect.objectContaining({
        effectiveMode: 'live',
        scoreStatus: 'live',
        score: { home: 1, away: 0 },
        events: [LIVE_GOAL],
        lineup: [LINEUP_ROW],
      }),
    );
  });

  it('still demotes LIVE to official_only while PUBLIC_LIVE is off, and only once', async () => {
    const service = serviceWith({
      mode: V1VisibilityMode.LIVE,
      publicLive: 'off',
      officialScore: { home: 2, away: 1 },
    });

    expect(await service.getVisibility('game-1')).toEqual(
      expect.objectContaining({
        effectiveMode: 'official_only',
        score: { home: 2, away: 1 },
        lineup: null,
      }),
    );
  });
});
