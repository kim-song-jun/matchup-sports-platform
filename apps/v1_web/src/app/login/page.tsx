import { LoginPageView } from '@/components/auth/auth-page';
import { SessionEntryGate } from '@/components/auth/session-entry-gate';
import { getLoginViewModel } from '@/components/auth/auth.view-model';

export default function LoginPage() {
  return (
    <SessionEntryGate mode="login">
      <LoginPageView model={getLoginViewModel()} />
    </SessionEntryGate>
  );
}
