'use client';

import { useEffect, useState } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { browserAppRoute } from '@/lib/app-route';
import {
  ACTIVITY_PROFILE_PATH,
  buildActivityProfileHref,
  subscribeActivityProfileRequired,
} from '@/lib/activity-profile-required';

/**
 * 정보 입력을 미룬 계정이 쓰기를 시도해 403 ACTIVITY_PROFILE_REQUIRED 를 받았을 때 뜨는 전역 시트.
 * PhoneVerificationRequiredModal 과 같은 이유로 next/navigation 훅 없이 하드 내비게이션을 쓴다.
 */
export function ActivityProfileRequiredModal() {
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      subscribeActivityProfileRequired(() => {
        // 입력 화면 자신에서 난 실패까지 덮으면 입력을 이어갈 수 없다.
        if (window.location.pathname === ACTIVITY_PROFILE_PATH) return;
        setOpen(true);
      }),
    [],
  );

  const handleConfirm = () => {
    setOpen(false);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(browserAppRoute(buildActivityProfileHref(returnTo)));
  };

  return (
    <ConfirmModal
      open={open}
      title="활동하려면 정보가 필요해요"
      message="이름·생년월일·성별과 휴대폰 인증을 한 번만 입력하면 바로 이어서 할 수 있어요."
      confirmLabel="정보 입력하기"
      cancelLabel="다음에 할게요"
      onConfirm={handleConfirm}
      onCancel={() => setOpen(false)}
    />
  );
}
