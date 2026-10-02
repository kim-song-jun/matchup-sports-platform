import { AccountRecoveryClient } from '@/components/auth/account-recovery-client';
import { sanitizeRedirectPath } from '@/lib/session-storage';

export default async function FindAccountPage({ searchParams }: {
  searchParams: Promise<{ mode?: string | string[]; from?: string | string[] }>;
}) {
  const query = await searchParams;
  return <AccountRecoveryClient
    initialMode={query.mode === 'reset-password' ? 'reset-password' : 'find-id'}
    backHref={sanitizeRedirectPath(typeof query.from === 'string' ? query.from : null) ?? '/login/email'}
  />;
}
