'use client';

import { useEffect, useState } from 'react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { consumeSignupPhotoNotice } from '@/lib/signup-photo-notice';

export const SIGNUP_PHOTO_NOTICE_MESSAGE = '프로필 사진은 올리지 못했어요. 프로필에서 다시 올릴 수 있어요.';

/**
 * 가입 완료 화면 위쪽에 놓는 안내. 이메일 가입은 끝났지만 사진만 올리지 못했을 때, 가입 화면이 남긴 표시를
 * 한 번 읽어 보여 준다. 표시는 브라우저에서만 알 수 있어 서버 렌더에는 아무것도 그리지 않는다.
 */
export function SignupPhotoNotice() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (consumeSignupPhotoNotice()) setShown(true);
  }, []);

  // 완료 화면 열은 왼쪽 정렬 flex 라 감싸는 칸이 폭을 채워야 배너가 단계 카드와 같은 폭이 된다.
  return shown ? (
    <div style={{ width: '100%' }}>
      <AlertBanner tone="warning" message={SIGNUP_PHOTO_NOTICE_MESSAGE} />
    </div>
  ) : null;
}
