'use client';

import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { RecycledNumberHelp } from '../recycled-number-help';
import { autoLinkPromise } from '../sign-in-then-link-copy';
import type { V1LinkableProvider } from '@/types/api';

type Props = {
  onLogin: () => void;
  onFindAccount: () => void;
  pending?: boolean;
  /**
   * 소셜 가입 중 번호 중복에서 서버가 연결 토큰을 준 경우의 제공자. 주면 "원래 방법으로 로그인하면
   * 이 소셜 로그인이 그 계정에 자동으로 연결돼요" 안내로 바뀐다. 생략하면 연결 약속 없는 기본 안내다.
   */
  linkProvider?: V1LinkableProvider;
  /** 번호를 쥔 계정이 탈퇴 유예 중이다. 로그인 버튼은 두 가지 방법을 보여 주는 안내 화면으로 이어진다. */
  withdrawalPending?: boolean;
  /** 번호를 새로 받은 사람을 위한 고객센터 링크 한 줄을 끝에 붙인다. 탈퇴 신청 중 안내에는 붙지 않는다. */
  recycledNumberHelp?: boolean;
};

/** 번호가 이미 다른 계정에 있을 때의 막다른 오류 대신 보여 주는 안내와 출구. */
export function PhoneConflictNotice({ onLogin, onFindAccount, pending = false, linkProvider, withdrawalPending = false, recycledNumberHelp = false }: Props) {
  const withdrawal = withdrawalPending && linkProvider !== undefined;
  const bannerMessage = withdrawal
    ? '이미 팀밋 계정이 있지만 탈퇴를 신청한 상태예요. 취소하고 다시 쓰는 방법을 안내해 드려요.'
    : linkProvider
      ? `이미 팀밋 계정이 있어요. ${autoLinkPromise(linkProvider)}`
      : '이 번호로 이미 가입한 계정이 있어요. 처음 가입할 때 쓴 방법(이메일 등)으로 로그인해 주세요.';
  let loginLabel = '기존 계정으로 로그인';
  if (withdrawal) loginLabel = '다시 쓰는 방법 보기';
  else if (linkProvider) loginLabel = '원래 방법으로 로그인하기';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AlertBanner tone="warning" message={bannerMessage} />
      {linkProvider && !withdrawal ? (
        <p className="tm-text-caption" style={{ margin: 0, lineHeight: 1.5 }}>
          로그인이 끝나면 설정의 &quot;로그인 방법&quot; 화면으로 이동해요.
        </p>
      ) : null}
      <Button block disabled={pending} onClick={onLogin} size="lg" type="button" variant="primary">
        {loginLabel}
      </Button>
      <Button block disabled={pending} onClick={onFindAccount} size="lg" type="button" variant="neutral">
        계정 찾기
      </Button>
      {recycledNumberHelp && !withdrawal ? <RecycledNumberHelp /> : null}
    </div>
  );
}
