/**
 * MD-QA #187 — 기록된 사건(골·카드·파울·교체)의 시각 정정, 화면 쪽 순수 계산.
 *
 * 서버 규칙(`apps/v1_api/src/games/event-time-correction.ts`)과 같은 모양을 유지한다:
 * 원본 행은 그대로 두고 `TIME_CORRECTION` 행이 원본을 가리키며 이전/새 시각·사유를 싣는다.
 * 범위(0 ~ 피리어드 설정 길이와 실제로 흐른 시간 중 큰 값)도 같은 식이고, 최종 판정은 서버가 한다.
 */
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { josa } from '@/lib/korean';
import { formatMatchClock } from '@/lib/game-operations-clock';
import type { GameEventRecord, GamePeriod } from '@/types/game-operations';

/** 시간 정정이 가능한 사건 종류 — 서버 `TIME_CORRECTABLE_EVENT_TYPES` 와 같다. */
const TIME_CORRECTABLE_TYPES: ReadonlySet<string> = new Set(['GOAL', 'OWN_GOAL', 'CARD', 'FOUL', 'SUBSTITUTION']);

export const MINUTE_STEP_MS = 60_000;
export const SECOND_STEP_MS = 10_000;

export function isTimeCorrectionRow(event: Pick<GameEventRecord, 'type'>): boolean {
  return event.type === 'TIME_CORRECTION';
}

export function isTimeCorrectableType(type: string): boolean {
  return TIME_CORRECTABLE_TYPES.has(type);
}

export interface EventTimeCorrectionStep {
  readonly previousClockMs: number;
  readonly clockMs: number;
  readonly lane: 'OPERATOR' | 'PLATFORM_ADMIN' | null;
  readonly reason: string | null;
  readonly actorUserId: string;
  readonly at: string;
}

export interface EventTimeCorrectionInfo {
  /** 처음 기록된 시각 — 정정이 여러 번이어도 가장 처음 값이다. */
  readonly originalClockMs: number;
  /** 지금 유효한 시각(가장 최근 정정). */
  readonly currentClockMs: number;
  readonly steps: readonly EventTimeCorrectionStep[];
}

/**
 * 원본 사건 id → 정정 요약. 서버가 콘솔 스냅샷에서 원본의 `clockMs` 를 이미 현재 시각으로
 * 덮어 내려주기도 하지만(overlay), 증분 수신 직후에는 옛 값일 수 있어 정정 행에서 직접 구한다.
 */
export function collectEventTimeCorrections(
  events: readonly GameEventRecord[],
): ReadonlyMap<string, EventTimeCorrectionInfo> {
  const grouped = new Map<string, GameEventRecord[]>();
  for (const event of events) {
    if (!isTimeCorrectionRow(event) || typeof event.correctsEventId !== 'string') continue;
    const list = grouped.get(event.correctsEventId) ?? [];
    list.push(event);
    grouped.set(event.correctsEventId, list);
  }
  const result = new Map<string, EventTimeCorrectionInfo>();
  for (const [eventId, rows] of grouped) {
    const ordered = [...rows].sort((left, right) => left.sequence - right.sequence);
    const steps = ordered.map<EventTimeCorrectionStep>((row) => {
      const previous = row.payload.previousClockMs;
      const lane = row.payload.lane;
      const reason = row.payload.reason;
      return {
        previousClockMs: typeof previous === 'number' ? previous : row.clockMs,
        clockMs: row.clockMs,
        lane: lane === 'OPERATOR' || lane === 'PLATFORM_ADMIN' ? lane : null,
        reason: typeof reason === 'string' && reason.length > 0 ? reason : null,
        actorUserId: row.actorUserId,
        at: row.receivedAt,
      };
    });
    result.set(eventId, {
      originalClockMs: steps[0].previousClockMs,
      currentClockMs: steps[steps.length - 1].clockMs,
      steps,
    });
  }
  return result;
}

/**
 * 정정 상한(ms). 서버 `eventClockUpperBoundMs` 와 같은 식이다 — 피리어드 설정 길이와 실제로
 * 흐른 시간(일시정지 제외) 중 큰 값. 둘 다 모르면 null(상한 없음, 서버가 판정).
 */
export function eventClockUpperBoundMs(input: {
  readonly configuredMinutes: number | null;
  readonly period: Pick<GamePeriod, 'startedAt' | 'endedAt' | 'pausedTotalMs' | 'pausedAt'> | null;
  readonly nowMs: number;
}): number | null {
  const configuredMs = input.configuredMinutes === null ? null : Math.round(input.configuredMinutes * 60_000);
  let playedMs: number | null = null;
  const period = input.period;
  if (period !== null && period.startedAt !== null) {
    const startedMs = Date.parse(period.startedAt);
    const endMs = period.endedAt === null ? input.nowMs : Date.parse(period.endedAt);
    if (Number.isFinite(startedMs) && Number.isFinite(endMs)) {
      const pausedAtMs = period.pausedAt === null ? Number.NaN : Date.parse(period.pausedAt);
      const openPauseMs =
        period.endedAt === null && Number.isFinite(pausedAtMs) ? Math.max(0, input.nowMs - pausedAtMs) : 0;
      playedMs = Math.max(0, endMs - startedMs - Math.max(0, period.pausedTotalMs) - openPauseMs);
    }
  }
  if (configuredMs === null && playedMs === null) return null;
  return Math.max(configuredMs ?? 0, playedMs ?? 0);
}

export function isClockInRange(clockMs: number, maxClockMs: number | null): boolean {
  return clockMs >= 0 && (maxClockMs === null || clockMs <= maxClockMs);
}

/**
 * 탭해서 직접 입력한 숫자를 시각(ms)으로 읽는다. 숫자 키패드에는 ':' 가 없어 숫자만 받는다:
 * 1~2자리는 분("9" → 9:00), 3자리 이상은 끝 2자리가 초("1130" → 11:30). 초가 59를 넘으면 null.
 */
export function parseTypedClock(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 6) return null;
  if (digits.length <= 2) return Number(digits) * 60_000;
  const seconds = Number(digits.slice(-2));
  const minutes = Number(digits.slice(0, -2));
  if (seconds > 59) return null;
  return minutes * 60_000 + seconds * 1000;
}

/** CTA 문구 — "11:00 → 9:00으로 정정". */
export function correctionCtaLabel(fromClockMs: number, toClockMs: number): string {
  return `${formatMatchClock(fromClockMs)} → ${josa(formatMatchClock(toClockMs), ['으로', '로'])} 정정`;
}

/** 범위 안내 문구. 상한을 모르면 서버가 판정하므로 하한만 말한다. */
export function correctionRangeHint(periodLabel: string, maxClockMs: number | null): string {
  const range =
    maxClockMs === null
      ? `${formatMatchClock(0)}부터`
      : `${formatMatchClock(0)}–${formatMatchClock(maxClockMs)} 사이에서`;
  return `${periodLabel} ${range} 고를 수 있어요. 전·후반은 바꿀 수 없어요.`;
}

export function correctionRangeError(periodLabel: string, maxClockMs: number | null): string {
  return maxClockMs === null
    ? `${periodLabel} 0:00 이후 시각으로 골라 주세요.`
    : `${periodLabel} ${formatMatchClock(0)}–${formatMatchClock(maxClockMs)} 밖이에요. 범위 안으로 맞춰 주세요.`;
}

const CORRECTION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  EVENT_TIME_UNCHANGED: '지금 기록된 시각과 같아요. 다른 시각으로 골라 주세요.',
  EVENT_CLOCK_OUT_OF_RANGE: '이 피리어드 안의 시각으로 골라 주세요.',
  EVENT_ALREADY_REVERSED: '이미 취소된 기록은 시각을 고칠 수 없어요.',
  EVENT_TIME_NOT_CORRECTABLE: '시각을 고칠 수 있는 기록이 아니에요.',
  EVENT_TIME_REASON_REQUIRED: '정정 사유를 적어 주세요.',
  GAME_EVENT_NOT_FOUND: '기록을 찾지 못했어요. 화면을 새로 고쳐 주세요.',
  RESULT_ALREADY_OFFICIAL: '결과가 이미 확정돼서 운영 콘솔에서는 고칠 수 없어요. 플랫폼 관리자에게 정정을 요청해 주세요.',
  RESULT_NOT_OFFICIAL: '아직 확정되지 않은 결과예요. 운영 콘솔에서 고쳐 주세요.',
  TERMINAL_GAME_IMMUTABLE: '취소된 경기는 기록을 고칠 수 없어요.',
  VERSION_CONFLICT: '다른 곳에서 기록이 바뀌었어요. 최신 기록을 불러온 뒤 다시 시도해 주세요.',
  PERMISSION_DENIED: '이 기록의 시각을 고칠 권한이 없어요.',
};

/** 서버 에러 코드 → 해요체 안내. 모르는 코드는 서버 메시지(해요체)나 fallback 으로 물러난다. */
export function eventTimeCorrectionErrorMessage(err: unknown): string {
  const code = extractErrorCode(err);
  if (code !== null && CORRECTION_ERROR_MESSAGES[code] !== undefined) return CORRECTION_ERROR_MESSAGES[code];
  return extractErrorMessage(err, '시각을 정정하지 못했어요. 잠시 후 다시 시도해 주세요.');
}
