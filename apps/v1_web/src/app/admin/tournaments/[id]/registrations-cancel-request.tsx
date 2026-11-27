'use client';

import { useId, useState } from 'react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { formatDate } from './tournament-admin-shared';
import { textareaCls } from './tournament-detail-shared';

const APPROVE_HELP = '신청이 취소되고 되돌릴 수 없어요. 사유를 남길 수 있어요.';
const KEEP_HELP = '취소 요청을 거절하고 이전 상태로 돌려요. 팀이 남긴 사유는 기록에 남아요.';

const OPTION_CLASS =
  'flex min-h-[64px] flex-col items-start gap-0.5 rounded-xl border bg-[var(--card-surface)] px-3.5 py-2.5 text-left text-[length:var(--font-size-body-sm)] font-semibold transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const OPTION_HELP_CLASS = 'text-[length:var(--font-size-caption)] font-normal text-[var(--text-muted)]';

/** 데스크톱 「취소 처리」 를 연 행 안에서 펼쳐지는 두 선택지. 접근 이름은 선택지 이름만이고 결과는 설명으로 읽힌다. */
export function CancelRequestChoice({
  id,
  busy,
  onApprove,
  onKeep,
}: {
  id: string;
  busy: boolean;
  onApprove: () => void;
  onKeep: () => void;
}) {
  const approveHelpId = useId();
  const keepHelpId = useId();
  return (
    <div id={id} className="flex flex-col gap-2.5 border-t border-[var(--border)] pt-3.5">
      <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
        취소 요청을 어떻게 처리할까요?
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          aria-label="취소 승인"
          aria-describedby={approveHelpId}
          disabled={busy}
          onClick={onApprove}
          className={`${OPTION_CLASS} border-[var(--tint-red-border)] text-[var(--red700)]`}
        >
          취소 승인
          <span id={approveHelpId} className={OPTION_HELP_CLASS}>
            {APPROVE_HELP}
          </span>
        </button>
        <button
          type="button"
          aria-label="참가 유지"
          aria-describedby={keepHelpId}
          disabled={busy}
          onClick={onKeep}
          className={`${OPTION_CLASS} border-[var(--border-strong)] text-[var(--text-strong)]`}
        >
          참가 유지
          <span id={keepHelpId} className={OPTION_HELP_CLASS}>
            {KEEP_HELP}
          </span>
        </button>
      </div>
    </div>
  );
}

type Choice = 'approve' | 'keep';

/** 폰의 「취소 처리」 — 선택·사유·확정을 시트 한 장에 담아 따로 뜨는 사유 창을 한 번 줄인다. */
export function CancelRequestSheet({
  open,
  registration,
  reason,
  error,
  busy,
  onReasonChange,
  onApprove,
  onKeep,
  onClose,
}: {
  open: boolean;
  registration: V1AdminTournamentRegistration | null;
  reason: string;
  error: string | null;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onApprove: () => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  if (!open || registration === null) return null;
  const teamName = registration.teamName ?? registration.teamId;
  return (
    <BottomSheet
      open
      ariaLabel={`${teamName} 취소 요청`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="tm-filter-sheet-handle" aria-hidden="true" />
      <SheetBody
        key={registration.id}
        registration={registration}
        teamName={teamName}
        reason={reason}
        error={error}
        busy={busy}
        onReasonChange={onReasonChange}
        onApprove={onApprove}
        onKeep={onKeep}
        onClose={onClose}
      />
    </BottomSheet>
  );
}

function SheetBody({
  registration,
  teamName,
  reason,
  error,
  busy,
  onReasonChange,
  onApprove,
  onKeep,
  onClose,
}: {
  registration: V1AdminTournamentRegistration;
  teamName: string;
  reason: string;
  error: string | null;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onApprove: () => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  // 되돌릴 수 없는 승인이 한 번 탭으로 끝나지 않도록 선택은 비어서 시작한다.
  const [choice, setChoice] = useState<Choice | null>(null);
  const approveHelpId = useId();
  const keepHelpId = useId();
  const reasonId = useId();

  return (
    <div className="grid gap-3 pb-1">
      <div>
        <h2 className="m-0 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
          {teamName} 취소 요청
        </h2>
        {registration.cancelRequestedAt ? (
          <p className="m-0 mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            요청 {formatDate(registration.cancelRequestedAt)}
          </p>
        ) : null}
      </div>
      {registration.cancelReason ? (
        <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          팀이 남긴 취소 사유: “{registration.cancelReason}”
        </p>
      ) : null}
      <div role="radiogroup" aria-label="취소 요청 처리 방법" className="grid gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'approve'}
          aria-label="취소 승인"
          aria-describedby={approveHelpId}
          disabled={busy}
          onClick={() => setChoice('approve')}
          className={`${OPTION_CLASS} ${choice === 'approve' ? 'border-[var(--blue500)] bg-[var(--blue50)]' : 'border-[var(--border-strong)]'} text-[var(--red700)]`}
        >
          취소 승인
          <span id={approveHelpId} className={OPTION_HELP_CLASS}>
            {APPROVE_HELP}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={choice === 'keep'}
          aria-label="참가 유지"
          aria-describedby={keepHelpId}
          disabled={busy}
          onClick={() => setChoice('keep')}
          className={`${OPTION_CLASS} ${choice === 'keep' ? 'border-[var(--blue500)] bg-[var(--blue50)]' : 'border-[var(--border-strong)]'} text-[var(--text-strong)]`}
        >
          참가 유지
          <span id={keepHelpId} className={OPTION_HELP_CLASS}>
            {KEEP_HELP}
          </span>
        </button>
      </div>
      {choice === 'approve' ? (
        <div className="grid gap-1.5">
          <label htmlFor={reasonId} className="text-[length:var(--font-size-label)] font-medium text-[var(--text-strong)]">
            운영진 사유 (선택)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            placeholder="필요하면 적어 주세요."
            className={textareaCls}
          />
        </div>
      ) : null}
      {error !== null ? (
        <p role="alert" className="m-0 text-[length:var(--font-size-caption)] text-[var(--red700)]">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="neutral" onClick={onClose} disabled={busy}>
          닫기
        </Button>
        {choice === 'approve' ? (
          <Button type="button" variant="danger" onClick={onApprove} disabled={busy}>
            {busy ? '처리 중…' : '취소 승인하기'}
          </Button>
        ) : choice === 'keep' ? (
          <Button type="button" variant="primary" onClick={onKeep} disabled={busy}>
            {busy ? '처리 중…' : '참가 유지하기'}
          </Button>
        ) : (
          <Button type="button" variant="primary" disabled>
            처리하기
          </Button>
        )}
      </div>
    </div>
  );
}
