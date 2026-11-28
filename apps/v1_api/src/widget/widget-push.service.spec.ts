import { WidgetPushService } from './widget-push.service';
import type { WidgetLiveGame } from './widget-home.service';

const game = (gameId: string, patch: Partial<WidgetLiveGame> = {}): WidgetLiveGame =>
  ({
    gameId, teamId: 't1', teamName: 'A', teamLogoUrl: null, title: '경기', opponentName: 'B', opponentLogoUrl: null, competitionName: null, venueName: null,
    competitionKind: 'FRIENDLY', state: 'LIVE', startedAt: null, endedAt: null, score: { mine: 0, opponent: 0 }, penalties: null, period: null, scorers: [], ...patch,
  }) as WidgetLiveGame;

function build(live: () => WidgetLiveGame[]) {
  const prisma = {
    v1WidgetLiveActivity: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1Game: { findMany: jest.fn().mockResolvedValue([{ id: 'g1', sides: [{ teamId: 't1' }] }]) },
    v1TeamMembership: {
      // 첫 호출: 진행 중 경기 팀의 팀원(안드로이드 대상 찾기), 두 번째: 대상 사용자들의 팀 구성.
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }])
        .mockResolvedValue([{ userId: 'u1', teamId: 't1' }, { userId: 'u2', teamId: 't1' }, { userId: 'u3', teamId: 't1' }, { userId: 'u3', teamId: 't2' }]),
    },
    v1AccessToken: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]) },
    v1PushDevice: {
      findMany: jest.fn().mockResolvedValue(['u1', 'u2', 'u3'].map((userId) => ({ id: `d-${userId}`, userId, token: `fcm-${userId}`, platform: 'android' }))),
    },
  };
  const home = { liveForTeams: jest.fn(async () => live()) };
  const fcm = { isConfigured: true, send: jest.fn().mockResolvedValue({}) };
  const logger = { error: jest.fn() };
  const service = new WidgetPushService(prisma as never, home as never, {} as never, fcm as never, logger as never);
  return { service, home, fcm, logger };
}

describe('WidgetPushService.tick', () => {
  const env = process.env.V1_PUSH_ENVIRONMENT;
  beforeAll(() => { process.env.V1_PUSH_ENVIRONMENT = 'alpha'; });
  afterAll(() => { if (env === undefined) delete process.env.V1_PUSH_ENVIRONMENT; else process.env.V1_PUSH_ENVIRONMENT = env; });

  it('같은 팀 구성의 사용자는 홈 계산을 한 번만 하고, 팀 구성이 다르면 따로 한다', async () => {
    const { service, home, fcm, logger } = build(() => [game('g1')]);
    await service.tick();
    expect(logger.error).not.toHaveBeenCalled();
    expect(home.liveForTeams).toHaveBeenCalledTimes(2); // {t1}: u1·u2, {t1,t2}: u3
    expect((home.liveForTeams.mock.calls as unknown as Array<[string[]]>).map(([ids]) => ids).sort()).toEqual([['t1'], ['t1', 't2']]);
    expect(fcm.send).toHaveBeenCalledTimes(3); // 사용자마다 한 번(처음 본 경기)
  });

  it('사라진 경기의 지문은 지우고, 같은 경기가 다시 나타나면 처음처럼 다시 보낸다', async () => {
    let live = [game('g1')];
    const { service, fcm } = build(() => live);
    await service.tick();
    expect(fcm.send).toHaveBeenCalledTimes(3);
    live = [];
    await service.tick(); // 경기가 목록에서 빠짐 → 지문 정리
    live = [game('g1')];
    await service.tick();
    expect(fcm.send).toHaveBeenCalledTimes(6);
  });
});
