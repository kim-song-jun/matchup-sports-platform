'use client';

import { useId, type ReactNode } from 'react';

/**
 * 할 수 없는 동작을 "왜 못 하는지와 함께" 보여준다.
 *
 * 비활성 버튼만 남기면 터치 기기에서는 이유를 읽을 방법이 없다 — hover 툴팁이
 * 없기 때문이다. 그래서 이유를 항상 버튼 아래 텍스트로 두고, 보조기술이 버튼을
 * 읽을 때 같이 읽도록 `aria-describedby`로 잇는다.
 *
 * 사유 문구는 도메인이 정한다(예: `describeTournamentRegistrationBlock`). 이
 * 컴포넌트는 문구를 만들지 않고 배치와 연결만 책임진다.
 */
export function BlockedAction({
  label,
  reason,
  className,
  buttonStyle,
  icon,
}: {
  /** 버튼에 보일 짧은 상태 — '접수 마감'처럼 무엇이 막혔는지. */
  label: ReactNode;
  /** 왜 막혔는지. 비어 있으면 안 된다 — 이유 없는 비활성이 이 컴포넌트가 없애려는 것이다. */
  reason: string;
  className?: string;
  buttonStyle?: React.CSSProperties;
  icon?: ReactNode;
}) {
  const reasonId = useId();
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button"
        className={className}
        style={buttonStyle}
        disabled
        aria-disabled="true"
        aria-describedby={reasonId}
      >
        {icon}
        {label}
      </button>
      <p
        id={reasonId}
        className="tm-text-caption"
        style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center' }}
      >
        {reason}
      </p>
    </div>
  );
}
