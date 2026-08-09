import { describe, expect, it } from 'vitest';
import {
  formatMatchClock,
  freezeCapture,
  isClockDrifted,
  medianOffsetMs,
  pushClockSample,
  sampleOffsetMs,
  serverAlignedNowMs,
  type ClockPingPong,
} from './game-operations-clock';

function sample(offsetMs: number, roundTripMs = 40): ClockPingPong {
  // Construct a round trip whose true offset is exactly `offsetMs`.
  const clientSentAt = 1_000_000;
  const clientReceivedAt = clientSentAt + roundTripMs;
  const serverReceivedAt = clientSentAt + roundTripMs / 2 + offsetMs;
  const serverSentAt = serverReceivedAt;
  return { clientSentAt, clientReceivedAt, serverReceivedAt, serverSentAt };
}

describe('sampleOffsetMs', () => {
  it('recovers the true offset for a symmetric round trip', () => {
    expect(sampleOffsetMs(sample(250))).toBeCloseTo(250, 5);
    expect(sampleOffsetMs(sample(-100))).toBeCloseTo(-100, 5);
    expect(sampleOffsetMs(sample(0))).toBeCloseTo(0, 5);
  });
});

describe('pushClockSample', () => {
  it('caps the retained history at 5 samples, FIFO', () => {
    let samples: readonly ClockPingPong[] = [];
    for (let i = 0; i < 8; i += 1) {
      samples = pushClockSample(samples, sample(i));
    }
    expect(samples).toHaveLength(5);
    // Only the last 5 pushes (offsets 3..7) survive.
    expect(samples.map((s) => sampleOffsetMs(s))).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('medianOffsetMs', () => {
  it('is 0 with no samples', () => {
    expect(medianOffsetMs([])).toBe(0);
  });

  it('takes the median of an odd number of samples', () => {
    const samples = [sample(100), sample(500), sample(300)];
    expect(medianOffsetMs(samples)).toBeCloseTo(300, 5);
  });

  it('averages the two middle samples for an even count', () => {
    const samples = [sample(100), sample(200), sample(300), sample(400)];
    expect(medianOffsetMs(samples)).toBeCloseTo(250, 5);
  });

  it('is resistant to one wild outlier sample (unlike a mean would be)', () => {
    const samples = [sample(100), sample(110), sample(105), sample(95), sample(100_000)];
    expect(medianOffsetMs(samples)).toBeCloseTo(105, 5);
  });
});

describe('serverAlignedNowMs', () => {
  it('adds the offset to the client clock', () => {
    expect(serverAlignedNowMs(1_000, 250)).toBe(1_250);
    expect(serverAlignedNowMs(1_000, -250)).toBe(750);
  });
});

describe('freezeCapture', () => {
  it('computes elapsed period time from the server-aligned instant', () => {
    const capture = freezeCapture({
      clientNowMs: 10_000,
      offsetMs: 500,
      period: 1,
      periodStartedAtMs: 5_000,
    });
    // serverNow = 10_000 + 500 = 10_500; elapsed = 10_500 - 5_000 = 5_500
    expect(capture.clockMs).toBe(5_500);
    expect(capture.period).toBe(1);
    expect(capture.occurredAt).toBe(new Date(10_500).toISOString());
  });

  it('clamps clockMs to 0 instead of going negative', () => {
    const capture = freezeCapture({
      clientNowMs: 1_000,
      offsetMs: -2_000, // server-aligned now is BEFORE the period start
      period: 1,
      periodStartedAtMs: 5_000,
    });
    expect(capture.clockMs).toBe(0);
  });

  it('two captures for the same tap read the same value only if the caller reuses the returned object (freeze semantics)', () => {
    // freezeCapture itself has no internal clock/timer state -- calling it
    // again with a LATER clientNowMs produces a DIFFERENT value. It is the
    // caller's responsibility to call it once per tap and hold the result
    // ("frozen") until commit/cancel, not to keep re-deriving it.
    const first = freezeCapture({ clientNowMs: 10_000, offsetMs: 0, period: 1, periodStartedAtMs: 0 });
    const second = freezeCapture({ clientNowMs: 12_000, offsetMs: 0, period: 1, periodStartedAtMs: 0 });
    expect(first.clockMs).not.toBe(second.clockMs);
  });
});

describe('isClockDrifted', () => {
  it('is false within the 30s tolerance and true beyond it', () => {
    const now = 1_000_000;
    expect(isClockDrifted(new Date(now).toISOString(), now)).toBe(false);
    expect(isClockDrifted(new Date(now + 29_000).toISOString(), now)).toBe(false);
    expect(isClockDrifted(new Date(now + 31_000).toISOString(), now)).toBe(true);
    expect(isClockDrifted(new Date(now - 31_000).toISOString(), now)).toBe(true);
  });

  it('treats an unparsable timestamp as drifted', () => {
    expect(isClockDrifted('not-a-date', Date.now())).toBe(true);
  });
});

describe('formatMatchClock', () => {
  // 실측 사고 사후조사에서 확인된 회귀: 645886/649891/652602/655603ms(전부
  // 같은 "10분대") 가 분 단위 표시("10'")로는 서로 구분되지 않았다. 초 단위로
  // 바꾸면 구분된다.
  it('구분되지 않던 같은 분대의 ms 값들을 초 단위로는 구분해서 보여준다', () => {
    const rendered = new Set([645886, 649891, 652602, 655603].map(formatMatchClock));
    expect(rendered.size).toBe(4);
  });

  it('m:ss로 포맷하고 초는 두 자리로 0을 채운다', () => {
    expect(formatMatchClock(0)).toBe('0:00');
    expect(formatMatchClock(65_000)).toBe('1:05');
    expect(formatMatchClock(600_000)).toBe('10:00');
  });

  it('음수는 0으로 클램프한다', () => {
    expect(formatMatchClock(-500)).toBe('0:00');
  });
});
