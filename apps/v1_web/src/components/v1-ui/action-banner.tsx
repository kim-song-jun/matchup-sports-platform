import type { ReactNode } from 'react';

type Props = {
  message: string;
  /** 문구 오른쪽(좁은 폭에서는 아래)에 놓이는 버튼·링크. 터치 영역 44px 는 `tm-btn-sm` 이 맡는다. */
  children: ReactNode;
  className?: string;
};

/**
 * 행동 버튼이 붙는 안내 띠. 문구만 받는 AlertBanner 와 달리 버튼 자리를 갖는다.
 * 지금 해야 할 일이 아니라 권유라서 polite 공지(role=status)다.
 */
export function ActionBanner({ message, children, className }: Props) {
  return (
    <div role="status" className={className ? `tm-action-banner ${className}` : 'tm-action-banner'}>
      <p className="tm-text-label tm-action-banner-message">{message}</p>
      <div className="tm-action-banner-actions">{children}</div>
    </div>
  );
}
