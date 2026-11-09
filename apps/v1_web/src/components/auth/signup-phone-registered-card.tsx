'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import { isNativeAppleSignInAvailable } from '@/lib/native-apple';
import { clearPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { usableWithdrawalDate } from '@/lib/withdrawal-grace';
import { RecycledNumberHelp } from './recycled-number-help';
import { WithdrawalPendingGuide } from './withdrawal-pending-guide';

type Props = {
  /** 번호를 쥔 계정이 탈퇴 유예 중이면 유예가 끝나는 시각(ISO). 아니거나 이미 지났으면 null — 일반 안내를 보여 준다. */
  withdrawalPendingUntil: string | null;
  loginHref: string;
  socialLoginHref: string;
  findAccountHref: string;
  /** 가입 화면에서 이미 적은 이메일. 번호 인증이 첫 단계라 보통은 아직 없고(null), 있으면 연결 화면에 미리 채워진다. */
  typedEmail: string | null;
  /** 로그인한 뒤 연결을 마치거나 미루고 돌아갈 곳 — 가입 화면이 이어받은 원래 목적지. */
  returnTo: string | null;
};

/**
 * 이메일 가입에서 인증한 번호가 이미 계정에 쓰이고 있을 때의 안내와 출구.
 * 번호 소유 증명은 그 계정의 주인이라는 증명이 아니므로 가입 수단·이메일은 싣지 않는다 —
 * 갈래 세 줄과 로그인 버튼은 누구에게나 같은 일반 안내다. "다른 번호로 인증"은 가입 화면의 하단 버튼이 맡는다.
 * 그 계정이 탈퇴 유예 중이면 일반 안내 대신 두 가지 방법(로그인해서 취소 · 기다리기)을 보여 준다.
 * "로그인하고 이 이메일 연결하기" 줄은 이어 가려는 뜻을 받아 로그인 뒤 이메일 연결 화면으로 자동으로 이어 주려고
 * 이 탭에 보관하고(이메일을 이미 적었으면 함께), 다른 줄은 보관해 둔 뜻을 거둔다. 비밀번호는 이 카드가 알지 못한다.
 */
export function SignupPhoneRegisteredCard({ withdrawalPendingUntil, loginHref, socialLoginHref, findAccountHref, typedEmail, returnTo }: Props) {
  const titleRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const graceEnd = usableWithdrawalDate(withdrawalPendingUntil);
  const withdrawalGuide = graceEnd !== null;
  // 인증 단계의 입력칸이 이 카드로 바뀌므로 포커스를 카드로 옮겨 키보드·스크린리더 사용자가 바뀐 줄 알게 한다.
  // 탈퇴 유예 안내는 제목 블록이 스스로 포커스를 가져간다.
  useEffect(() => {
    if (!withdrawalGuide) titleRef.current?.focus();
  }, [withdrawalGuide]);

  if (withdrawalGuide) {
    return (
      <WithdrawalPendingGuide
        focusHeadingOnMount
        until={graceEnd}
        head={{
          title: '이 번호는 탈퇴를 신청한 계정이 쓰고 있어요',
          lead: '번호 인증은 잘 끝났어요. 이 번호를 다시 쓰는 방법은 두 가지예요.',
        }}
        steps={[
          { title: '가입했던 계정으로 로그인해요' },
          { title: '탈퇴 신청을 취소해요', body: '로그인하면 취소할 수 있는 화면이 나와요.' },
          { title: '새로 가입하지 않아도 돼요', body: '그 계정을 그대로 쓰면 돼요.' },
        ]}
        waitedText="이 번호로 새로 가입할 수 있어요"
        // 이 안내는 가입 수단을 모른다 — 이메일·소셜이 한 화면에 있는 로그인 첫 화면으로 보낸다.
        actions={<Link className="tm-btn tm-btn-lg tm-btn-block tm-btn-primary" href={socialLoginHref}>로그인하고 탈퇴 취소하기</Link>}
      />
    );
  }

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
        <ListItem href={loginHref} title="이메일로 가입했어요" sub="이메일 로그인으로 이동해요" chev onNavigate={clearPendingEmailLink} />
        <ListItem
          href={socialLoginHref}
          title={`${socialLabel}로 로그인하고 이 이메일 연결하기`}
          sub={`${typedEmail === null ? '로그인하면 연결할 이메일을 직접 적어요.' : `로그인하면 ${typedEmail} 연결을 바로 이어서 도와요.`} 비밀번호는 저장하지 않아요.`}
          chev
          onNavigate={() => { savePendingEmailLink({ email: typedEmail, returnTo }); }}
        />
        <ListItem
          href={socialLoginHref}
          title={`${socialLabel}로만 로그인할래요`}
          sub="이메일은 연결하지 않고 로그인만 해요"
          chev
          onNavigate={clearPendingEmailLink}
        />
        <ListItem href={findAccountHref} title="비밀번호가 기억나지 않아요" sub="계정 찾기에서 다시 설정해요" chev onNavigate={clearPendingEmailLink} />
      </div>
      <RecycledNumberHelp spaced />
    </Card>
  );
}
