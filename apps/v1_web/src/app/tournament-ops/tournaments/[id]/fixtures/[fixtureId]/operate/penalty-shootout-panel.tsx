'use client';

import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import type { GameSide } from '@/types/game-operations';
import {
  isPenaltyShootoutDecisive,
  nextPenaltyKicker,
  penaltyScoreBySideId,
  type PenaltyKick,
  type PenaltyKickResult,
} from '@/lib/penalty-shootout';

export interface PenaltyShootoutPanelProps {
  readonly sides: readonly GameSide[];
  readonly kicks: readonly PenaltyKick[];
  readonly onRecordKick: (sideId: string, result: PenaltyKickResult) => void;
  readonly onUndoLastKick: () => void;
  readonly onFinish: () => void;
  readonly onCancel: () => void;
  /** "승부차기 종료" 명령이 서버 왕복 중일 때 — 다른 명령 버튼과 동일하게
   * `commandPending`을 그대로 물려받는다(별도 로딩 상태를 만들지 않는다). */
  readonly finishing: boolean;
}

/**
 * 승부차기 킥 단위 입력 패널.
 *
 * 저장 방식(Option B — 자세한 근거는 `@/lib/penalty-shootout.ts` doc 참고):
 * 킥별 성공/실패는 이 컴포넌트가 들고 있는 로컬 상태(`kicks` prop, 부모
 * `operate-console.tsx`가 소유)일 뿐 어떤 이벤트로도 서버에 남지 않는다.
 * "승부차기 종료"를 눌러야만 집계된 최종 점수 두 개(`home`/`away`)가
 * `end` 커맨드의 `payload.penalties`에 실려 나간다. 즉 이 패널을 취소하거나
 * 새로고침하면 진행 중이던 킥 기록은 복구할 수 없다 — 그래서 "승부차기
 * 종료" 확인 문구가 최종 점수를 보여주고(요구사항 2), danger 톤을 쓴다.
 *
 * 접근성: `ActionTargetPicker`와 같은 모달 셸(role=dialog, ESC로 취소,
 * 포커스 트랩, backdrop 클릭 취소)을 그대로 따른다 — 이 화면에 이미 있는
 * 모달 관례를 새로 발명하지 않는다.
 */
export function PenaltyShootoutPanel({
  sides,
  kicks,
  onRecordKick,
  onUndoLastKick,
  onFinish,
  onCancel,
  finishing,
}: PenaltyShootoutPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    dialog?.querySelector<HTMLElement>(focusableSelectors)?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
    };
  }, []);

  const score = penaltyScoreBySideId(kicks);
  const nextSideId = nextPenaltyKicker(kicks, sides);
  const decisive =
    sides.length === 2 && isPenaltyShootoutDecisive(score.get(sides[0].id) ?? 0, score.get(sides[1].id) ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="penalty-shootout-title"
        className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-[var(--card-surface)] shadow-[0_8px_32px_rgba(20,28,45,0.2)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id="penalty-shootout-title" className="text-base font-bold text-[var(--text-strong)]">
            승부차기
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="승부차기 입력 닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            {sides.map((side) => {
              const sideKicks = kicks.filter((kick) => kick.sideId === side.id);
              const isTurn = nextSideId === side.id;
              return (
                <div
                  key={side.id}
                  className={`rounded-2xl border p-3 ${
                    isTurn ? 'border-[var(--blue500)] bg-[var(--blue50)] dark:bg-blue-500/10' : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                      {side.displayNameSnapshot}
                      {isTurn ? <span className="ml-1.5 text-xs font-semibold text-[var(--blue700)]">다음 순서</span> : null}
                    </p>
                    <p className="text-xl font-bold tabular-nums text-[var(--text-strong)]">{score.get(side.id) ?? 0}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${side.displayNameSnapshot} 킥 기록`}>
                    {sideKicks.length === 0 ? (
                      <span className="tm-text-caption text-[var(--text-muted)]">아직 기록된 킥이 없어요</span>
                    ) : (
                      sideKicks.map((kick, index) =>
                        kick.result === 'SCORED' ? (
                          <span
                            key={index}
                            aria-label={`${index + 1}번째 킥 성공`}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--green500)] text-white"
                          >
                            <Check size={14} aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            key={index}
                            aria-label={`${index + 1}번째 킥 실패`}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--red500)] text-[var(--red500)]"
                          >
                            <X size={14} aria-hidden="true" />
                          </span>
                        ),
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="success"
              disabled={nextSideId === null}
              onClick={() => nextSideId !== null && onRecordKick(nextSideId, 'SCORED')}
            >
              <Check size={16} aria-hidden="true" />
              성공
            </Button>
            <Button
              size="lg"
              variant="danger"
              disabled={nextSideId === null}
              onClick={() => nextSideId !== null && onRecordKick(nextSideId, 'MISSED')}
            >
              <X size={16} aria-hidden="true" />
              실패
            </Button>
          </div>

          {/* 요구사항 3(과제 2) — 킥 오조작 복구. 이 되돌리기는 로컬 상태
              되감기일 뿐 서버 호출이 없다(아직 아무것도 안 보냈다) — 그래서
              사용자 결정("모든 액션에 확인")의 대상이 아니다. revert-period가
              확인 없이 즉시 실행되는 것과 같은 이유: 되돌리기 자체가 이미
              교정 행동이다. */}
          <Button size="md" variant="outline" block className="mt-2" disabled={kicks.length === 0} onClick={onUndoLastKick}>
            방금 킥 되돌리기
          </Button>
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          <Button size="lg" variant="primary" block disabled={!decisive} loading={finishing} onClick={onFinish}>
            승부차기 종료
          </Button>
          {!decisive ? (
            <p className="mt-2 text-center tm-text-caption text-[var(--text-muted)]">두 팀의 점수가 같으면 종료할 수 없어요.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
