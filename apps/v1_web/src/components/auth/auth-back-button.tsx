'use client';

import { ChevronLeftIcon } from '@/components/v1-ui/icons';

/**
 * AuthFrame 의 "동작하는" 뒤로가기(onClick) 만 따로 떼어 낸 클라이언트 컴포넌트.
 *
 * auth-page.tsx 는 'use client' 가 없는 중립 모듈이고 서버 컴포넌트 10여 곳이 AuthFrame 을
 * 직접 import 한다. 파일 전체를 클라이언트로 올리면 그 페이지들이 전부 클라이언트 번들로
 * 넘어가므로, 핸들러가 필요한 이 버튼만 경계를 명시한다 — 서버에서 onBack 을 넘기려 하면
 * 모호한 런타임 오류 대신 명확한 경계 오류가 난다.
 */
export function AuthBackButton({
  className,
  label,
  onClick,
}: {
  className: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={className} type="button" onClick={onClick} aria-label={label}>
      <ChevronLeftIcon size={22} strokeWidth={2.2} />
    </button>
  );
}
