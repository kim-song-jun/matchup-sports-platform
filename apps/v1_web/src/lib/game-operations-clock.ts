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

/**
 * alpha 실사고(2026-08): 옐로카드/파울 기록이 원인 불명의 `VALIDATION_ERROR`로
 * 거부되던 근본 원인이 이 함수였다. `sampleOffsetMs()`는 서버 처리 시간이
 * 홀수 ms면 `.5`를 낳고, 짝수 개 샘플의 중앙값(두 값의 평균)도 `.5`를 낳는다 —
 * 그 소수가 `serverAlignedNowMs` → `elapsedMatchMs` → `freezeCapture()`의
 * `clockMs`까지 그대로 전파돼, 서버 `parseGameEvent`의
 * `isSafeNonnegative`(`Number.isSafeInteger` 요구, `realtime.gateway.ts`)에
 * 걸려 거부됐다. 간헐적(왕복 지연의 홀짝에 좌우)이고, 큐에 이미 저장된 소수
 * `clockMs`는 재시도해도 똑같이 다시 실패해 "다시 시도"가 무의미했던 이유도
 * 이것이다.
 *
 * 이 함수의 반환값이 `clockOffsetMs`로 앱 코드에서 실제로 쓰이는 유일한
 * 지점이다 — `sampleOffsetMs`도 `export`돼 있지만 현재 소비자는 테스트뿐이고,
 * 앱 코드(`use-v1-game-operations-console.ts`)는 항상 `medianOffsetMs`의
 * 반환값만 읽는다 — 그래서 정수로 반올림하는 경계를 정확히 여기 하나로 몬다.
 * `freezeCapture()`(clockMs를 만드는 쪽)와 `ElapsedMatchClock`(표시하는 쪽)
 * 양쪽이 각자 반올림하면
 * 표시값과 저장값이 조용히 갈라진다 — `elapsedMatchMs`를 두 곳이 공유하게 만든
 * 것과 동일한 이유(그 함수의 docstring 참고)로, 새 반올림도 두 번 만들지
 * 않는다. `serverAlignedNowMs`(occurredAt 계산)와 `elapsedMatchMs`(clockMs
 * 계산)가 여기서 정수가 된 같은 offsetMs를 그대로 받으므로 둘은 항상 같은
 * 기준을 본다.
 */
export function medianOffsetMs(samples: readonly ClockPingPong[]): number {
  if (samples.length === 0) return 0;
  const offsets = samples.map(sampleOffsetMs).sort((left, right) => left - right);
  const midIndex = Math.floor(offsets.length / 2);
  const median = offsets.length % 2 === 0
    ? (offsets[midIndex - 1] + offsets[midIndex]) / 2
    : offsets[midIndex];
  return Math.round(median);
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
  // While paused, the elapsed time is whatever it was at the instant of the
  // pause — measured from `pausedAtMs`, not from now. Subtracting an open-pause
  // span from `now` instead looks equivalent but is not: if `referenceNowMs`
  // trails `pausedAtMs` (the client's server-offset estimate lags, or the clock
  // steps back), that span clamps to zero and the reading creeps upward while
  // the match is stopped. Anchoring to `pausedAtMs` cannot drift.
  const effectiveNowMs = input.pausedAtMs === null
    ? input.referenceNowMs
    : Math.min(input.referenceNowMs, input.pausedAtMs);
  const raw = effectiveNowMs - input.periodStartedAtMs - input.pausedTotalMs;
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

/**
 * alpha "452′" 사고(2026-08) 대응 — 운영자가 경기를 종료하지 않고 몇 시간 뒤
 * 이벤트를 하나 더 찍으면(`elapsedMatchMs`는 일시정지만 빼고 계속 흐른다)
 * `clockMs`가 그 피리어드 길이를 크게 넘는 값으로 그대로 굳는다. 서버는 이
 * 값을 절대 하드 거부하지 않는다(`game-invariants.ts`의 `validateEventShape`
 * 주석 참고 — 현장에서 늦게라도 기록하려는 시도를 막는 게 잘못된 시각이 남는
 * 것보다 나쁘다). 그래서 이 판정은 "제출을 막는" 게 아니라 "제출 직전에
 * 운영자에게 한 번 더 확인을 요구하는" 용도로만 쓴다 — `operate-console.tsx`
 * 의 커밋 직전 게이트.
 *
 * 배율(×2) 근거: `elapsedMatchMs`는 일시정지 구간을 빼고 계산하므로(이 파일의
 * `elapsedMatchMs` 문서 참고), 정상적인 경기라면 클럭은 실제로 뛴 시간만
 * 반영한다 — 하프타임 대기·우천 지연처럼 아무리 긴 휴지도 여기 반영되지
 * 않는다. 그 상태에서도 부상 처치·VAR 확인 같은 정당한 추가시간은 흔히
 * 발생하므로 살짝의 여유는 필요하지만, 설정된 피리어드 길이의 두 배를 실제로
 * "뛴" 시간이 넘는 경우는 사실상 없다(45분 피리어드가 90분어치 순수 플레이
 * 타임을 실제로 넘기는 일은 없다) — 그 정도로 크면 거의 항상 "종료를 못 눌러
 * 시계가 계속 흐른" 운영 실수다. `extraTime`(연장전 여부) 플래그는 배율을
 * 바꾸지 않는다 — 연장전은 이미 자신만의 (더 짧은) `durationMinutes`를 가진
 * 별도 피리어드 항목이라(예: `{code:'EXTRA_FIRST', durationMinutes:15,
 * extraTime:true}`), 같은 배율이 그 15분에도 그대로 비례해 적용된다. 다만
 * 어느 피리어드가 초과됐는지는 확인 문구에서 구분해 보여준다(`extraTime`을
 * 문구에만 반영, 수식엔 반영하지 않음).
 */
export const CLOCK_CONFIRM_MULTIPLIER = 2;

/** `clockMs`가 그 피리어드의 설정된 길이(`periodDurationMinutes`)의
 * `CLOCK_CONFIRM_MULTIPLIER`배를 넘는지 — true면 제출 전 운영자 확인을
 * 요구해야 한다는 뜻이다(제출 자체를 막지 않는다). */
export function isClockSuspicious(clockMs: number, periodDurationMinutes: number): boolean {
  return clockMs > periodDurationMinutes * 60_000 * CLOCK_CONFIRM_MULTIPLIER;
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

/**
 * 운영 콘솔 헤더의 큰 스톱워치 표시 *전용* 포맷터 — alpha 실측 사고("전반
 * 584:23"처럼 분이 무한히 커져 9시간 44분을 나타내는데도 스톱워치로 못
 * 읽힘) 대응. `formatMatchClock`(위)은 이벤트 캡처 모달·기록된 이벤트
 * 목록처럼 "특정 순간에 찍힌 값"을 보여주는 다른 자리들이 공유하는
 * 계약이라 그대로 두고, 이 함수는 그 계약을 재사용하지 않는 새 표시
 * 계층이다(같은 `clockMs`를 입력받지만 출력 포맷만 다르다).
 *
 * 분을 2자리로 고정 패딩하고, 60분을 넘으면 시:분:초로 롤오버한다 —
 * 자릿수가 흔들리지 않아야 흘끗 봐도 스톱워치로 읽힌다.
 */
export function formatStopwatchClock(clockMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, clockMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
