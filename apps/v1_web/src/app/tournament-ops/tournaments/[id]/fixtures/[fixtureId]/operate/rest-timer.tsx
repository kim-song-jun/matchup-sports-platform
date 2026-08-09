'use client';

import { useEffect, useState } from 'react';
import { Plus, Timer, X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';

/** 오너 지시 원문 프리셋 — "쉬는시간 10분 5분 2분 1분 15분 20분 이런것들도
 * 있어야 쓸만하지 않을까?" 오름차순으로 정렬해 보여준다(원문 순서가 아니라
 * 화면에서 고르기 쉬운 순서). */
const REST_PRESET_MINUTES = [1, 2, 5, 10, 15, 20] as const;

type RestTimerPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly totalMs: number; readonly endAtMs: number }
  | { readonly kind: 'finished' };

/**
 * 휴식(하프타임·부상 중단) 카운트다운 — 경기 시계(`ElapsedMatchClock`)와는
 * 완전히 다른 숫자다. 서버에 상태가 없다: 이 컴포넌트는 REST 관련 서버 상태를
 * 새로 만들지 않고 클라이언트 로컬 카운트다운으로만 존재한다(요건: "서버에
 * 없는 상태를 있는 것처럼 꾸미지 마라"). 그래서 새로고침하면 사라진다는
 * 한계를 화면에 정직하게 적어둔다.
 *
 * 색상(호박색/amber)과 아이콘(Timer)을 경기 시계(초록 점/파랑-회색 톤)와
 * 완전히 다르게 써서, 두 숫자가 나란히 있어도 절대 혼동되지 않게 한다.
 */
export function RestTimer() {
  const [phase, setPhase] = useState<RestTimerPhase>({ kind: 'idle' });
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (phase.kind !== 'running') return;
    const interval = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(interval);
  }, [phase.kind]);

  useEffect(() => {
    if (phase.kind === 'running' && nowMs >= phase.endAtMs) {
      setPhase({ kind: 'finished' });
    }
  }, [nowMs, phase]);

  const start = (minutes: number) => {
    const totalMs = minutes * 60_000;
    const startedAtMs = Date.now();
    setNowMs(startedAtMs);
    setPhase({ kind: 'running', totalMs, endAtMs: startedAtMs + totalMs });
  };

  const addOneMinute = () => {
    if (phase.kind !== 'running') return;
    setPhase({ kind: 'running', totalMs: phase.totalMs + 60_000, endAtMs: phase.endAtMs + 60_000 });
  };

  const cancel = () => setPhase({ kind: 'idle' });

  if (phase.kind === 'finished') {
    // 소리·진동에 의존하지 않는다(경기장은 시끄럽다) — 크고 눈에 띄는 배지를
    // 깜빡여(motion-safe:animate-pulse) 시각적으로만 끝났음을 알린다. 운영자가
    // 직접 "확인"을 눌러야 사라진다(자동으로 조용히 없어지지 않는다).
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="mx-4 flex flex-col items-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-4 text-center motion-safe:animate-pulse dark:border-amber-500/60 dark:bg-amber-500/10"
      >
        <p className="flex items-center gap-1.5 text-base font-extrabold text-amber-700 dark:text-amber-300">
          <Timer size={18} aria-hidden="true" />
          휴식 시간이 끝났어요
        </p>
        <Button size="sm" variant="warning" onClick={cancel}>
          확인
        </Button>
      </section>
    );
  }

  if (phase.kind === 'running') {
    const remainingMs = Math.max(0, phase.endAtMs - nowMs);
    const progressPercent =
      phase.totalMs > 0 ? Math.round((1 - remainingMs / phase.totalMs) * 100) : 0;
    return (
      <section className="mx-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-2xs font-semibold text-amber-700 dark:text-amber-300">
            <Timer size={14} aria-hidden="true" />
            쉬는 시간
          </p>
          <button
            type="button"
            onClick={cancel}
            aria-label="쉬는 시간 취소"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-amber-600 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p
          className="text-center font-mono text-4xl font-black leading-none tabular-nums text-amber-700 dark:text-amber-200"
          aria-live="off"
        >
          {formatCountdown(remainingMs)}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-500/20">
          <div
            className="h-full rounded-full bg-amber-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <Button size="sm" variant="outline" className="self-center" onClick={addOneMinute}>
          <Plus size={14} aria-hidden="true" />
          1분 추가
        </Button>
      </section>
    );
  }

  return (
    <section className="mx-4 flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-2xs font-semibold text-gray-500 dark:text-gray-400">
        <Timer size={14} aria-hidden="true" />
        쉬는 시간
      </p>
      <div className="flex flex-wrap gap-1.5">
        {REST_PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => start(minutes)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-amber-200 px-3 text-sm font-bold text-amber-700 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            {minutes}분
          </button>
        ))}
      </div>
      <p className="text-2xs text-gray-400 dark:text-gray-500">
        화면을 새로고침하면 초기화돼요.
      </p>
    </section>
  );
}

/** `MM:SS` — 경기 시계(`formatStopwatchClock`)와 다른, 그리고 다시 쓸 이유가
 * 없을 만큼 단순한 카운트다운 전용 포맷이다. 최대 20분(1200초)까지만 쓰이므로
 * 시:분:초 롤오버가 필요 없다. */
function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
