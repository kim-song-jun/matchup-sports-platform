'use client';

import { useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1UpdateLeagueVisibility, useV1UpdateTournamentVisibility } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { tournamentVisibilityHiddenReason } from '@/components/admin/tournaments/tournament-visibility-control';
import type { V1TournamentStatus } from '@/types/api';
import type { AdminToastVariant } from './admin-toast';

type ToastFn = (message: string, variant?: AdminToastVariant) => void;
type VisibilityMutation = UseMutationResult<unknown, unknown, { isPublic: boolean }>;

/** 공개 여부 표시 — 아이콘 + 텍스트를 함께 둬 색에만 의존하지 않는다. */
export function AdminVisibilityBadge({ isPublic, hiddenReason }: { isPublic: boolean; hiddenReason?: string }) {
  const Icon = hiddenReason || isPublic ? Eye : EyeOff;
  const label = hiddenReason ? '노출 안 됨' : isPublic ? '공개' : '숨김';
  return (
    <span
      title={hiddenReason}
      className={[
        'tm-on-tint inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5',
        'text-[length:var(--font-size-caption)] font-semibold',
        isPublic && !hiddenReason
          ? 'bg-[var(--blue50)] text-[var(--blue700)]'
          : 'border border-[var(--border-strong)] bg-[var(--surface-soft)] text-[var(--text-muted)]',
      ].join(' ')}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * 목록 행의 '숨기기 / 다시 보이기'. 상세의 공개 설정 카드와 같은 API·같은 권한 판단(`status:write`)을 쓴다.
 * `hiddenReason` 이 있으면(취소된 대회) 설정이 의미가 없어 버튼을 두지 않는다 — 상세와 같은 규칙.
 */
function CompetitionVisibilityRowAction({
  title,
  noun,
  isPublic,
  hiddenReason,
  mutation,
  onToast,
}: {
  title: string;
  noun: '대회' | '리그';
  isPublic: boolean;
  hiddenReason?: string;
  mutation: VisibilityMutation;
  onToast: ToastFn;
}) {
  const canWrite = useAdminCanWrite();
  const [open, setOpen] = useState(false);
  if (hiddenReason) return null;

  const nextPublic = !isPublic;
  const verb = nextPublic ? '다시 보이기' : '숨기기';
  const readOnlyReason = '현재 계정은 공개 상태를 변경할 권한이 없어요.';

  async function handleConfirm() {
    try {
      await mutation.mutateAsync({ isPublic: nextPublic });
      onToast(nextPublic ? `${noun}를 다시 공개했어요.` : `${noun}를 숨겼어요.`);
    } catch (err) {
      onToast(extractErrorMessage(err, '공개 상태를 저장하지 못했어요.'), 'error');
    } finally {
      setOpen(false);
    }
  }

  return (
    <>
      <span title={canWrite ? undefined : readOnlyReason}>
        <button
          type="button"
          disabled={!canWrite || mutation.isPending}
          aria-label={canWrite ? `${title} ${verb}` : `${title} ${verb} — ${readOnlyReason}`}
          onClick={() => setOpen(true)}
          className="tm-on-tint inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--surface-soft)] px-3 text-[length:var(--font-size-label)] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--grey300)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verb}
        </button>
      </span>
      <ConfirmModal
        open={open}
        title={nextPublic ? `${title}을(를) 다시 보이게 할까요?` : `${title}을(를) 숨길까요?`}
        message={
          nextPublic
            ? `일반 사용자 목록·검색·홈 화면에 다시 표시돼요.`
            : `일반 사용자 목록·검색·홈 화면에서 사라져요. 관리자 운영과 ${noun} 정보는 그대로예요.`
        }
        confirmLabel={verb}
        busy={mutation.isPending}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export function TournamentRowVisibilityAction({
  tournamentId,
  title,
  status,
  isPublic,
  onToast,
}: {
  tournamentId: string;
  title: string;
  status: V1TournamentStatus;
  isPublic: boolean;
  onToast: ToastFn;
}) {
  const mutation = useV1UpdateTournamentVisibility(tournamentId);
  return (
    <CompetitionVisibilityRowAction
      title={title}
      noun="대회"
      isPublic={isPublic}
      hiddenReason={tournamentVisibilityHiddenReason(status)}
      mutation={mutation}
      onToast={onToast}
    />
  );
}

export function LeagueRowVisibilityAction({
  leagueId,
  title,
  isPublic,
  onToast,
}: {
  leagueId: string;
  title: string;
  isPublic: boolean;
  onToast: ToastFn;
}) {
  const mutation = useV1UpdateLeagueVisibility(leagueId);
  return (
    <CompetitionVisibilityRowAction title={title} noun="리그" isPublic={isPublic} mutation={mutation} onToast={onToast} />
  );
}
