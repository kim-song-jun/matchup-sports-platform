'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';

export const TEAM_CHANGE_REASON_MAX_LENGTH = 200;

type Pending = { sideNames: string[]; resolve: (reason: string | null) => void };

/**
 * 이미 시작된 경기의 팀을 바꾸기 전에 확인과 사유를 받는다. 사유를 돌려주면(공백 제외) 호출자가 요청을 보내고,
 * 취소하면 null 이다. 서버가 같은 사유를 필수로 요구하므로(400 TEAM_CHANGE_REASON_REQUIRED) 빈 사유는 보내지 않는다.
 */
export function useStartedTeamChangeReason(): {
  requestReason: (sideNames: string[]) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');

  const requestReason = useCallback(
    (sideNames: string[]) =>
      new Promise<string | null>((resolve) => {
        setReason('');
        setPending({ sideNames, resolve });
      }),
    [],
  );

  const settle = (value: string | null) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = (
    <ConfirmModal
      open={pending !== null}
      title="시작된 경기의 팀을 바꿀까요?"
      message={`이 경기의 ${(pending?.sideNames ?? []).join('·')} 쪽 명단과 기록(득점·카드 등)이 지워지고 새 팀의 참가 명단으로 바뀌어요. 지운 기록은 되돌릴 수 없고, 상대 팀 기록은 그대로 남아요.`}
      confirmLabel="팀 바꾸기"
      tone="danger"
      reasonField={{
        label: '바꾸는 이유',
        value: reason,
        onChange: setReason,
        required: true,
        maxLength: TEAM_CHANGE_REASON_MAX_LENGTH,
        hint: '운영 기록에 남아요.',
      }}
      onConfirm={() => settle(reason.trim())}
      onCancel={() => settle(null)}
    />
  );

  return { requestReason, dialog };
}
