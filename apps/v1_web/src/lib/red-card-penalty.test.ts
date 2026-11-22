import { describe, expect, it } from 'vitest';
import { RED_CARD_PENALTY_MS, deriveRedCardPenalties, formatPenaltyRemaining } from './red-card-penalty';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { GameEventRecord } from '@/types/game-operations';

const HOME = 'side-home';
const AWAY = 'side-away';
const MIN = 60_000;
// 전·후반 각 20분인 풋살 경기.
const lengthOf = (period: number) => (period === 1 || period === 2 ? 20 * MIN : null);

let seq = 0;
function event(
  type: GameEventRecord['type'],
  sideId: string,
  period: number,
  clockMs: number,
  overrides: Partial<GameEventRecord> = {},
): GameEventRecord {
  seq += 1;
  return {
    id: `e${seq}`,
    gameId: 'g-1',
    sequence: seq,
    clientEventId: `c${seq}`,
    payloadHash: 'h',
    type,
    sideId,
    participantId: `p-${sideId}-${seq}`,
    assistParticipantId: null,
    period,
    clockMs,
    occurredAt: '2026-11-22T00:00:00.000Z',
    receivedAt: '2026-11-22T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
    payload: {},
    ...overrides,
  };
}
const red = (sideId: string, period: number, clockMs: number, overrides: Partial<GameEventRecord> = {}) =>
  event('CARD', sideId, period, clockMs, { payload: { card: 'RED' }, ...overrides });
const yellow = (sideId: string, period: number, clockMs: number) =>
  event('CARD', sideId, period, clockMs, { payload: { card: 'YELLOW' } });
const goal = (sideId: string, period: number, clockMs: number, overrides: Partial<GameEventRecord> = {}) =>
  event('GOAL', sideId, period, clockMs, overrides);
const reversal = (target: GameEventRecord) =>
  event('CORRECTION', target.sideId ?? HOME, target.period, target.clockMs, { reversesEventId: target.id });

function derive(
  events: GameEventRecord[],
  now: { period: number; clockMs: number },
  extra: Partial<Parameters<typeof deriveRedCardPenalties>[0]> = {},
) {
  return deriveRedCardPenalties({ events, now, periodLengthMs: lengthOf, ...extra });
}

describe('deriveRedCardPenalties — 퇴장 뒤 2분 패널티', () => {
  it('퇴장한 순간에는 2분이 남고 시간이 흐르면 줄어든다', () => {
    const r = red(HOME, 1, 8 * MIN + 12_000);

    expect(derive([r], { period: 1, clockMs: 8 * MIN + 12_000 })).toEqual([
      expect.objectContaining({ key: r.id, sideId: HOME, remainingMs: RED_CARD_PENALTY_MS }),
    ]);
    expect(derive([r], { period: 1, clockMs: 8 * MIN + 12_000 + 37_000 })[0]?.remainingMs).toBe(RED_CARD_PENALTY_MS - 37_000);
  });

  it('2분이 지나면 목록에서 사라진다(정확히 2분째부터)', () => {
    const r = red(HOME, 1, 5 * MIN);

    expect(derive([r], { period: 1, clockMs: 7 * MIN - 1 })).toHaveLength(1);
    expect(derive([r], { period: 1, clockMs: 7 * MIN })).toEqual([]);
    expect(derive([r], { period: 1, clockMs: 15 * MIN })).toEqual([]);
  });

  it('상대 팀이 득점하면 사라진다 — 같은 팀의 골과 옐로카드는 영향이 없다', () => {
    const r = red(HOME, 1, 5 * MIN);
    const now = { period: 1, clockMs: 5 * MIN + 30_000 };

    expect(derive([r, goal(AWAY, 1, 5 * MIN + 20_000)], now)).toEqual([]);
    expect(derive([r, goal(HOME, 1, 5 * MIN + 20_000)], now)).toHaveLength(1);
    expect(derive([r, yellow(AWAY, 1, 5 * MIN + 20_000)], now)).toHaveLength(1);
  });

  it('퇴장한 팀 선수의 자책골은 상대 득점이라 패널티를 끝낸다 — 상대 선수의 자책골은 끝내지 않는다', () => {
    const r = red(HOME, 1, 5 * MIN);
    const now = { period: 1, clockMs: 5 * MIN + 30_000 };
    // 자책골은 점수를 받는 팀(sideId)으로 기록된다.
    const homeOwnGoal = event('OWN_GOAL', AWAY, 1, 5 * MIN + 10_000);
    const awayOwnGoal = event('OWN_GOAL', HOME, 1, 5 * MIN + 10_000);

    expect(derive([r, homeOwnGoal], now)).toEqual([]);
    expect(derive([r, awayOwnGoal], now)).toHaveLength(1);
  });

  it('퇴장보다 먼저 들어간 상대 골이나 패널티가 끝난 뒤의 골은 영향이 없다', () => {
    const r = red(HOME, 1, 10 * MIN);

    expect(derive([goal(AWAY, 1, 9 * MIN), r], { period: 1, clockMs: 10 * MIN + 30_000 })).toHaveLength(1);
    // 2분이 지난 뒤의 골은 이미 끝난 패널티를 다시 끝내지 않고, 새 퇴장도 없으니 목록은 빈다.
    expect(derive([r, goal(AWAY, 1, 13 * MIN)], { period: 1, clockMs: 13 * MIN + 10_000 })).toEqual([]);
  });

  it('퇴장이 둘이면 상대 골 1개는 먼저 퇴장한 한 명분만 끝낸다', () => {
    const first = red(HOME, 1, 8 * MIN);
    const second = red(HOME, 1, 8 * MIN + 30_000);
    const now = { period: 1, clockMs: 9 * MIN };

    const afterOneGoal = derive([first, second, goal(AWAY, 1, 8 * MIN + 45_000)], now);
    expect(afterOneGoal.map((p) => p.key)).toEqual([second.id]);
    expect(derive([first, second, goal(AWAY, 1, 8 * MIN + 45_000), goal(AWAY, 1, 8 * MIN + 50_000)], now)).toEqual([]);
  });

  it('두 팀이 각각 퇴장해도 서로의 골로만 끝난다', () => {
    const homeRed = red(HOME, 1, 5 * MIN);
    const awayRed = red(AWAY, 1, 5 * MIN + 10_000);
    const now = { period: 1, clockMs: 5 * MIN + 40_000 };

    const result = derive([homeRed, awayRed, goal(AWAY, 1, 5 * MIN + 20_000)], now);
    // 원정 골은 홈의 퇴장만 끝낸다 — 원정의 퇴장은 남는다.
    expect(result.map((p) => p.key)).toEqual([awayRed.id]);
  });

  it('취소한 레드카드는 없던 것으로 보고, 취소한 상대 골은 패널티를 되살린다', () => {
    const r = red(HOME, 1, 5 * MIN);
    const g = goal(AWAY, 1, 5 * MIN + 20_000);
    const now = { period: 1, clockMs: 5 * MIN + 40_000 };

    expect(derive([r, reversal(r)], now)).toEqual([]);
    expect(derive([r, g], now)).toEqual([]);
    expect(derive([r, g, reversal(g)], now)).toHaveLength(1);
  });

  it('전반에 받은 퇴장은 후반에 이어서 센다', () => {
    const r = red(HOME, 1, 19 * MIN + 30_000);

    // 전반 남은 30초 + 후반 0:45 = 1분 15초가 흘렀다.
    expect(derive([r], { period: 2, clockMs: 45_000 })[0]?.remainingMs).toBe(RED_CARD_PENALTY_MS - 75_000);
    expect(derive([r], { period: 2, clockMs: 90_000 })).toEqual([]);
  });

  it('하프타임(전반 끝 시점)에는 멈춘 값을 그대로 보여 준다', () => {
    const r = red(HOME, 1, 19 * MIN + 30_000);

    expect(derive([r], { period: 1, clockMs: 20 * MIN })[0]?.remainingMs).toBe(RED_CARD_PENALTY_MS - 30_000);
  });

  it('피리어드 길이를 모르면 경계를 넘는 패널티는 계산하지 않는다(값을 지어내지 않는다)', () => {
    const r = red(HOME, 1, 19 * MIN + 30_000);

    expect(derive([r], { period: 2, clockMs: 10_000 }, { periodLengthMs: () => null })).toEqual([]);
    // 같은 피리어드 안이면 길이를 몰라도 계산한다.
    expect(derive([r], { period: 1, clockMs: 19 * MIN + 40_000 }, { periodLengthMs: () => null })).toHaveLength(1);
  });

  it('정정된 시각을 따른다 — 레드카드를 1분 늦게 정정하면 남은 시간이 그만큼 는다', () => {
    const r = red(HOME, 1, 5 * MIN);
    const now = { period: 1, clockMs: 6 * MIN };

    expect(derive([r], now)[0]?.remainingMs).toBe(MIN);
    expect(derive([r], now, { clockMsOf: (e) => (e.id === r.id ? 6 * MIN : e.clockMs) })[0]?.remainingMs).toBe(2 * MIN);
  });

  it('선수 지정 없이 팀만 있는 레드카드도 그 팀의 패널티로 본다 — 팀이 없으면 무시한다', () => {
    const anonymous = red(HOME, 1, 5 * MIN, { participantId: null });
    const noSide = red(HOME, 1, 5 * MIN, { sideId: null });

    expect(derive([anonymous], { period: 1, clockMs: 5 * MIN })[0]).toEqual(
      expect.objectContaining({ participantId: null, sideId: HOME }),
    );
    expect(derive([noSide], { period: 1, clockMs: 5 * MIN })).toEqual([]);
  });

  describe('서버 확정 전(대기·전송 중) 항목', () => {
    const queued = (
      clientEventId: string,
      status: QueuedGameEvent['status'],
      type: string,
      sideId: string,
      period: number,
      clockMs: number,
      payload: Record<string, unknown> = {},
    ): QueuedGameEvent => ({
      clientEventId,
      gameId: 'g-1',
      expectedVersion: 1,
      event: { type, sideId, participantId: 'p-q', period, clockMs, occurredAt: '', payload },
      payloadHash: 'h',
      status,
      queuedAt: '',
      attempts: 0,
      lastError: null,
      ackedSequence: null,
      ackedVersion: null,
    });

    it('방금 기록한 레드카드·상대 골은 서버 확정 전이어도 반영한다', () => {
      const now = { period: 1, clockMs: 5 * MIN + 30_000 };
      const queuedRed = queued('q-red', 'queued', 'CARD', HOME, 1, 5 * MIN, { card: 'RED' });
      const queuedGoal = queued('q-goal', 'sending', 'GOAL', AWAY, 1, 5 * MIN + 20_000);

      expect(derive([], now, { queuedItems: [queuedRed] })).toEqual([expect.objectContaining({ key: 'q-red' })]);
      expect(derive([], now, { queuedItems: [queuedRed, queuedGoal] })).toEqual([]);
    });

    it('실패했거나 이미 확정된 큐 항목은 넣지 않고, 로그에 있는 항목이 큐에도 남아 있어도 두 번 세지 않는다', () => {
      const now = { period: 1, clockMs: 5 * MIN + 30_000 };
      const logged = red(HOME, 1, 5 * MIN);

      expect(derive([], now, { queuedItems: [queued('q1', 'failed', 'CARD', HOME, 1, 5 * MIN, { card: 'RED' })] })).toEqual([]);
      expect(derive([], now, { queuedItems: [queued('q2', 'acked', 'CARD', HOME, 1, 5 * MIN, { card: 'RED' })] })).toEqual([]);
      const dup = { ...queued(logged.clientEventId, 'sending', 'CARD', HOME, 1, 5 * MIN, { card: 'RED' }) };
      expect(derive([logged], now, { queuedItems: [dup] })).toHaveLength(1);
    });
  });
});

describe('formatPenaltyRemaining', () => {
  it('올림한 초를 분:초로 보여 준다', () => {
    expect(formatPenaltyRemaining(RED_CARD_PENALTY_MS)).toBe('2:00');
    expect(formatPenaltyRemaining(83_000)).toBe('1:23');
    expect(formatPenaltyRemaining(82_001)).toBe('1:23');
    expect(formatPenaltyRemaining(1)).toBe('0:01');
    expect(formatPenaltyRemaining(0)).toBe('0:00');
    expect(formatPenaltyRemaining(-500)).toBe('0:00');
  });
});
