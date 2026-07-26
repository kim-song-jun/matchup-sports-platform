'use client';

import { useEffect, useState } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { browserAppRoute } from '@/lib/app-route';
import { subscribePhoneVerificationRequired } from '@/lib/phone-verification-required';
import { PHONE_VERIFY_PATH, buildPhoneVerifyHref } from './phone-verify-route';

/**
 * 미인증 계정이 쓰기(신청·등록·전송)를 시도해 서버가 403 PHONE_VERIFICATION_REQUIRED 로
 * 거절했을 때 뜨는 전역 안내. 앱 어디서 실패하든 같은 안내가 나오도록 Providers 에 하나만 둔다.
 *
 * 조회는 막지 않기 때문에 사용자는 미인증 상태로도 앱을 계속 둘러볼 수 있다 — 그래서 차단을
 * 페이지 전환이 아니라 "막힌 그 순간"에 알려주는 이 모달이 유일한 설명 지점이 된다.
 *
 * next/navigation 훅을 쓰지 않는다: 이 컴포넌트는 Providers 안에 상주해 모든 화면에서 렌더되는데,
 * useRouter 는 app router 컨텍스트가 없으면 즉시 throw 해서 무관한 화면·테스트까지 같이 죽는다.
 * 대신 신호가 온 시점의 실제 주소를 읽어 판단하고 하드 내비게이션으로 이동한다(인증 후 돌아오는
 * 화면이 차단 이전의 낡은 스냅샷을 재사용하지 않는 이점도 있다 — 인증 게이트도 같은 이유로 쓴다).
 */
export function PhoneVerificationRequiredModal() {
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      subscribePhoneVerificationRequired(() => {
        // 인증 화면 자신에서 난 실패까지 모달로 덮으면 인증을 이어갈 수 없다.
        if (window.location.pathname === PHONE_VERIFY_PATH) return;
        setOpen(true);
      }),
    [],
  );

  const handleConfirm = () => {
    setOpen(false);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(browserAppRoute(buildPhoneVerifyHref(returnTo)));
  };

  return (
    <ConfirmModal
      open={open}
      title="휴대폰 본인인증이 필요해요"
      message="안전한 이용을 위해 본인인증을 마쳐야 신청·등록 같은 기능을 쓸 수 있어요. 1분이면 끝나요."
      confirmLabel="인증하러 가기"
      cancelLabel="나중에"
      onConfirm={handleConfirm}
      onCancel={() => setOpen(false)}
    />
  );
}
