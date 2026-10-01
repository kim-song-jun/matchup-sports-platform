'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { V1ApiError, v1Delete, v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1MatchLifecycle } from '@/types/api';

export type MatchLifecyclePanelProps = {
  id: string;
  domain: 'matches' | 'team-matches';
  status: string;
  lifecycle: V1MatchLifecycle;
  canManage: boolean;
  current?: number;
  capacity?: number;
};

/** One shared action surface keeps mobile and desktop in the same lifecycle. */
export function MatchLifecyclePanel({ id, domain, status, lifecycle, canManage, current, capacity }: MatchLifecyclePanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'confirm-proceed' | 'delete' | 'cancel' | null>(null);
  const action = useMutation({
    mutationFn: (kind: 'confirm-proceed' | 'delete' | 'cancel') => kind === 'delete'
      ? v1Delete(`/${domain}/${id}`)
      : v1Post(`/${domain}/${id}/${kind}`, kind === 'cancel' ? { reason: 'host_cancelled_from_detail' } : {}),
    onSuccess: async (_, kind) => {
      setConfirmation(null);
      if (kind === 'delete') {
        router.replace(`/${domain}`);
        await queryClient.invalidateQueries({ queryKey: v1Keys.all, predicate: (query) => !(query.queryKey[1] === domain && query.queryKey[2] === id) });
        queryClient.removeQueries({ queryKey: [...v1Keys.all, domain, id] });
      } else {
        await queryClient.invalidateQueries({ queryKey: v1Keys.all });
      }
    },
    onError: (e) => {
      const message = extractErrorMessage(e, '처리에 실패했어요. 다시 시도해 주세요.');
      setError(e instanceof V1ApiError && e.statusCode === 409 && /^[\x00-\x7F]+$/.test(message)
        ? `매치 상태가 변경됐어요 (${e.code}). 새로고침 후 다시 시도해 주세요.` : message);
    },
  });
  const onHold = status === 'on_hold';
  if (!onHold && !canManage) return null;
  const terminal = ['completed', 'cancelled', 'archived'].includes(status);
  return (
    <section style={{ padding: 20, margin: '16px 0', background: 'var(--bg-card, white)', borderRadius: 'var(--radius-container)' }} aria-label="매치 진행 상태">
      <h2 className="tm-text-body-lg" style={{ margin: 0 }}>{onHold ? '보류 · 진행 결정 대기' : status === 'in_progress' ? '진행 중' : status === 'completion_pending' ? '종료 확인 필요' : status === 'scheduled' ? '진행 확정' : status === 'cancelled' ? '취소된 매치' : status === 'completed' ? '완료된 매치' : '매치 관리'}</h2>
      {onHold ? <p className="tm-text-body" style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
        {lifecycle.onHoldReason === 'NO_OPPONENT' ? '확정된 상대팀이 없어 보류됐어요. 주최팀이 일정을 변경하거나 취소할 수 있어요.'
          : lifecycle.onHoldReason === 'NO_PARTICIPANTS' ? '주최자 외 확정 참가자가 없어 보류됐어요. 일정을 변경해 다시 모집할 수 있어요.'
          : `현재 확정 인원은 ${current ?? 0}/${capacity ?? 0}명이에요. 주최자의 진행 결정을 기다리고 있어요.`}
      </p> : null}
      {canManage ? <>
        {lifecycle.canEdit && (current ?? 0) > 1 ? <p className="tm-text-caption" style={{ marginTop: 8 }}>일정·장소를 변경하면 기존 참가자에게 알리고 다시 신청받아요.</p> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {lifecycle.canConfirmProceed ? <button type="button" className="tm-btn tm-btn-md tm-btn-primary" disabled={action.isPending} onClick={() => { setError(null); setConfirmation('confirm-proceed'); }}>현재 인원으로 진행</button> : null}
          {lifecycle.canEdit ? <Link className="tm-btn tm-btn-md tm-btn-neutral" href={`/${domain}/${id}/edit`}>{onHold ? '일정 변경·다시 모집' : '내용 수정'}</Link> : null}
          {!terminal ? <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" disabled={action.isPending} onClick={() => { setError(null); setConfirmation('cancel'); }}>매치 취소</button> : null}
          {lifecycle.canDelete ? <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" disabled={action.isPending} onClick={() => { setError(null); setConfirmation('delete'); }}>매치 삭제</button> : null}
        </div>
        {confirmation ? <div style={{ marginTop: 12 }}>
          <p className="tm-text-body">{confirmation === 'confirm-proceed' ? `현재 ${current ?? 0}/${capacity ?? 0}명으로 진행할까요? 확정 참가자에게 알려요.` : confirmation === 'delete' ? '참가 이력이 없는 매치를 삭제할까요?' : '매치를 취소할까요? 확정 참가자에게 알려요.'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="tm-btn tm-btn-md tm-btn-primary" disabled={action.isPending} onClick={() => action.mutate(confirmation)}>{action.isPending ? '처리 중' : '확인'}</button>
            <button type="button" className="tm-btn tm-btn-md tm-btn-neutral" disabled={action.isPending} onClick={() => setConfirmation(null)}>돌아가기</button>
          </div>
        </div> : null}
      </> : null}
      {error ? <p role="alert" style={{ color: 'var(--red700)', marginTop: 12 }}>{error}</p> : null}
    </section>
  );
}
