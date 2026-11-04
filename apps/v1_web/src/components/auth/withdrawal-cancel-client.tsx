'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useV1CancelWithdrawal } from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { getLoginPathForRedirect } from '@/lib/session-storage';
import { clearWithdrawalCancel, readWithdrawalCancel, type StoredWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';
import { AUTH_NOTICE_STAGE, AuthExceptionPageView, AuthFrame } from './auth-page';
import { completeSignIn } from './email-login-completion';
import {
  getWithdrawalCancelNoticeModel,
  WithdrawalCancelDoneView,
  WithdrawalCancelIntroView,
  type WithdrawalCancelNotice,
} from './withdrawal-cancel-views';

type Outcome =
  | { kind: 'done'; destination: string }
  | { kind: 'notice'; notice: WithdrawalCancelNotice };

const CANCEL_FAILURE_FALLBACK = '탈퇴 신청을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.';

/**
 * 로그인 403 이 맡긴 철회 토큰(저장소)으로 탈퇴 신청을 취소하는 화면. 토큰이 없거나 만료됐으면 다시 로그인하게 한다.
 * 취소가 끝나면 로그인과 같은 후처리(`completeSignIn`)를 거친다.
 */
export function WithdrawalCancelClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cancelWithdrawal = useV1CancelWithdrawal();
  // undefined = 아직 저장소를 읽지 않음(서버 렌더와 첫 하이드레이션), null = 없거나 만료.
  const [stored, setStored] = useState<StoredWithdrawalCancel | null | undefined>(undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    setStored(readWithdrawalCancel());
  }, []);

  const closeConfirm = () => {
    if (cancelWithdrawal.isPending) return;
    setConfirmOpen(false);
    setConfirmError(null);
  };

  const keepWithdrawal = () => {
    clearWithdrawalCancel();
    router.replace(getLoginPathForRedirect(stored?.returnTo ?? ''));
  };

  const submitCancel = () => {
    if (!stored || cancelWithdrawal.isPending) return;
    setConfirmError(null);
    cancelWithdrawal.mutate({ token: stored.token }, {
      onSuccess: (result) => {
        const destination = completeSignIn({
          result,
          queryClient,
          requestedRedirect: stored.returnTo,
          method: 'withdrawal_cancel',
        });
        clearWithdrawalCancel();
        setConfirmOpen(false);
        setOutcome({ kind: 'done', destination });
      },
      onError: (error) => {
        const code = extractErrorCode(error);
        if (code === 'WITHDRAWAL_CANCEL_TOKEN_INVALID' || code === 'WITHDRAWAL_ALREADY_PROCESSED') {
          // 이 토큰으로는 다시 시도해도 같은 답이다.
          clearWithdrawalCancel();
          setConfirmOpen(false);
          setOutcome({ kind: 'notice', notice: code === 'WITHDRAWAL_ALREADY_PROCESSED' ? 'already-processed' : 'token-invalid' });
          return;
        }
        setConfirmError(extractErrorMessage(error, CANCEL_FAILURE_FALLBACK));
      },
    });
  };

  let body: ReactNode;
  if (outcome?.kind === 'done') {
    body = <WithdrawalCancelDoneView destination={outcome.destination} />;
  } else if (outcome?.kind === 'notice') {
    body = <AuthExceptionPageView model={getWithdrawalCancelNoticeModel(outcome.notice, stored?.returnTo ?? null)} />;
  } else if (stored === undefined) {
    body = (
      <AuthFrame topTitle="로그인 확인" backHref="/login" stage={AUTH_NOTICE_STAGE}>
        <div className="tm-auth-exception" aria-busy="true" />
      </AuthFrame>
    );
  } else if (stored === null) {
    body = <AuthExceptionPageView model={getWithdrawalCancelNoticeModel('login-required', null)} />;
  } else {
    body = <WithdrawalCancelIntroView onOpenConfirm={() => setConfirmOpen(true)} onKeep={keepWithdrawal} />;
  }

  return (
    <>
      {body}
      <ConfirmModal
        open={confirmOpen}
        title="탈퇴 신청을 취소하고 다시 쓸까요?"
        message="계정이 다시 활성화돼요. 신청할 때 빠진 팀과 경기 명단은 돌아오지 않아요. 필요하면 팀에 다시 가입 신청을 해 주세요."
        acknowledgement="빠진 팀·명단이 돌아오지 않는 것을 이해했어요"
        confirmLabel="취소하고 다시 쓰기"
        cancelLabel="그대로 두기"
        busy={cancelWithdrawal.isPending}
        error={confirmError}
        onConfirm={submitCancel}
        onCancel={closeConfirm}
      />
    </>
  );
}
