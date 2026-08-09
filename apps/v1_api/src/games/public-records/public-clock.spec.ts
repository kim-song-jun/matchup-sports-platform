import { computeElapsedMs, resolveLiveClock } from './public-clock';

describe('computeElapsedMs', () => {
  it('일시정지 없이 5분이 지났으면 300000ms를 반환한다', () => {
    const elapsed = computeElapsedMs({
      nowMs: 5 * 60_000,
      periodStartedAtMs: 0,
      pausedTotalMs: 0,
      pausedAtMs: null,
    });
    expect(elapsed).toBe(5 * 60_000);
  });

  it('완료된 일시정지 구간(pausedTotalMs)은 경과 시간에서 제외한다', () => {
    const elapsed = computeElapsedMs({
      nowMs: 10 * 60_000,
      periodStartedAtMs: 0,
      pausedTotalMs: 2 * 60_000,
      pausedAtMs: null,
    });
    expect(elapsed).toBe(8 * 60_000);
  });

  it('현재 일시정지 중이면 pausedAtMs 시점에서 시간이 멈춘다 (now가 흘러도 안 늘어남)', () => {
    const pausedAtMs = 5 * 60_000;
    const elapsed = computeElapsedMs({
      nowMs: 20 * 60_000, // 시계가 계속 흘러도
      periodStartedAtMs: 0,
      pausedTotalMs: 0,
      pausedAtMs,
    });
    expect(elapsed).toBe(pausedAtMs);
  });

  it('음수로 떨어지지 않도록 0에서 clamp한다', () => {
    const elapsed = computeElapsedMs({
      nowMs: 0,
      periodStartedAtMs: 10_000,
      pausedTotalMs: 0,
      pausedAtMs: null,
    });
    expect(elapsed).toBe(0);
  });
});

describe('resolveLiveClock', () => {
  const now = new Date('2026-08-10T12:10:00.000Z');

  it('LIVE 피리어드가 없으면 null (킥오프 전/피리어드 사이 휴식/종료 후)', () => {
    expect(resolveLiveClock([], now)).toBeNull();
    expect(
      resolveLiveClock(
        [{ number: 1, state: 'ENDED', startedAt: new Date('2026-08-10T12:00:00.000Z'), pausedTotalMs: 0, pausedAt: null }],
        now,
      ),
    ).toBeNull();
  });

  it('LIVE 피리어드의 경과 시간과 피리어드 번호를 반환한다', () => {
    const result = resolveLiveClock(
      [
        { number: 1, state: 'ENDED', startedAt: new Date('2026-08-10T11:00:00.000Z'), pausedTotalMs: 0, pausedAt: null },
        { number: 2, state: 'LIVE', startedAt: new Date('2026-08-10T12:00:00.000Z'), pausedTotalMs: 0, pausedAt: null },
      ],
      now,
    );
    expect(result).toEqual({ periodNumber: 2, elapsedMs: 10 * 60_000, isPaused: false });
  });

  it('현재 일시정지 중이면 isPaused=true를 함께 반환한다', () => {
    const result = resolveLiveClock(
      [
        {
          number: 1,
          state: 'LIVE',
          startedAt: new Date('2026-08-10T12:00:00.000Z'),
          pausedTotalMs: 0,
          pausedAt: new Date('2026-08-10T12:05:00.000Z'),
        },
      ],
      now,
    );
    expect(result).toEqual({ periodNumber: 1, elapsedMs: 5 * 60_000, isPaused: true });
  });

  it('startedAt이 없는 LIVE 행(있어서는 안 되는 상태)은 크래시 대신 null로 안전하게 떨어진다', () => {
    const result = resolveLiveClock(
      [{ number: 1, state: 'LIVE', startedAt: null, pausedTotalMs: 0, pausedAt: null }],
      now,
    );
    expect(result).toBeNull();
  });
});
