'use client';

import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { autoLinkPromise } from '../sign-in-then-link-copy';
import type { V1LinkableProvider } from '@/types/api';

export const PHONE_CONFLICT_CODE = 'PHONE_CONFLICT';

type Props = {
  onLogin: () => void;
  onFindAccount: () => void;
  pending?: boolean;
  /**
   * 소셜 가입 중 번호 중복에서 서버가 연결 토큰을 준 경우의 제공자. 주면 "원래 방법으로 로그인하면
   * 이 소셜 로그인이 그 계정에 자동으로 연결돼요" 안내로 바뀐다. 생략하면 연결 약속 없는 기본 안내다.
   */
  linkProvider?: V1LinkableProvider;
};

/** 번호가 이미 다른 계정에 있을 때의 막다른 오류 대신 보여 주는 안내와 출구. */
export function PhoneConflictNotice({ onLogin, onFindAccount, pending = false, linkProvider }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AlertBanner
        tone="warning"
        message={linkProvider
          ? `이미 팀밋 계정이 있어요. ${autoLinkPromise(linkProvider)}`
          : '이 번호로 이미 가입한 계정이 있어요. 처음 가입할 때 쓴 방법(이메일 등)으로 로그인해 주세요.'}
      />
      {linkProvider ? (
        <p className="tm-text-caption" style={{ margin: 0, lineHeight: 1.5 }}>
          로그인이 끝나면 설정의 &quot;로그인 방법&quot; 화면으로 이동해요.
        </p>
      ) : null}
      <Button block disabled={pending} onClick={onLogin} size="lg" type="button" variant="primary">
        {linkProvider ? '원래 방법으로 로그인하기' : '기존 계정으로 로그인'}
      </Button>
      <Button block disabled={pending} onClick={onFindAccount} size="lg" type="button" variant="neutral">
        계정 찾기
      </Button>
    </div>
  );
}
