'use client';

import { Card, ListItem } from '@/components/v1-ui/primitives';

type Props = {
  loginHref: string;
  findAccountHref: string;
};

/**
 * 이메일 가입에서 인증한 번호가 이미 계정에 쓰이고 있을 때의 안내와 출구.
 * 번호 소유 증명은 그 계정의 주인이라는 증명이 아니므로 가입 수단·이메일은 싣지 않는다.
 * "다른 번호로 인증"은 가입 화면의 하단 버튼이 맡는다.
 */
export function SignupPhoneRegisteredCard({ loginHref, findAccountHref }: Props) {
  return (
    <Card pad={16} className="tm-auth-soft-card" style={{ marginTop: 0 }}>
      <div role="status">
        <div className="tm-text-body-lg">이 번호로 가입된 팀밋 계정이 있어요</div>
        <div className="tm-text-caption" style={{ marginTop: 4, lineHeight: 1.5 }}>
          번호 인증은 잘 끝났어요. 같은 번호로는 계정을 하나만 만들 수 있어서, 가입했던 방법으로 로그인해 주세요.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <ListItem href={loginHref} title="기존 계정으로 로그인" sub="이메일 로그인으로 이동해요" chev />
        <ListItem href={findAccountHref} title="계정 찾기" sub="가입 방법이나 비밀번호가 기억나지 않아요" chev />
      </div>
    </Card>
  );
}
