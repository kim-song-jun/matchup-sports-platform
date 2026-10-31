import { AccountExistsGuide } from '@/components/auth/account-exists-guide';
import { sanitizeRedirectPath } from '@/lib/session-storage';

export default async function AccountConflictPage({ searchParams }: {
  searchParams: Promise<{ provider?: string | string[]; redirect?: string | string[] }>;
}) {
  const query = await searchParams;
  const provider = query.provider === 'kakao' || query.provider === 'apple' ? query.provider : null;
  const redirect = typeof query.redirect === 'string' ? query.redirect : null;
  return <AccountExistsGuide provider={provider} redirectPath={sanitizeRedirectPath(redirect)} />;
}
