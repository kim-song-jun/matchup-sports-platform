import { LoginPageView } from '@/components/auth/auth-page';
import { DevLoginPanel } from '@/components/auth/dev-login-panel';
import { SessionEntryGate } from '@/components/auth/session-entry-gate';
import { getLoginViewModel } from '@/components/auth/auth.view-model';

export default function LoginPage() {
  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <SessionEntryGate mode="login">
      <LoginPageView devLogin={isDev ? <DevLoginPanel /> : undefined} model={getLoginViewModel()} />
    </SessionEntryGate>
  );
}
