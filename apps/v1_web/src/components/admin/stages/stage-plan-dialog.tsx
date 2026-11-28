'use client';
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { StagePlanManager } from './stage-plan-manager';
import { useIsMutating } from '@tanstack/react-query';
import { useConfirm } from '@/components/v1-ui/confirm-modal';

/** Match the existing bracket tools: keep the canvas visible and edit in an accessible panel. */
export function StagePlanDialog({ open, onClose, tournamentId, canWrite, canOverride, tournamentStatus }: {
  open: boolean; onClose: () => void; tournamentId: string; canWrite: boolean; canOverride: boolean; tournamentStatus?: string;
}) {
  const titleId = useId();
  const [edited, setEdited] = useState(false), pending = useIsMutating() > 0;
  const { confirm, ConfirmModal } = useConfirm();
  async function close() {
    if (pending || edited && !await confirm({ title: '단계 관리를 닫을까요?', message: '저장하지 않은 입력은 닫으면 사라져요. 저장 여부를 확인한 뒤 닫아 주세요.', confirmLabel: '닫기' })) return;
    setEdited(false); onClose();
  }
  const { dialogRef, mounted, onBackdropClick } = useModalA11y({ open, onClose: () => void close(), pending });
  return <>
    {mounted && typeof document !== 'undefined' && createPortal(
      <div className="tm-modal-scrim fixed inset-0 flex items-end justify-center bg-[var(--scrim-dark-32)] sm:items-center sm:p-4" style={{ zIndex: 'var(--z-modal)' }} onClick={onBackdropClick}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="tm-modal-panel flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-[var(--card-surface)] pb-[var(--v1-shell-safe-bottom,0px)] sm:rounded-2xl">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] p-4">
            <h2 id={titleId} className="tm-text-body-lg font-bold">단계·진출팀 관리</h2>
            <Button variant="ghost" disabled={pending} onClick={() => void close()} aria-label="단계 관리 닫기">닫기</Button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4" onChangeCapture={() => setEdited(true)}>
            <StagePlanManager tournamentId={tournamentId} tournamentStatus={tournamentStatus} canWrite={canWrite} canOverride={canOverride} compactNavigation />
          </div>
        </div>
      </div>, document.body)}{ConfirmModal}
  </>;
}
