'use client';

import { useState } from 'react';
import { useV1CompleteMatch, useV1WithdrawMatchApplication } from '@/hooks/use-v1-api';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';

export function MatchParticipationActions({ matchId, canComplete, applicationId }: {
  matchId: string; canComplete: boolean; applicationId?: string | null;
}) {
  const complete = useV1CompleteMatch(matchId);
  const withdraw = useV1WithdrawMatchApplication(matchId, applicationId);
  const { confirm, ConfirmModal } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const pending = complete.isPending || withdraw.isPending;
  async function act() {
    const accepted = await confirm({
      title: canComplete ? '경기를 완료할까요?' : '참가를 취소할까요?',
      message: canComplete
        ? '승인된 참가자의 참여 이력과 활동 횟수에 반영돼요. 득점·승패는 기록하지 않으며, 완료 후 되돌릴 수 없어요.'
        : '확정 명단에서 빠지고 자리가 다시 비게 돼요. 다시 참여하려면 호스트의 승인이 필요해요.',
      confirmLabel: canComplete ? '경기 완료' : '참가 취소',
      tone: canComplete ? undefined : 'danger',
    });
    if (!accepted) return;
    setError(null);
    try {
      if (canComplete) await complete.mutateAsync();
      else await withdraw.mutateAsync({ reason: 'participant_withdrawn_before_start' });
    } catch (err) {
      setError(extractErrorMessage(err, '처리하지 못했어요. 다시 시도해 주세요.'));
    }
  }
  return <>
    {ConfirmModal}
    <Card pad={16} style={{ marginTop: 12 }}>
      <div className="tm-text-body-lg">{canComplete ? '참여 이력 확정' : '참가 변경'}</div>
      <p className="tm-text-caption" style={{ margin: '8px 0 12px' }}>
        {canComplete ? '경기가 끝났다면 완료하고 함께한 참여 이력을 남겨요.' : '참가 취소는 경기 시작 전까지 가능해요.'}
      </p>
      {error ? <AlertBanner message={error} tone="error" /> : null}
      <Button variant={canComplete ? 'primary' : 'neutral'} loading={pending} disabled={pending} onClick={() => void act()}>
        {canComplete ? '경기 완료' : '참가 취소'}
      </Button>
    </Card>
  </>;
}
