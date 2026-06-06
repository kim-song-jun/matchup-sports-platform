'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useV1DevLogin } from '@/hooks/use-v1-api';
import { sanitizeRedirectPath, saveStoredV1Session } from '@/lib/session-storage';

const personas = [
  { label: '호스트', email: 'host@teameet.v1' },
  { label: '참가자', email: 'applicant@teameet.v1' },
  { label: '팀 운영자', email: 'owner@teameet.v1' },
  { label: '운영자', email: 'admin@teameet.v1' },
];

export function DevLoginPanel({ defaultEmail = personas[0].email }: { readonly defaultEmail?: string } = {}) {
  const router = useRouter();
  const devLogin = useV1DevLogin();
  const [selectedEmail, setSelectedEmail] = useState(defaultEmail);

  const submit = () => {
    devLogin.mutate(
      { email: selectedEmail },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          const redirect = sanitizeRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
          router.replace(redirect ?? '/home');
        },
      },
    );
  };

  return (
    <div className="tm-auth-stack" style={{ marginTop: 12 }}>
      <select
        aria-label="간편 로그인 계정"
        className="tm-input tm-auth-input"
        disabled={devLogin.isPending}
        onChange={(event) => setSelectedEmail(event.target.value)}
        value={selectedEmail}
      >
        {personas.map((persona) => (
          <option key={persona.email} value={persona.email}>
            {persona.label}
          </option>
        ))}
      </select>
      <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" disabled={devLogin.isPending} onClick={submit} type="button">
        {devLogin.isPending ? '로그인 중...' : '간편 로그인'}
      </button>
      {devLogin.isError ? <p className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">간편 로그인에 실패했습니다. 계정을 다시 선택해 주세요.</p> : null}
    </div>
  );
}
