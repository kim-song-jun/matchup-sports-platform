'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { type MatchOutcomeReason, matchOutcomeReasonLabel } from '@/lib/match-outcome';

/**
 * 몰수·중단으로 경기를 종료할 때 **사유를 받는** 다이얼로그.
 *
 * 1차 대회(2026-08-15~16) 회고 "몰수·중단 등 특수 상황 처리". 지금까지 운영자는
 * 몰수를 임의 점수(3-0 등)로 수기 입력하는 수밖에 없었고, 정상 종료와 구분되지 않아
 * **왜 그 점수인지 근거가 시스템에 남지 않았다** — 이의제기가 들어오면 방어할 기록이
 * 없었다는 뜻이다.
 *
 * 2026-08-23 사용자 결정(Q3): 종목별 표준 스코어를 자동 부여하지 않는다. 점수는 그대로
 * 운영자가 정하되 **사유를 필수로** 남긴다. 그래서 이 다이얼로그의 핵심은 예쁜 폼이
 * 아니라 "사유 없이는 확인 버튼이 눌리지 않는다"는 것 하나다 — 서버도 같은 규칙을
 * 강제한다(GAME_OUTCOME_NOTE_REQUIRED). 프런트 가드만 두면 API 직접 호출로 그대로
 * 우회되므로 양쪽에 둔다.
 *
 * 기존 `useConfirm` 을 쓰지 않은 이유: 그건 boolean 만 돌려주는 확인 모달이라 자유
 * 텍스트를 받을 수 없다. 사유 입력이 이 기능의 전부라 확인 모달로는 대체 불가다.
 */

/** 이 다이얼로그가 고르는 값이 곧 검토·공개 화면에 표시되는 값이다 — 같은 타입을 쓴다. */
export type AbnormalEndReason = MatchOutcomeReason;

/** 라벨은 `lib/match-outcome` 한 곳에서 가져온다 — 여기에 문구를 따로 적으면 운영자가
 *  고른 이름과 관전자가 보는 이름이 갈린다. 힌트 문장은 이 화면에서만 쓰이므로 여기 둔다. */
const REASON_OPTIONS: ReadonlyArray<{ value: AbnormalEndReason; label: string; hint: string }> = [
  { value: 'FORFEIT', label: matchOutcomeReasonLabel('FORFEIT'), hint: '한 팀이 경기를 수행하지 않아 종결해요.' },
  { value: 'ABANDONED', label: matchOutcomeReasonLabel('ABANDONED'), hint: '날씨·사고 등으로 끝까지 진행하지 못했어요.' },
];

export interface AbnormalEndDialogProps {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (input: { reason: AbnormalEndReason; note: string }) => void;
  readonly submitting?: boolean;
}

export function AbnormalEndDialog({ open, onCancel, onConfirm, submitting = false }: AbnormalEndDialogProps) {
  const titleId = useId();
  const noteId = useId();
  const [reason, setReason] = useState<AbnormalEndReason>('FORFEIT');
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 열릴 때마다 초기화한다 — 직전 경기의 사유가 남아 있으면 그대로 확정될 수 있다.
  useEffect(() => {
    if (!open) return;
    setReason('FORFEIT');
    setNote('');
    noteRef.current?.focus();
  }, [open]);

  /**
   * Tab 포커스 트랩. 이 콘솔의 다른 다이얼로그(ActionTargetPicker·PenaltyShootoutPanel)가
   * 이미 같은 트랩을 두고 있는데 여기만 빠져 있었다(Copilot 리뷰 지적) — 키보드로 배경의
   * 다른 버튼을 잘못 누를 수 있고, 경기 운영 화면에서 그건 곧 오조작이다.
   * 선례와 같은 셀렉터·순환 방식을 그대로 쓴다.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || dialog === null) return;
    const focusableSelectors =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
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
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      // 전송 중에는 ESC 로도 닫지 않는다. 버튼만 잠그면 키보드 경로가 그대로 열려 있어
      // 중복 종료 방지 의도가 반쪽이 된다(Copilot 리뷰 지적).
      if (event.key === 'Escape' && !submitting) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel, submitting]);

  if (!open) return null;

  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        // 백드롭 클릭도 전송 중에는 막는다 — ESC 와 같은 우회 경로다.
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-bold">
          몰수·중단으로 종료
        </h2>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          점수는 지금 기록된 값 그대로 확정돼요. 사유는 공개 경기 기록에 함께 남아, 나중에 이 결과가 왜
          이런지 설명하는 유일한 근거가 돼요.
        </p>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">종료 종류</legend>
          <div className="mt-2 flex flex-col gap-2">
            {REASON_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={[
                  'flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2',
                  reason === option.value
                    ? 'border-[var(--blue500)] bg-[var(--blue50)]'
                    : 'border-[var(--border)]',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="abnormal-end-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label htmlFor={noteId} className="text-sm font-semibold">
            사유 <span className="text-[var(--red500)]">(필수)</span>
          </label>
          <textarea
            id={noteId}
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="예) 원정팀이 킥오프 15분 경과까지 미출석"
            className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm"
          />
          {/* 왜 못 누르는지 말해 준다 — 비활성 버튼만 두면 운영자가 현장에서 이유를 못 찾는다. */}
          {trimmed.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              사유를 적어야 종료할 수 있어요.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" block onClick={onCancel} disabled={submitting}>
            취소
          </Button>
          <Button
            variant="danger"
            block
            disabled={!canSubmit}
            loading={submitting}
            onClick={() => onConfirm({ reason, note: trimmed })}
          >
            이대로 종료
          </Button>
        </div>
      </div>
    </div>
  );
}
