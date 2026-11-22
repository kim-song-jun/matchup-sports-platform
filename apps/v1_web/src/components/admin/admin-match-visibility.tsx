'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useV1HideAdminMatch, useV1UnhideAdminMatch } from '@/hooks/use-v1-api';
import { formatAdminDateTime } from '@/lib/date-utils';
import { ADMIN_MATCH_HIDDEN_BY_LABEL } from '@/lib/admin-labels';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import type { V1AdminMatchDetail } from '@/types/api';
import { AdminReasonConfirmDialog } from './admin-reason-confirm-dialog';
import { STATUS_META } from './admin-status-pill';
import type { AdminToastVariant } from './admin-toast';

type ToastFn = (message: string, variant?: AdminToastVariant) => void;

const CARD = 'rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4';
const TITLE = 'text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]';
const BODY = 'mt-2 text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-muted)]';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/** 서버가 영어로 내려주는 403·404 는 화면 문구로 바꾸고, 409 같은 도메인 메시지는 서버 문구 그대로 보인다. */
function visibilityErrorMessage(error: unknown, fallback: string): string {
  const code = extractErrorCode(error);
  if (code === 'PERMISSION_DENIED') return '권한이 없어요.';
  if (code === 'NOT_FOUND') return '매치를 찾을 수 없어요.';
  return extractErrorMessage(error, fallback);
}

/** 숨긴 매치 상세 맨 위에 붙는 안내. 누가 언제 왜 숨겼는지를 한눈에 보인다. */
export function AdminMatchHiddenBanner({ match }: { match: V1AdminMatchDetail }) {
  if (!match.hiddenAt || !match.hiddenBy) return null;
  const byAdmin = match.hiddenBy === 'admin';
  return (
    <section
      role="status"
      aria-label="숨김 안내"
      className="flex gap-3 rounded-2xl border border-[var(--tint-orange-border)] bg-[var(--orange50)] p-4 text-[var(--orange700)]"
    >
      <EyeOff size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[length:var(--font-size-body-lg)] font-bold">
          {byAdmin ? '숨긴 매치예요' : '주최자가 삭제한 매치예요'}
        </p>
        <p className="mt-1 break-words text-[length:var(--font-size-body-sm)] leading-relaxed">
          {formatAdminDateTime(match.hiddenAt)}
          {byAdmin && match.hiddenByName ? ` · 처리자 ${match.hiddenByName}` : ''}
          {byAdmin && match.hiddenReason ? ` · 사유: ${match.hiddenReason}` : ''}
        </p>
        <p className="mt-1 text-[length:var(--font-size-caption)]">{ADMIN_MATCH_HIDDEN_BY_LABEL[match.hiddenBy]}</p>
      </div>
    </section>
  );
}

/**
 * 상세의 "위험 영역" 카드. 숨기기·다시 공개하기 모두 사유를 받는 확인 모달을 거친다.
 * 권한(owner·ops)은 서버가 판정하고 `canWrite` 는 버튼을 미리 잠그는 용도다.
 */
export function AdminMatchVisibilityCard({
  match,
  canWrite,
  onToast,
}: {
  match: V1AdminMatchDetail;
  canWrite: boolean;
  onToast: ToastFn;
}) {
  const hideMutation = useV1HideAdminMatch(match.matchId);
  const unhideMutation = useV1UnhideAdminMatch(match.matchId);
  const [dialog, setDialog] = useState<'hide' | 'unhide' | null>(null);
  const [dialogError, setDialogError] = useState<string>();
  const baseId = useId();
  const hidden = Boolean(match.hiddenAt);
  const mutation = hidden ? unhideMutation : hideMutation;
  const statusLabel = STATUS_META[match.status]?.label ?? match.status;

  function openDialog(next: 'hide' | 'unhide') {
    setDialogError(undefined);
    setDialog(next);
  }

  function submit(reason: string) {
    const next = hidden ? 'unhide' : 'hide';
    mutation.mutate(
      { reason },
      {
        onSuccess: () => {
          setDialog(null);
          onToast(next === 'hide' ? '매치를 숨겼어요.' : '매치를 다시 공개했어요.');
        },
        onError: (error) => {
          setDialogError(visibilityErrorMessage(error, next === 'hide' ? '매치를 숨기지 못했어요.' : '매치를 다시 공개하지 못했어요.'));
        },
      },
    );
  }

  if (hidden && !match.canUnhide) {
    return (
      <section aria-label="공개 설정" className={CARD}>
        <h2 className={TITLE}>다시 공개할 수 없어요</h2>
        <p className={BODY}>주최자가 직접 삭제한 매치는 어드민에서 다시 공개할 수 없어요.</p>
      </section>
    );
  }

  const blocked = !hidden && match.hideBlocked;
  const disabled = !canWrite || blocked;
  const blockedId = `${baseId}-blocked`;
  const permissionId = `${baseId}-permission`;
  const describedBy = !canWrite ? permissionId : blocked ? blockedId : undefined;
  const buttonBase = `mt-4 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[length:var(--font-size-body-sm)] font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 ${FOCUS}`;

  return (
    <section aria-label={hidden ? '다시 공개' : '위험 영역'} className={CARD}>
      <h2 className={TITLE}>{hidden ? '다시 공개하기' : '공개 화면에서 숨기기'}</h2>
      <p className={BODY}>
        {hidden
          ? `상태(${statusLabel})는 그대로라, 공개하면 숨기기 전 모습으로 돌아와요. 처리 사유는 감사 기록에 남아요.`
          : '공개 목록·검색·사이트맵·주최자와 참가자의 「내 매치」·채팅에서 이 매치가 사라져요. 기록은 지우지 않고, 사유는 감사 기록에 남아요.'}
      </p>
      {blocked ? (
        <p id={blockedId} className="mt-2 text-[length:var(--font-size-body-sm)] font-medium leading-relaxed text-[var(--orange700)]">
          신청자나 확정 참가자가 있는 진행 예정 매치는 숨길 수 없어요. 먼저 목록의 「상태 변경」에서 매치를 취소해 주세요.
        </p>
      ) : null}
      {!canWrite ? (
        <p id={permissionId} className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          현재 계정은 매치 공개 상태를 바꿀 권한이 없어요.
        </p>
      ) : null}
      {hidden ? (
        <button
          type="button"
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => openDialog('unhide')}
          className={`${buttonBase} border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-strong)] hover:bg-[var(--surface-soft)]`}
        >
          <Eye size={16} aria-hidden="true" />
          다시 공개하기
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => openDialog('hide')}
          className={`${buttonBase} bg-red-500 text-white hover:bg-red-600`}
        >
          <EyeOff size={16} aria-hidden="true" />
          이 매치 숨기기
        </button>
      )}

      <AdminReasonConfirmDialog
        open={dialog === 'hide'}
        title="매치 숨기기"
        description={
          <>
            <p>「{match.title}」을(를) 모든 사용자 화면에서 내려요.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>주최자·참가자의 「내 매치」와 채팅방에서도 사라져요.</li>
              <li>이미 보낸 알림을 누르면 「없는 페이지」가 떠요.</li>
              <li>나중에 이 화면에서 다시 공개할 수 있어요.</li>
            </ul>
          </>
        }
        reasonLabel="숨기는 사유"
        reasonPlaceholder="예: 운영 시험용으로 만든 경기라 공개 목록에서 내려요."
        submitLabel="숨기기"
        pendingLabel="숨기는 중"
        tone="danger"
        disableSubmitWhenEmpty
        pending={hideMutation.isPending}
        error={dialogError}
        onSubmit={submit}
        onClose={() => setDialog(null)}
      />
      <AdminReasonConfirmDialog
        open={dialog === 'unhide'}
        title="매치 다시 공개하기"
        description={
          <>
            <p>「{match.title}」을(를) 다시 공개해요.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>공개 목록·검색·사이트맵에 다시 나타나요.</li>
              <li>주최자·참가자의 「내 매치」와 채팅방도 다시 보여요.</li>
              <li>상태({statusLabel})는 그대로예요.</li>
            </ul>
          </>
        }
        reasonLabel="다시 공개하는 사유"
        reasonPlaceholder="예: 시험용이 아니라 실제 경기라 다시 공개해요."
        submitLabel="다시 공개"
        pendingLabel="공개하는 중"
        tone="primary"
        disableSubmitWhenEmpty
        pending={unhideMutation.isPending}
        error={dialogError}
        onSubmit={submit}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}
