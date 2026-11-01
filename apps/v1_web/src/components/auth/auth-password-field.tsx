'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { EyeIcon, EyeOffIcon } from '@/components/v1-ui/icons';

type Props = {
  /** 라벨 내용. 필수 표시 같은 조각을 함께 줄 수 있다. */
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** 새 비밀번호를 정하는 칸이 기본이다. */
  autoComplete?: 'new-password' | 'current-password';
  /** 입력 아래 한 줄. 오류는 즉시 읽히는 alert, 성공은 조용한 안내다. */
  feedback?: { kind: 'error' | 'success'; message: string } | null;
};

/** 보기/숨기기 토글이 붙은 비밀번호 입력칸. 가입과 이메일 로그인 연결이 같은 칸을 쓴다. */
export function AuthPasswordField({ label, value, onChange, placeholder, autoComplete = 'new-password', feedback = null }: Props) {
  const inputId = useId();
  const feedbackId = useId();
  const [visible, setVisible] = useState(false);
  const stateClass = feedback?.kind === 'error' ? 'tm-auth-input-error' : feedback?.kind === 'success' ? 'tm-auth-input-success' : '';

  return (
    <div className="tm-auth-field">
      <label className="tm-text-label" htmlFor={inputId}>{label}</label>
      <span className="tm-auth-password-field">
        <input
          id={inputId}
          className={`tm-input tm-auth-input ${stateClass}`}
          minLength={8}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={visible ? 'text' : 'password'}
          value={value}
          aria-invalid={feedback?.kind === 'error' ? true : undefined}
          aria-describedby={feedback ? feedbackId : undefined}
        />
        <button
          className="tm-auth-password-toggle"
          type="button"
          aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
        </button>
      </span>
      {feedback ? (
        <span
          id={feedbackId}
          role={feedback.kind === 'error' ? 'alert' : undefined}
          className={`tm-text-caption tm-auth-field-helper ${feedback.kind === 'error' ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}
