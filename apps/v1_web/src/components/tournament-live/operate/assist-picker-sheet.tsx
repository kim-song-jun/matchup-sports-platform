'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';
import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';
import { jerseyText } from './player-label';

export interface AssistPickerSheetProps {
  readonly open: boolean;
  readonly event: GameEventRecord;
  readonly scorerName: string;
  /** 어느 팀 골인지 — 엉뚱한 골에 어시스트를 다는 사고를 막는 맥락. */
  readonly teamName?: string;
  /** 언제 넣은 골인지(예: "전반 12:03"). 같은 선수가 여러 번 넣었을 때 구분한다. */
  readonly whenLabel?: string;
  readonly teammates: readonly GameLineupParticipant[];
  readonly onAttach: (assistParticipantId: string) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * action-target-picker.tsx의 시각 언어를 재사용하되,
 * "이미 확정된 GOAL을 되돌리고 어시스트를 넣어 재기록한다"는 두 단계 조작을
 * 사용자에게는 한 번의 선택으로 보여준다.
 */
export function AssistPickerSheet({ open, event, scorerName, teamName, whenLabel, teammates, onAttach, onClose }: AssistPickerSheetProps) {
  const [pending, setPending] = useState<string | null>(null);
  /* 목록이 실제로 넘칠 때만 아래쪽 페이드와 "아래로 더 있어요"를 켠다. 예전에는
     둘 다 무조건 켜져 있어(페이드는 상시, 문구는 `teammates.length > 4` 어림짐작),
     4명이 딱 들어맞는 화면에서도 마지막 선수가 반쯤 지워져 "잘렸다"처럼 보였다
     (2026-08-18 390px 실화면). 초깃값은 측정 전에도 그럴듯한 어림짐작을 쓰고,
     마운트 뒤 실제 scrollHeight 로 덮어쓴다. */
  const listRef = useRef<HTMLDivElement>(null);
  const [listOverflows, setListOverflows] = useState(teammates.length > 4);
  const measureOverflow = useCallback(() => {
    const el = listRef.current;
    if (el === null) return;
    setListOverflows(el.scrollHeight > el.clientHeight + 1);
  }, []);
  useEffect(() => {
    measureOverflow();
    const el = listRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureOverflow, teammates.length]);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  // Copilot review (PR #276): the parent conditionally renders this sheet
  // (`{assistTarget ? <AssistPickerSheet ... /> : null}`), so calling
  // onClose() actually unmounts it, not just hides it. If the backdrop/X
  // close it while pick() is still awaiting onAttach, the finally/catch
  // below would setState on an unmounted component and, worse, any failure
  // would never reach the user. Block the close paths while a pick is in
  // flight instead.
  //
  // Issue #376: attachAssist() used to be a two-step reverse-then-resubmit
  // (this comment originally warned about a reversed-but-not-yet-resubmitted
  // goal if closed mid-flight) -- it is now a single atomic
  // `ops.assignAssist` REST call (`GamesService.assignGoalAssist`), so an
  // interrupted pick can no longer leave the goal in a half-reversed state.
  // The in-flight guard itself stays: setState-after-unmount and a silently
  // dropped failure are still worth preventing for any async call here.
  const closeIfIdle = () => {
    if (pending === null) onClose();
  };

  const pick = async (teammate: GameLineupParticipant) => {
    setPending(teammate.id);
    setError(null);
    try {
      await onAttach(teammate.id);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, '어시스트를 추가하지 못했어요. 다시 시도해주세요.'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeIfIdle();
      }}
    >
      {/* max-h-[85vh] + flex 컬럼: 헤더와 "어시스트 없이 두기"는 고정하고 선수 목록만
          스크롤한다. 예전에는 목록에 max-h-56(224px) 고정값만 걸려 있어, 화면이 아무리
          커도 5명이 넘으면 아래가 잘리고 더 있다는 신호조차 없었다(2026-08-18 실화면). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assist-picker-title"
        className="flex max-h-[85vh] w-full max-w-[440px] flex-col rounded-t-2xl bg-[var(--card-surface)] p-5 sm:rounded-2xl"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="assist-picker-title" className="text-base font-bold text-[var(--text-strong)]">
              {scorerName}의 골, 어시스트한 선수는?
            </h2>
            {teamName || whenLabel ? (
              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                {[teamName, whenLabel].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={pending !== null}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <p role="alert" className="mb-2 text-xs font-medium text-[var(--red700)]">
            {error}
          </p>
        ) : null}
        {/* 가장 흔한 판단은 "어시스트가 없었다" 이다. 예전에는 그 경우 X(닫기)를 눌러야
            했는데, 그게 "어시스트 없음"인지 "골 기록 취소"인지 화면에 적혀 있지 않았다.
            골은 이미 기록돼 있으므로 이 버튼은 그대로 닫기와 같은 동작이되, 무엇을
            선택하는 것인지 이름을 준다. */}
        <button
          type="button"
          onClick={closeIfIdle}
          disabled={pending !== null}
          className="mb-2 min-h-[44px] w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 text-sm font-bold text-[var(--text-strong)] transition-colors hover:bg-[var(--card-surface)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          어시스트 없이 두기
        </button>
        <div
          ref={listRef}
          className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto${
            listOverflows ? ' [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]' : ''
          }`}
          role="list"
        >
          {teammates.map((teammate) => (
            <Button
              key={teammate.id}
              size="md"
              variant="outline"
              loading={pending === teammate.id}
              disabled={pending !== null}
              onClick={() => pick(teammate)}
            >
              <span className="inline-block min-w-[1.25rem] text-right tabular-nums text-[var(--text-muted)]">
                {jerseyText(teammate.jerseyNumber)}
              </span>
              {teammate.displayNameSnapshot}
            </Button>
          ))}
        </div>
        {listOverflows ? (
          <p className="mt-1 shrink-0 text-center text-xs text-[var(--text-muted)]" aria-hidden="true">
            아래로 더 있어요
          </p>
        ) : null}
      </div>
    </div>
  );
}
