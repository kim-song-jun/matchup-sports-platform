'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { buildActivityProfileHref, currentReturnPath } from '@/lib/activity-profile-required';
import { hasPreviousInAppEntry, markAppInitiatedBack } from '@/lib/navigation-history';

/**
 * 정보 입력을 미룬 계정이 만들기·신청 화면에 들어오면 폼을 그리지 않고 행동별 시트를 먼저 띄운다.
 * RequireAuth 안쪽에서 쓴다(로딩·로그아웃 처리는 거기서 끝난 뒤다).
 */
export function RequireActivityProfile({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const authMe = useV1AuthMe();

  if (authMe.data?.user.onboardingStatus !== 'social_profile_deferred') return <>{children}</>;

  const enter = () => {
    router.push(buildActivityProfileHref(currentReturnPath()));
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
      title={title}
      message="이름·생년월일·성별과 휴대폰 인증을 한 번만 입력하면 바로 이어서 할 수 있어요."
      confirmLabel="정보 입력하기"
      cancelLabel="다음에 할게요"
      onConfirm={enter}
      onCancel={dismiss}
    />
  );
}
