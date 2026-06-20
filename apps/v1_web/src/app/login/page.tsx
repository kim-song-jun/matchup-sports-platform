import { LoginPageView } from '@/components/auth/auth-page';
import { SessionEntryGate } from '@/components/auth/session-entry-gate';
import { getLoginViewModel } from '@/components/auth/auth.view-model';
import { sanitizeRedirectPath } from '@/lib/session-storage';

// searchParams는 Next.js App Router Server Component에서 동적으로 제공됨.
// redirect 파라미터를 sanitize해 이메일 로그인 href에 전파 → 세션 만료 후 복귀 흐름 보존.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.redirect === 'string' ? params.redirect : null;
  const redirectPath = sanitizeRedirectPath(raw);

  return (
    <SessionEntryGate mode="login">
      <LoginPageView model={getLoginViewModel(redirectPath)} />
    </SessionEntryGate>
  );
}
