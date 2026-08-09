import { describe, expect, it } from 'vitest';
import {
  elapsedMatchMs,
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

  // alpha 실사고(2026-08) 근본 원인 재현: 서버 처리시간이 홀수 ms면
  // `sampleOffsetMs`가 `.5`를 낳고, 그 소수가 `serverAlignedNowMs` →
  // `elapsedMatchMs` → `freezeCapture()`의 `clockMs`까지 그대로 전파돼 서버
  // `parseGameEvent`(`Number.isSafeInteger` 요구, `realtime.gateway.ts`)에
  // `VALIDATION_ERROR`로 거부됐다 — 옐로카드/파울 기록이 원인 불명으로 실패한
  // 정체. 이 함수의 반환값이 앱 전체로 나가는 유일한 지점이므로 여기서
  // 정수임을 못박는다.
  it('서버 처리시간이 홀수 ms라 소수 offset이 나와도 정수로 반올림한다', () => {
    // clientSentAt=0, clientReceivedAt=80 (왕복 80ms, 짝수라 그 자체는 소수를
    // 안 만든다) — serverReceivedAt=1000, serverSentAt=1001(처리시간 1ms,
    // 홀수) → 서버 중간점 1000.5 → offset = 1000.5 - 40 = 960.5.
    const oddServerProcessing: ClockPingPong = {
      clientSentAt: 0,
      clientReceivedAt: 80,
      serverReceivedAt: 1_000,
      serverSentAt: 1_001,
    };
    expect(Number.isInteger(sampleOffsetMs(oddServerProcessing))).toBe(false); // 전제: 실제로 소수다
    expect(Number.isSafeInteger(medianOffsetMs([oddServerProcessing]))).toBe(true);
  });

  it('짝수 개 샘플의 중앙값(두 값의 평균)이 소수여도 정수로 반올림한다', () => {
    const samples = [sample(100), sample(101)]; // 중앙값 = (100+101)/2 = 100.5
    expect(Number.isSafeInteger(medianOffsetMs(samples))).toBe(true);
  });
});

describe('serverAlignedNowMs', () => {
  it('adds the offset to the client clock', () => {
    expect(serverAlignedNowMs(1_000, 250)).toBe(1_250);
    expect(serverAlignedNowMs(1_000, -250)).toBe(750);
  });
});

describe('elapsedMatchMs', () => {
  it('with no pause, matches plain now-minus-start', () => {
    expect(
      elapsedMatchMs({ referenceNowMs: 10_500, periodStartedAtMs: 5_000, pausedTotalMs: 0, pausedAtMs: null }),
    ).toBe(5_500);
  });

  it('subtracts a single completed pause segment (pausedTotalMs)', () => {
    // Period ran 0 -> 10_000, but 3_000 of that was a completed pause.
    expect(
      elapsedMatchMs({ referenceNowMs: 10_000, periodStartedAtMs: 0, pausedTotalMs: 3_000, pausedAtMs: null }),
    ).toBe(7_000);
  });

  it('a currently-open pause segment (pausedAtMs set) freezes the elapsed time — it does not keep growing as referenceNowMs advances', () => {
    const periodStartedAtMs = 0;
    const pausedAtMs = 6_000; // paused at the 6s mark
    const atPauseStart = elapsedMatchMs({ referenceNowMs: 6_000, periodStartedAtMs, pausedTotalMs: 0, pausedAtMs });
    const fiveSecondsIntoPause = elapsedMatchMs({
      referenceNowMs: 11_000,
      periodStartedAtMs,
      pausedTotalMs: 0,
      pausedAtMs,
    });
    expect(atPauseStart).toBe(6_000);
    expect(fiveSecondsIntoPause).toBe(6_000);
  });

  it('multiple pause/resume cycles accumulate additively — not just the most recent one', () => {
    // Cycle 1: paused 0..2_000 (2_000ms), folded into pausedTotalMs on resume.
    // Cycle 2: paused 5_000..7_000 (2_000ms), folded into pausedTotalMs on resume.
    // Total paused = 4_000ms across TWO completed cycles. A bug that only
    // remembered the last cycle (overwrite instead of increment) would give
    // 2_000 here instead of 4_000.
    const pausedTotalMsAfterBothCycles = 2_000 + 2_000;
    expect(
      elapsedMatchMs({
        referenceNowMs: 10_000,
        periodStartedAtMs: 0,
        pausedTotalMs: pausedTotalMsAfterBothCycles,
        pausedAtMs: null,
      }),
    ).toBe(10_000 - 4_000);
  });

  it('clamps to 0 instead of going negative', () => {
    expect(
      elapsedMatchMs({ referenceNowMs: 1_000, periodStartedAtMs: 5_000, pausedTotalMs: 0, pausedAtMs: null }),
    ).toBe(0);
    // Pathological: pausedTotalMs alone would overshoot past referenceNowMs - start.
    expect(
      elapsedMatchMs({ referenceNowMs: 10_000, periodStartedAtMs: 0, pausedTotalMs: 50_000, pausedAtMs: null }),
    ).toBe(0);
  });
});

describe('freezeCapture', () => {
  it('computes elapsed period time from the server-aligned instant', () => {
    const capture = freezeCapture({
      clientNowMs: 10_000,
      offsetMs: 500,
      period: 1,
      periodStartedAtMs: 5_000,
      pausedTotalMs: 0,
      pausedAtMs: null,
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
      pausedTotalMs: 0,
      pausedAtMs: null,
    });
    expect(capture.clockMs).toBe(0);
  });

  it('two captures for the same tap read the same value only if the caller reuses the returned object (freeze semantics)', () => {
    // freezeCapture itself has no internal clock/timer state -- calling it
    // again with a LATER clientNowMs produces a DIFFERENT value. It is the
    // caller's responsibility to call it once per tap and hold the result
    // ("frozen") until commit/cancel, not to keep re-deriving it.
    const first = freezeCapture({
      clientNowMs: 10_000,
      offsetMs: 0,
      period: 1,
      periodStartedAtMs: 0,
      pausedTotalMs: 0,
      pausedAtMs: null,
    });
    const second = freezeCapture({
      clientNowMs: 12_000,
      offsetMs: 0,
      period: 1,
      periodStartedAtMs: 0,
      pausedTotalMs: 0,
      pausedAtMs: null,
    });
    expect(first.clockMs).not.toBe(second.clockMs);
  });

  it('excludes a completed pause segment from the captured clockMs — the display and the write use the same math', () => {
    const capture = freezeCapture({
      clientNowMs: 10_000,
      offsetMs: 0,
      period: 1,
      periodStartedAtMs: 0,
      pausedTotalMs: 3_000,
      pausedAtMs: null,
    });
    expect(capture.clockMs).toBe(7_000);
  });

  it('captured while still paused (pausedAtMs set) reads the frozen-at-pause value, not the live clock', () => {
    // Paused at the 6s mark; tapping an action button 4s after that (still
    // paused, e.g. recording a card during a stoppage) must freeze at 6s,
    // not 10s -- confirming operators can capture events mid-pause without
    // the paused stretch leaking into clockMs.
    const capture = freezeCapture({
      clientNowMs: 10_000,
      offsetMs: 0,
      period: 1,
      periodStartedAtMs: 0,
      pausedTotalMs: 0,
      pausedAtMs: 6_000,
    });
    expect(capture.clockMs).toBe(6_000);
  });

  // alpha 실사고(2026-08): offsetMs가 소수면 이 값(서버로 전송되는 clockMs)도
  // 소수가 되고, 서버는 `Number.isSafeInteger`를 요구해 거부한다
  // (`realtime.gateway.ts`의 `isSafeNonnegative`). `medianOffsetMs()`가 이제
  // 항상 정수를 돌려주므로(위 describe 참고) 여기 들어오는 offsetMs는
  // 실전에서 항상 정수지만, 이 테스트는 그 계약을 "clockMs 자체가 정수인가"
  // 라는 실제 증상 수준에서 한 번 더 못박는다.
  it('정수 offsetMs가 들어오면 clockMs도 항상 safe integer다(서버 계약)', () => {
    const capture = freezeCapture({
      clientNowMs: 1_754_600_000_000,
      offsetMs: 960, // medianOffsetMs가 반올림해 돌려주는 형태(정수)
      period: 2,
      periodStartedAtMs: 1_754_573_000_500, // 서버가 준 시각도 정수 ms
      pausedTotalMs: 12_345,
      pausedAtMs: null,
    });
    expect(Number.isSafeInteger(capture.clockMs)).toBe(true);
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
