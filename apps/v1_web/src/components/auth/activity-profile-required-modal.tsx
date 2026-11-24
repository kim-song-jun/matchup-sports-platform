'use client';

import { useEffect, useState } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { browserAppRoute } from '@/lib/app-route';
import { closeOverlayThenNavigate } from '@/lib/overlay-history';
import {
  ACTIVITY_PROFILE_PATH,
  buildActivityGateHref,
  currentReturnPath,
  subscribeActivityProfileRequired,
  type ActivityMissingItem,
} from '@/lib/activity-profile-required';
import { ActivityGateChecklist } from './activity-gate-checklist';

/**
 * 정보 입력을 미룬 계정이 쓰기를 시도해 403 ACTIVITY_PROFILE_REQUIRED 를 받았을 때 뜨는 전역 시트.
 * 서버가 알려 준 남은 항목(details.missing)을 체크리스트로 보여 주고, 첫 항목 화면으로 보낸 뒤 원래 화면으로 돌아오게 한다.
 * PhoneVerificationRequiredModal 과 같은 이유로 next/navigation 훅 없이 하드 내비게이션을 쓴다.
 */
export function ActivityProfileRequiredModal() {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<ActivityMissingItem[]>([]);

  useEffect(
    () =>
      subscribeActivityProfileRequired((info) => {
        // 입력 화면 자신에서 난 실패까지 덮으면 입력을 이어갈 수 없다.
        if (window.location.pathname === ACTIVITY_PROFILE_PATH) return;
        setMissing(info.missing);
        setOpen(true);
      }),
    [],
  );

  const handleConfirm = () => {
    // 이동할 주소는 모달이 닫히기 전의 위치로 정한다.
    const href = browserAppRoute(buildActivityGateHref(currentReturnPath(), missing));
    // 모달을 닫으면 모달이 쌓아 둔 뒤로가기 표식을 걷으려고 history.back() 이 예약된다. 그 사이에 location.assign 을
    // 먼저 부르면 뒤로가기가 막 시작한 이동을 취소해, 서버엔 화면 요청이 도착하는데 화면은 그대로 남는다
    // (운영에서 "관심 종목 고르기" 버튼이 안 먹히던 원인). 닫기를 먼저 끝내고 이동한다.
    void closeOverlayThenNavigate(() => setOpen(false), () => window.location.assign(href));
  };

  const detailed = missing.length > 0;

  return (
    <ConfirmModal
      open={open}
      title={detailed ? `${missing.length}가지가 더 필요해요` : '활동하려면 정보가 필요해요'}
      message={
        detailed
          ? '남은 항목만 입력하면 바로 이어서 할 수 있어요.'
          : '이름·생년월일·성별과 휴대폰 인증을 한 번만 입력하면 바로 이어서 할 수 있어요.'
      }
      details={detailed ? <ActivityGateChecklist missing={missing} /> : undefined}
      confirmLabel={missing[0] === 'interestSport' ? '관심 종목 고르기' : '정보 입력하기'}
      cancelLabel="다음에 할게요"
      onConfirm={handleConfirm}
      onCancel={() => setOpen(false)}
    />
  );
}
