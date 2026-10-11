import { EmailLoginClient } from '@/components/auth/email-login-client';
import { sanitizeRedirectPath } from '@/lib/session-storage';

export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectPath = sanitizeRedirectPath(typeof params.redirect === 'string' ? params.redirect : null);
  return <EmailLoginClient redirectPath={redirectPath} />;
}
