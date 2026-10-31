'use client';

import { useEffect, useId, useRef } from 'react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import { isNativeAppleSignInAvailable } from '@/lib/native-apple';

type Props = {
  loginHref: string;
  socialLoginHref: string;
  findAccountHref: string;
  /** "카카오로 가입했어요" 줄을 눌러 로그인 첫 화면으로 나가기 직전에 부른다. */
  onSocialLoginSelect: () => void;
};

/**
 * 이메일 가입에서 인증한 번호가 이미 계정에 쓰이고 있을 때의 안내와 출구.
 * 번호 소유 증명은 그 계정의 주인이라는 증명이 아니므로 가입 수단·이메일은 싣지 않는다 —
 * 갈래 세 줄은 누구에게나 같은 일반 안내다. "다른 번호로 인증"은 가입 화면의 하단 버튼이 맡는다.
 * 소셜 줄 문구가 가리키는 "입력한 이메일 연결"은 그 줄로 나갈 때 `onSocialLoginSelect` 가 이메일을 보관해 이어 준다.
 */
export function SignupPhoneRegisteredCard({ loginHref, socialLoginHref, findAccountHref, onSocialLoginSelect }: Props) {
  const titleRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  // 인증 단계의 입력칸이 이 카드로 바뀌므로 포커스를 카드로 옮겨 키보드·스크린리더 사용자가 바뀐 줄 알게 한다.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  // Apple 버튼은 iOS 앱의 로그인 첫 화면에만 있다.
  const socialLabel = isNativeAppleSignInAvailable() ? '카카오·Apple' : '카카오';

  return (
    <Card pad={16} className="tm-auth-soft-card" style={{ marginTop: 0 }}>
      <div ref={titleRef} tabIndex={-1} aria-describedby={descriptionId} className="tm-text-body-lg">
        이 번호는 이미 가입돼 있어요
      </div>
      <div id={descriptionId} className="tm-text-caption" style={{ marginTop: 4, lineHeight: 1.5 }}>
        번호 인증은 잘 끝났어요. 같은 번호로는 계정을 하나만 만들 수 있어서, 가입했던 방법으로 로그인해 주세요.
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <ListItem href={loginHref} title="이메일로 가입했어요" sub="이메일 로그인으로 이동해요" chev />
        <ListItem
          href={socialLoginHref}
          title={`${socialLabel}로 가입했어요`}
          sub="로그인 첫 화면에서 그 버튼을 눌러요. 로그인한 뒤 방금 입력한 이메일도 연결할 수 있어요."
          chev
          onNavigate={onSocialLoginSelect}
        />
        <ListItem href={findAccountHref} title="비밀번호가 기억나지 않아요" sub="계정 찾기에서 다시 설정해요" chev />
      </div>
    </Card>
  );
}
