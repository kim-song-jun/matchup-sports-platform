'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useV1DevLogin } from '@/hooks/use-v1-api';
import { sanitizeRedirectPath, saveStoredV1Session } from '@/lib/session-storage';

const personas = [
  { label: 'Host', email: 'host@teameet.v1' },
  { label: 'Applicant', email: 'applicant@teameet.v1' },
  { label: 'Team owner', email: 'owner@teameet.v1' },
];

export function DevLoginPanel() {
  const router = useRouter();
  const devLogin = useV1DevLogin();
  const [selectedEmail, setSelectedEmail] = useState(personas[0].email);

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
        aria-label="Mock login user"
        className="tm-input tm-auth-input"
        disabled={devLogin.isPending}
        onChange={(event) => setSelectedEmail(event.target.value)}
        value={selectedEmail}
      >
        {personas.map((persona) => (
          <option key={persona.email} value={persona.email}>
            {persona.label} - {persona.email}
          </option>
        ))}
      </select>
      <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" disabled={devLogin.isPending} onClick={submit} type="button">
        {devLogin.isPending ? 'Signing in...' : 'Mock login'}
      </button>
      {devLogin.isError ? <p className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">Seed user login failed. Run the v1 seed first.</p> : null}
    </div>
  );
}
