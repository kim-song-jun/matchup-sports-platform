'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { generateKakaoOAuthState, KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';

// 카카오 로그인 버튼(클라이언트). authorize 이동 직전 클릭 시점에 CSRF 방지 state를 생성·저장한 뒤
// state를 붙인 URL로 이동한다. state 저장이 SSR 시점이 아닌 실제 브라우저에서 일어나야
// kakao-callback-client.tsx의 대조 검증이 성립한다(로그인 CSRF/세션 고정 방지).
export function KakaoLoginButton({
  href,
  label,
  className,
  style,
}: {
  href: string;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const state = generateKakaoOAuthState();
    try {
      window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, state);
    } catch {
      // sessionStorage 사용 불가(프라이빗 모드/quota 초과) 시 CSRF 방지 state를 저장할 수 없어
      // 안전한 로그인이 불가능하다. 조용히 실패하지 않고 사용자에게 알린 뒤 중단한다(fail-closed).
      window.alert('브라우저 설정으로 로그인을 진행할 수 없어요. 시크릿/프라이빗 모드를 끄고 다시 시도해 주세요.');
      return;
    }
    const separator = href.includes('?') ? '&' : '?';
    window.location.href = `${href}${separator}state=${encodeURIComponent(state)}`;
  };

  return (
    <a className={className} href={href} style={style} onClick={handleClick}>
      {label}
    </a>
  );
}
