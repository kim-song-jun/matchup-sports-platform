/**
 * Task 21 — server-aligned clock for the live operations console.
 *
 * Implements the "Frozen realtime contract" time-sync rule: "UI uses median
 * offset of the latest five samples". Also implements the freeze-on-tap
 * capture: "Player tap must visibly freeze the captured match time until the
 * event is committed or explicitly cancelled" — `freezeCapture()` computes
 * that one instant; the caller (the console component) holds the RETURNED
 * value in state rather than re-deriving it from a ticking clock, which is
 * what makes it "frozen".
 *
 * All pure/deterministic — no `Date.now()`/timers are read internally, they
 * are always passed in, so this is fully unit-testable.
 */

export interface ClockPingPong {
  readonly clientSentAt: number;
  readonly serverReceivedAt: number;
  readonly serverSentAt: number;
  readonly clientReceivedAt: number;
}

/** Classic NTP-style offset estimate: assumes the request/response legs of
 * the round trip took equal time, so the server's own midpoint instant lines
 * up with the client's own round-trip midpoint instant. */
export function sampleOffsetMs(sample: ClockPingPong): number {
  const roundTripMs = sample.clientReceivedAt - sample.clientSentAt;
  const serverMidpointMs = sample.serverReceivedAt + (sample.serverSentAt - sample.serverReceivedAt) / 2;
  return serverMidpointMs - (sample.clientSentAt + roundTripMs / 2);
}

const SAMPLE_CAP = 5;

/** FIFO cap of 5 — "median offset of the latest five samples". */
export function pushClockSample(
  samples: readonly ClockPingPong[],
  sample: ClockPingPong,
): readonly ClockPingPong[] {
  const next = [...samples, sample];
  return next.length > SAMPLE_CAP ? next.slice(next.length - SAMPLE_CAP) : next;
}

export function medianOffsetMs(samples: readonly ClockPingPong[]): number {
  if (samples.length === 0) return 0;
  const offsets = samples.map(sampleOffsetMs).sort((left, right) => left - right);
  const midIndex = Math.floor(offsets.length / 2);
  return offsets.length % 2 === 0
    ? (offsets[midIndex - 1] + offsets[midIndex]) / 2
    : offsets[midIndex];
}

/** The server-aligned "now" — the value the console treats as authoritative
 * for `occurredAt`, given the client's own `Date.now()` and the currently
 * estimated offset. */
export function serverAlignedNowMs(clientNowMs: number, offsetMs: number): number {
  return clientNowMs + offsetMs;
}

export interface FrozenEventCapture {
  readonly period: number;
  /** Elapsed milliseconds since the period started, server-aligned. Never
   * negative — a clock estimate that would otherwise go negative (e.g. a
   * capture right at kickoff with a small negative offset sample) clamps to
   * 0 rather than showing a nonsensical negative match time. */
  readonly clockMs: number;
  readonly occurredAt: string;
}

/**
 * Pause-aware elapsed-time math (경과 시간 일시정지 반영, 2026-08). Shared by
 * BOTH `freezeCapture()` (what gets written to `clockMs`) and
 * `ElapsedMatchClock` (what the operator reads on screen) — see that
 * component's doc comment for why implementing this twice is exactly how
 * the two silently drift apart. `pausedTotalMs` is the sum of every
 * COMPLETED pause segment for this period (`V1GamePeriod.pausedTotalMs`);
 * `pausedAtMs` is the start of the CURRENTLY OPEN segment (server-aligned
 * ms, from `V1GamePeriod.pausedAt`) or `null` when not paused right now —
 * mirrors the backend's `pause`/`resume` fold in `games.service.ts`'s
 * `resolveOpenPause()` exactly, including the "any number of pause/resume
 * cycles accumulate" property (each completed cycle is already baked into
 * `pausedTotalMs`; only the open one, if any, is computed here relative to
 * `referenceNowMs`).
 */
export function elapsedMatchMs(input: {
  readonly referenceNowMs: number;
  readonly periodStartedAtMs: number;
  readonly pausedTotalMs: number;
  readonly pausedAtMs: number | null;
}): number {
  const openPauseMs = input.pausedAtMs === null ? 0 : Math.max(0, input.referenceNowMs - input.pausedAtMs);
  const raw = input.referenceNowMs - input.periodStartedAtMs - input.pausedTotalMs - openPauseMs;
  return Math.max(0, raw);
}

/**
 * Captures the exact instant a player was tapped, server-time-aligned. The
 * CALLER is responsible for freezing this — i.e. storing the returned value
 * in component state and rendering FROM that state, not calling this again
 * on every render — until the pending event is committed (ack) or the
 * operator explicitly cancels the capture.
 */
export function freezeCapture(input: {
  readonly clientNowMs: number;
  readonly offsetMs: number;
  readonly period: number;
  readonly periodStartedAtMs: number;
  readonly pausedTotalMs: number;
  readonly pausedAtMs: number | null;
}): FrozenEventCapture {
  const serverNowMs = serverAlignedNowMs(input.clientNowMs, input.offsetMs);
  const clockMs = elapsedMatchMs({
    referenceNowMs: serverNowMs,
    periodStartedAtMs: input.periodStartedAtMs,
    pausedTotalMs: input.pausedTotalMs,
    pausedAtMs: input.pausedAtMs,
  });
  return {
    period: input.period,
    clockMs,
    occurredAt: new Date(serverNowMs).toISOString(),
  };
}

/** Mirrors the server's own `assertClockNotDrifted()` 30s tolerance
 * (`apps/v1_api/src/games/games.service.ts`) as a client-side pre-check —
 * catches an obviously-wrong device clock BEFORE a round trip, rather than
 * only after the server rejects it with `422 CLOCK_DRIFT`. */
const CLOCK_DRIFT_TOLERANCE_MS = 30_000;

export function isClockDrifted(occurredAtIso: string, serverAlignedNowMsValue: number): boolean {
  const occurredAtMs = new Date(occurredAtIso).getTime();
  return (
    !Number.isFinite(occurredAtMs) ||
    Math.abs(serverAlignedNowMsValue - occurredAtMs) > CLOCK_DRIFT_TOLERANCE_MS
  );
}

/**
 * `m:ss` match-clock formatting, shared by every place that renders a
 * captured/recorded event's `clockMs` (the event-capture modal, the
 * recorded-event list, the live elapsed-time display). Second precision —
 * NOT millisecond: this is the match clock an operator reads at a glance,
 * and sub-second digits here would just be visual noise nobody can act on.
 * (Millisecond precision belongs to a different, narrower place: command
 * round-trip latency feedback for start/pause/resume/end, which is
 * genuinely useful to see and is surfaced separately in
 * `operate-console.tsx`'s command-duration banner, not here.)
 */
export function formatMatchClock(clockMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, clockMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
