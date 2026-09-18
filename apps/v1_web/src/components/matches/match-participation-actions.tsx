'use client';

import { useState } from 'react';
import { useV1WithdrawMatchApplication } from '@/hooks/use-v1-api';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';

export function MatchParticipationActions({ matchId, applicationId }: {
  matchId: string; applicationId?: string | null;
}) {
  const withdraw = useV1WithdrawMatchApplication(matchId, applicationId);
  const { confirm, ConfirmModal } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const pending = withdraw.isPending;
  async function act() {
    const accepted = await confirm({
      title: '참가를 취소할까요?',
      message: '확정 명단에서 빠지고 자리가 다시 비게 돼요. 다시 참여하려면 호스트의 승인이 필요해요.',
      confirmLabel: '참가 취소',
      tone: 'danger',
    });
    if (!accepted) return;
    setError(null);
    try {
      await withdraw.mutateAsync({ reason: 'participant_withdrawn_before_start' });
    } catch (err) {
      setError(extractErrorMessage(err, '처리하지 못했어요. 다시 시도해 주세요.'));
    }
  }
  return <>
    {ConfirmModal}
    <Card pad={16} style={{ marginTop: 12 }}>
      <div className="tm-text-body-lg">참가 변경</div>
      <p className="tm-text-caption" style={{ margin: '8px 0 12px' }}>
        참가 취소는 경기 시작 전까지 가능해요.
      </p>
      {error ? <AlertBanner message={error} tone="error" /> : null}
      <Button variant="neutral" loading={pending} disabled={pending} onClick={() => void act()}>
        참가 취소
      </Button>
    </Card>
  </>;
}
