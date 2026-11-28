'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Plus, Timer } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { clearExpiringDraft, readExpiringDraft, writeExpiringDraft } from '@/lib/expiring-draft';

const REST_PRESET_MINUTES = [1, 2, 5, 10, 15, 20] as const;
const DEFAULT_REST_MINUTES = 10;
const LAST_MINUTES_KEY = 'teameet.v1.restTimer.lastMinutes';

/** 하프타임마다 자동으로 시작하는 범위의 머리말. 이 머리말이 붙은 기록만 범위가 사라질 때 지운다. */
export const HALFTIME_REST_SCOPE_PREFIX = 'halftime:';
/** 운영자가 경기 중에 직접 잰 쉬는 시간(부상·작전 시간). */
export const MANUAL_REST_SCOPE = 'manual';

export type RestTimerState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly totalMs: number; readonly endAtMs: number }
  | { readonly kind: 'finished' };

export interface RestTimerApi {
  readonly state: RestTimerState;
  /** 읽는 순간의 남은 시간. 훅은 매초 다시 그리지 않는다 — 줄어드는 숫자는 `RestTimerCard` 가 스스로 틱을 돈다. */
  readonly remainingMs: number;
  readonly lastMinutes: number;
  start(minutes: number, scope: string): void;
  /** 시작 시각은 그대로 두고 전체 길이만 바꾼다. */
  setLength(minutes: number): void;
  addMinute(): void;
  end(): void;
}

interface StoredRest {
  readonly scope: string;
  readonly totalMs: number;
  readonly endAtMs: number;
  readonly dismissed: boolean;
}

function readStoredRest(key: string): StoredRest | null {
  const value = readExpiringDraft<Partial<StoredRest>>(key);
  if (
    value === null ||
    typeof value.scope !== 'string' ||
    typeof value.totalMs !== 'number' ||
    typeof value.endAtMs !== 'number'
  ) {
    return null;
  }
  return { scope: value.scope, totalMs: value.totalMs, endAtMs: value.endAtMs, dismissed: value.dismissed === true };
}

function readLastMinutes(): number {
  const value = readExpiringDraft<number>(LAST_MINUTES_KEY);
  return typeof value === 'number' && value > 0 ? value : DEFAULT_REST_MINUTES;
}

/**
 * 쉬는 시간 카운트다운. 서버 상태가 없어 이 기기에만 저장한다 — 저장이 막힌 기기에서는 메모리로만 돈다.
 * `storageKey` 가 null 인 동안(경기 정보를 읽는 중)은 자동 시작도 기록 삭제도 하지 않는다.
 */
export function useRestTimer({
  storageKey,
  autoStart,
}: {
  storageKey: string | null;
  autoStart: { scope: string } | null;
}): RestTimerApi {
  const [record, setRecord] = useState<StoredRest | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastMinutes, setLastMinutes] = useState(DEFAULT_REST_MINUTES);
  const autoScope = autoStart?.scope ?? null;

  const commit = useCallback(
    (next: StoredRest | null) => {
      setRecord(next);
      if (storageKey === null) return;
      if (next === null) clearExpiringDraft(storageKey);
      else writeExpiringDraft(storageKey, next);
    },
    [storageKey],
  );

  const rememberMinutes = useCallback((scope: string, minutes: number) => {
    // 부상·작전 시간처럼 직접 잰 길이는 다음 하프타임의 기본 길이가 아니다.
    if (!scope.startsWith(HALFTIME_REST_SCOPE_PREFIX)) return;
    setLastMinutes(minutes);
    writeExpiringDraft(LAST_MINUTES_KEY, minutes);
  }, []);

  useEffect(() => {
    if (storageKey === null) return;
    const now = Date.now();
    const stored = readStoredRest(storageKey);
    const minutes = readLastMinutes();
    setNowMs(now);
    setLastMinutes(minutes);
    if (autoScope === null) {
      const stale =
        stored !== null &&
        (stored.scope.startsWith(HALFTIME_REST_SCOPE_PREFIX) || stored.dismissed || stored.endAtMs <= now);
      if (stale) clearExpiringDraft(storageKey);
      setRecord(stale ? null : stored);
      return;
    }
    if (stored !== null && stored.scope === autoScope) {
      setRecord(stored);
      return;
    }
    const totalMs = minutes * 60_000;
    const next = { scope: autoScope, totalMs, endAtMs: now + totalMs, dismissed: false };
    setRecord(next);
    writeExpiringDraft(storageKey, next);
  }, [storageKey, autoScope]);

  const active = record !== null && !record.dismissed;
  const running = active && nowMs < record.endAtMs;

  // 끝나는 순간에만 다시 그린다 — 이 훅을 쓰는 화면(콘솔 전체)이 초마다 다시 그려지지 않게.
  const endAtMs = running ? record.endAtMs : null;
  useEffect(() => {
    if (endAtMs === null) return;
    const timeout = setTimeout(() => setNowMs(Date.now()), Math.max(0, endAtMs - Date.now()));
    return () => clearTimeout(timeout);
  }, [endAtMs]);

  const start = useCallback(
    (minutes: number, scope: string) => {
      const now = Date.now();
      const totalMs = minutes * 60_000;
      setNowMs(now);
      commit({ scope, totalMs, endAtMs: now + totalMs, dismissed: false });
      rememberMinutes(scope, minutes);
    },
    [commit, rememberMinutes],
  );

  const setLength = useCallback(
    (minutes: number) => {
      if (record === null || record.dismissed) return;
      const totalMs = minutes * 60_000;
      setNowMs(Date.now());
      commit({ ...record, totalMs, endAtMs: record.endAtMs - record.totalMs + totalMs });
      rememberMinutes(record.scope, minutes);
    },
    [record, commit, rememberMinutes],
  );

  const addMinute = useCallback(() => {
    if (record === null || record.dismissed) return;
    commit({ ...record, totalMs: record.totalMs + 60_000, endAtMs: record.endAtMs + 60_000 });
  }, [record, commit]);

  const end = useCallback(() => {
    if (record === null) return;
    // 지우지 않고 닫았다는 표시를 남긴다 — 같은 범위가 다시 자동으로 시작하지 않게.
    commit({ ...record, dismissed: true });
  }, [record, commit]);

  const state: RestTimerState = !active
    ? { kind: 'idle' }
    : running
      ? { kind: 'running', totalMs: record.totalMs, endAtMs: record.endAtMs }
      : { kind: 'finished' };

  return {
    state,
    get remainingMs() {
      return endAtMs === null ? 0 : Math.max(0, endAtMs - Date.now());
    },
    lastMinutes,
    start,
    setLength,
    addMinute,
    end,
  };
}

// 글자 크기는 안쪽 span 이 정한다 — 전역 `button { font: inherit }` 가 버튼에 단 글자 유틸리티를 이긴다.
const CHIP_CLASS =
  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-[var(--button-fill-neutral)] px-1 text-[var(--button-text-neutral)] transition-colors hover:bg-[var(--grey150)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';

function PresetChips({ onPick }: { onPick: (minutes: number) => void }) {
  // 6열 고정: 줄바꿈으로 두면 390px 에서 마지막 칩만 다음 줄로 떨어진다.
  return (
    <div className="grid grid-cols-6 gap-2">
      {REST_PRESET_MINUTES.map((minutes) => (
        <button key={minutes} type="button" className={CHIP_CLASS} onClick={() => onPick(minutes)}>
          <span className="text-[length:var(--font-size-label)] font-bold">{minutes}분</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 쉬는 시간이 도는 동안의 큰 카드. 시간이 다 되면 「확인」을 누를 때까지 알림으로 남는다.
 * 콘솔의 다른 카드처럼 흰 카드에 검정 숫자이고, 지금 흐르는 것(남은 시간 막대)만 파랑이다.
 */
export function RestTimerCard({ api }: { api: RestTimerApi }) {
  const [lengthOpen, setLengthOpen] = useState(false);
  const { state } = api;
  const [, setTick] = useState(0);
  const counting = state.kind === 'running';
  useEffect(() => {
    if (!counting) return;
    const interval = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(interval);
  }, [counting]);

  if (state.kind === 'idle') return null;

  if (state.kind === 'finished') {
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-center gap-3 rounded-[var(--radius-container)] bg-[var(--card-surface)] p-4 text-center"
      >
        <p className="flex items-center gap-2 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
          <Timer size={18} aria-hidden="true" />
          쉬는 시간이 끝났어요
        </p>
        <Button size="md" variant="neutral" className="min-w-24" onClick={api.end}>
          확인
        </Button>
      </section>
    );
  }

  const remainingMs = Math.max(0, state.endAtMs - Date.now());
  const progressPercent = state.totalMs > 0 ? Math.round((1 - remainingMs / state.totalMs) * 100) : 0;
  const totalMinutes = Math.round(state.totalMs / 60_000);
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-container)] bg-[var(--card-surface)] p-4">
      <button
        type="button"
        aria-expanded={lengthOpen}
        onClick={() => setLengthOpen((open) => !open)}
        className="-ml-1 flex min-h-[44px] items-center gap-1.5 self-start rounded-lg px-1 text-[var(--text-body)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue500)]"
      >
        <Timer size={16} aria-hidden="true" />
        <span className="text-[length:var(--font-size-body)] font-semibold">쉬는 시간 {totalMinutes}분</span>
        <ChevronDown size={16} aria-hidden="true" className={lengthOpen ? 'rotate-180' : ''} />
      </button>
      {lengthOpen ? (
        <PresetChips
          onPick={(minutes) => {
            api.setLength(minutes);
            setLengthOpen(false);
          }}
        />
      ) : null}
      <p className="flex items-baseline justify-center gap-2 tabular-nums" aria-live="off">
        <span className="text-4xl font-extrabold leading-none text-[var(--text-strong)]">{formatRestCountdown(remainingMs)}</span>{' '}
        <span className="text-[length:var(--font-size-body-lg)] font-semibold text-[var(--text-body)]">남았어요</span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--grey200)]">
        <div className="h-full rounded-full bg-[var(--blue500)]" style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="flex gap-2">
        <Button size="md" variant="neutral" className="flex-1" onClick={api.addMinute}>
          <Plus size={14} aria-hidden="true" />
          1분 추가
        </Button>
        <Button size="md" variant="neutral" className="flex-1" onClick={api.end}>
          쉬는 시간 끝내기
        </Button>
      </div>
    </section>
  );
}

/** 쉬는 시간을 직접 잴 때 고르는 길이 칩. */
export function RestTimerPresets({
  api,
  scope = MANUAL_REST_SCOPE,
  onStarted,
}: {
  api: RestTimerApi;
  scope?: string;
  onStarted?: () => void;
}) {
  return (
    <PresetChips
      onPick={(minutes) => {
        api.start(minutes, scope);
        onStarted?.();
      }}
    />
  );
}

/** `MM:SS`. 올림이라 남은 시간이 1ms 라도 있으면 00:01 이다. */
export function formatRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
