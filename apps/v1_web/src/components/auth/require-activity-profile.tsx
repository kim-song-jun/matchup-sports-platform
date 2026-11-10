'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { activityMissingFromAuthMe, buildActivityGateHref, currentReturnPath } from '@/lib/activity-profile-required';
import { ActivityGateChecklist } from './activity-gate-checklist';
import { hasPreviousInAppEntry, markAppInitiatedBack } from '@/lib/navigation-history';

/**
 * 정보 입력을 미룬 계정이 만들기·신청 화면에 들어오면 폼을 그리지 않고 행동별 시트를 먼저 띄운다.
 * RequireAuth 안쪽에서 쓴다(로딩·로그아웃 처리는 거기서 끝난 뒤다).
 */
export function RequireActivityProfile({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const authMe = useV1AuthMe();

  const missing = activityMissingFromAuthMe(authMe.data);
  if (missing.length === 0) return <>{children}</>;

  const enter = () => {
    router.push(buildActivityGateHref(currentReturnPath(), missing));
  };

  const dismiss = () => {
    if (hasPreviousInAppEntry()) {
      markAppInitiatedBack();
      router.back();
      return;
    }
    router.replace('/home');
  };

  return (
    <ConfirmModal
      open
      title={title.replace('정보가 필요해요', `${missing.length}가지가 더 필요해요`)}
      message="남은 항목만 입력하면 바로 이어서 할 수 있어요."
      details={<ActivityGateChecklist missing={missing} />}
      confirmLabel={missing[0] === 'interestSport' ? '관심 종목 고르기' : '정보 입력하기'}
      cancelLabel="다음에 할게요"
      onConfirm={enter}
      onCancel={dismiss}
    />
  );
}
