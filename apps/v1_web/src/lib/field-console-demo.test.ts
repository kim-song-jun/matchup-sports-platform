import { describe, expect, it } from 'vitest';
import { appendFieldDemoEvent, commandFieldDemo, createFieldDemo } from './field-console-demo';

describe('필드 담당자 샘플 경기', () => {
  it('시작 → 일시 중지 → 재개 → 전반 종료 → 후반 시작 → 후반 종료 → 경기 종료', () => {
    let state = createFieldDemo();
    const command = (name: Parameters<typeof commandFieldDemo>[1], now?: string) => {
      state = commandFieldDemo(state, name, state.game.version, now);
    };
    command('start', '2026-11-08T00:00:00Z');
    command('pause', '2026-11-08T00:01:00Z');
    command('resume', '2026-11-08T00:02:00Z');
    expect(state.game.periods[0].pausedTotalMs).toBe(60000);
    command('end-period');
    expect(state.game.periods.map((p) => p.state)).toEqual(['ENDED', 'HALFTIME']);
    command('start-period'); command('end-period'); command('end');
    expect(state.game.state).toBe('ENDED');
    expect(state.game.periods.every((p) => p.state === 'ENDED')).toBe(true);
  });
  it('시작 전 기록, 중단 중 기록과 오래된 명령은 성공 처리하지 않는다', () => {
    const sample = createFieldDemo();
    const event = { type: 'GOAL' as const, period: 1, clockMs: 0, occurredAt: new Date().toISOString(), payload: {} };
    expect(() => appendFieldDemoEvent(sample, event)).toThrow('시작');
    const live = commandFieldDemo(sample, 'start', 1);
    expect(() => commandFieldDemo(live, 'pause', 1)).toThrow('상태가 변경');
    const paused = commandFieldDemo(live, 'pause', live.game.version);
    expect(() => appendFieldDemoEvent(paused, event)).toThrow('재개');
    expect(sample.game.state).toBe('SCHEDULED');
  });
  it('득점·카드·교체·정정 기록을 순서대로 반영하고 원본은 보존한다', () => {
    let state = commandFieldDemo(createFieldDemo(), 'start', 1);
    const sideId = state.game.sides[0].id;
    const [starter, , , , , substitute] = state.game.lineups[0].participants;
    const input = { sideId, participantId: starter.id, period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {} };
    for (const type of ['GOAL', 'CARD', 'SUBSTITUTION'] as const) {
      state = appendFieldDemoEvent(state, { ...input, type, payload: type === 'CARD' ? { card: 'YELLOW' } : type === 'SUBSTITUTION' ? { outParticipantId: starter.id } : {}, participantId: type === 'SUBSTITUTION' ? substitute.id : starter.id });
    }
    state = appendFieldDemoEvent(state, { ...input, type: 'CORRECTION', reversesEventId: state.events[0].id });
    expect(state.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(state.events[3].reversesEventId).toBe(state.events[0].id);
    expect(state.game.lastSequence).toBe(4);
    expect(state.game.lineups[0].participants[0].started).toBe(true);
  });
});
