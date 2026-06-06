import { AdminLoginPageView } from '@/components/auth/admin-login-page';
import { LoginPageView } from '@/components/auth/auth-page';
import { DevLoginPanel } from '@/components/auth/dev-login-panel';
import { SessionEntryGate } from '@/components/auth/session-entry-gate';
import { getLoginViewModel } from '@/components/auth/auth.view-model';
import { sanitizeRedirectPath } from '@/lib/session-storage';

type LoginSearchParams = {
  readonly redirect?: string | readonly string[];
};

type LoginPageProps = {
  readonly searchParams?: Promise<LoginSearchParams>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirect = sanitizeRedirectPath(firstSearchParam(params?.redirect));
  const isAdminRedirect = redirect?.startsWith('/admin') === true;
  const devLogin = <DevLoginPanel defaultEmail={isAdminRedirect ? 'admin@teameet.v1' : undefined} />;

  return (
    <SessionEntryGate mode="login">
      {isAdminRedirect ? <AdminLoginPageView redirect={redirect} devLogin={devLogin} /> : <LoginPageView devLogin={devLogin} model={getLoginViewModel()} />}
    </SessionEntryGate>
  );
}

function firstSearchParam(value: string | readonly string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
