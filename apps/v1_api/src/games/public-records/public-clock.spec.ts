import { computeElapsedMs, resolveEndedPeriods, resolveLiveClock, resolvePeriodBreak } from './public-clock';

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

describe('resolvePeriodBreak', () => {
  it('피리어드가 없으면(게임 미생성) null', () => {
    expect(resolvePeriodBreak([])).toBeNull();
  });

  it('LIVE 피리어드가 있으면 다른 상태와 무관하게 null (clock을 우선한다)', () => {
    const result = resolvePeriodBreak([
      { number: 1, state: 'ENDED', startedAt: new Date(), pausedTotalMs: 0, pausedAt: null },
      { number: 2, state: 'LIVE', startedAt: new Date(), pausedTotalMs: 0, pausedAt: null },
    ]);
    expect(result).toBeNull();
  });

  it('LIVE 피리어드가 없고 HALFTIME 피리어드가 있으면 halftime', () => {
    const result = resolvePeriodBreak([
      { number: 1, state: 'ENDED', startedAt: new Date(), pausedTotalMs: 0, pausedAt: null },
      { number: 2, state: 'HALFTIME', startedAt: null, pausedTotalMs: 0, pausedAt: null },
    ]);
    expect(result).toBe('halftime');
  });

  it('모든 피리어드가 ENDED면 regulation_ended', () => {
    const result = resolvePeriodBreak([
      { number: 1, state: 'ENDED', startedAt: new Date(), pausedTotalMs: 0, pausedAt: null },
      { number: 2, state: 'ENDED', startedAt: new Date(), pausedTotalMs: 0, pausedAt: null },
    ]);
    expect(result).toBe('regulation_ended');
  });

  it('전부 SCHEDULED(킥오프 전)면 null — 하프타임으로 오판하지 않는다', () => {
    const result = resolvePeriodBreak([
      { number: 1, state: 'SCHEDULED', startedAt: null, pausedTotalMs: 0, pausedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, pausedTotalMs: 0, pausedAt: null },
    ]);
    expect(result).toBeNull();
  });
});

describe('resolveEndedPeriods — 끝난 피리어드가 실제로 진행된 시간', () => {
  const at = (minutes: number, seconds = 0) => new Date(Date.UTC(2026, 7, 10, 12, minutes, seconds));

  it('설정 길이가 아니라 시작~종료 시각으로 잰다 — 20분 경기를 5분에 끝냈으면 5분이다', () => {
    const result = resolveEndedPeriods([
      { number: 1, state: 'ENDED', startedAt: at(0), endedAt: at(5), pausedTotalMs: 0, pausedAt: null },
      { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null },
    ]);
    expect(result).toEqual([{ periodNumber: 1, elapsedMs: 5 * 60_000 }]);
  });

  it('일시 중지 구간은 뺀다 — 끝나기 직전 시계가 보여 준 값과 같다', () => {
    const result = resolveEndedPeriods([
      { number: 1, state: 'ENDED', startedAt: at(0), endedAt: at(22), pausedTotalMs: 2 * 60_000, pausedAt: null },
    ]);
    expect(result).toEqual([{ periodNumber: 1, elapsedMs: 20 * 60_000 }]);
  });

  it('피리어드 번호 순으로 돌려주고, 아직 안 끝난 행·시각을 모르는 행은 뺀다', () => {
    const result = resolveEndedPeriods([
      { number: 3, state: 'LIVE', startedAt: at(40), endedAt: null, pausedTotalMs: 0, pausedAt: null },
      { number: 2, state: 'ENDED', startedAt: at(25), endedAt: at(45), pausedTotalMs: 0, pausedAt: null },
      { number: 1, state: 'ENDED', startedAt: at(0), endedAt: at(20), pausedTotalMs: 0, pausedAt: null },
      { number: 4, state: 'ENDED', startedAt: at(50), endedAt: null, pausedTotalMs: 0, pausedAt: null },
      { number: 5, state: 'ENDED', startedAt: null, endedAt: at(60), pausedTotalMs: 0, pausedAt: null },
    ]);
    expect(result).toEqual([
      { periodNumber: 1, elapsedMs: 20 * 60_000 },
      { periodNumber: 2, elapsedMs: 20 * 60_000 },
    ]);
  });

  it('endedAt 을 채우지 않는 호출부(옛 select)에서는 빈 목록이다', () => {
    expect(
      resolveEndedPeriods([{ number: 1, state: 'ENDED', startedAt: at(0), pausedTotalMs: 0, pausedAt: null }]),
    ).toEqual([]);
  });
});
