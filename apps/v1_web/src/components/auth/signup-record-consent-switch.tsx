'use client';

import { useId } from 'react';

/**
 * Shared "경기 기록 공개" switch for the last step of every signup path (email and social).
 * Default-on is owned by the caller's state; this component is purely controlled.
 */
export function SignupRecordConsentSwitch({ checked, onChange }: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="tm-card" style={{ padding: 0 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        onClick={() => onChange(!checked)}
        className="tm-my-menu-row tm-pressable tm-noti-toggle-row"
        style={{ width: '100%', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span id={labelId} className="tm-text-label" style={{ display: 'block' }}>경기 기록 공개</span>
          <span id={hintId} className="tm-text-caption" style={{ display: 'block', marginTop: 3 }}>
            내 경기 기록·수상이 대회 페이지에 이름과 함께 보여요. 언제든 설정에서 끌 수 있어요.
          </span>
        </span>
        <span className={`tm-toggle ${checked ? 'tm-toggle-on' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}
