'use client';

import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';

export const PHONE_CONFLICT_CODE = 'PHONE_CONFLICT';

type Props = {
  onLogin: () => void;
  onFindAccount: () => void;
  pending?: boolean;
  /** 출구 동작 자체가 실패했을 때의 안내(예: 로그아웃 실패). */
  error?: string | null;
};

/** 번호가 이미 다른 계정에 있을 때의 막다른 오류 대신 보여 주는 안내와 출구. */
export function PhoneConflictNotice({ onLogin, onFindAccount, pending = false, error = null }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AlertBanner
        tone="warning"
        message="이 번호로 이미 가입한 계정이 있어요. 처음 가입할 때 쓴 방법(이메일 등)으로 로그인해 주세요."
      />
      {error ? <AlertBanner message={error} /> : null}
      <Button block disabled={pending} onClick={onLogin} size="lg" type="button" variant="primary">
        기존 계정으로 로그인
      </Button>
      <Button block disabled={pending} onClick={onFindAccount} size="lg" type="button" variant="neutral">
        계정 찾기
      </Button>
    </div>
  );
}
