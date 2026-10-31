'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Link2, Mail, MessageCircle } from 'lucide-react';
import { useSignOutAndLeave } from '@/components/auth/use-sign-out-and-leave';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { Button } from '@/components/v1-ui/button';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useToast } from '@/components/v1-ui/toast';
import { useV1AuthMe, useV1LinkApple, useV1LinkKakao } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { getSignupIncompleteRoute } from '@/lib/auth-link-errors';
import { reportClientError } from '@/lib/client-error-reporter';
import { startKakaoLinkAuthorize } from '@/lib/kakao-oauth';
import {
  LOGIN_METHODS_PATH,
  linkResultFromError,
  linkResultFromSuccess,
  readLinkResultQuery,
  withoutLinkResultQuery,
} from '@/lib/link-result';
import type { LinkOutcome } from '@/lib/link-result';
import { isNativeAppleSignInAvailable } from '@/lib/native-apple';
import { isNativeKakaoSignInAvailable } from '@/lib/native-kakao';
import { requestNativeAppleLinkPayload, requestNativeKakaoLinkPayload } from '@/lib/native-social-credentials';
import type { NativeCredentialResult } from '@/lib/native-social-credentials';
import type { V1LinkableProvider, V1LinkSocialResult } from '@/types/api';
import { LinkResultNotice, linkSuccessToast } from './link-result-notice';

const RELOGIN_PATH = `/login?redirect=${encodeURIComponent(LOGIN_METHODS_PATH)}`;

const KAKAO_START_ERRORS = {
  'not-configured': '카카오 연결을 지금은 쓸 수 없어요. 잠시 후 다시 시도해 주세요.',
  'storage-unavailable': '브라우저 설정 때문에 연결을 진행할 수 없어요. 시크릿/프라이빗 모드를 끄고 다시 시도해 주세요.',
} as const;

const PROVIDER_CIRCLE = {
  width: 36,
  height: 36,
  borderRadius: 'var(--radius-circle)',
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
} as const;

function ProviderMark({ provider }: { provider: 'email' | 'kakao' | 'apple' | 'other' }) {
  if (provider === 'apple') {
    // 마크는 Apple 이 내려준 아트워크 그대로다(public/apple/README.md) — 자르거나 다시 그리지 않는다.
    return (
      <span
        aria-hidden="true"
        style={{ ...PROVIDER_CIRCLE, backgroundImage: 'url(/apple/sign-in-mark-on-black.png)', backgroundSize: 'cover' }}
      />
    );
  }
  if (provider === 'kakao') {
    return (
      <span aria-hidden="true" style={{ ...PROVIDER_CIRCLE, background: 'var(--kakao-yellow)' }}>
        <MessageCircle size={18} fill="var(--static-black)" stroke="var(--static-black)" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ ...PROVIDER_CIRCLE, background: 'var(--grey150)', color: 'var(--text-strong)' }}>
      {provider === 'email' ? <Mail size={18} /> : <Link2 size={18} />}
    </span>
  );
}

function ConnectedBadge() {
  return (
    <span className="tm-badge tm-badge-grey" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
      연결됨
    </span>
  );
}

function ProviderRow({
  mark,
  label,
  caption,
  badge,
  action,
  divided = true,
}: {
  mark: Parameters<typeof ProviderMark>[0]['provider'];
  label: string;
  caption: string;
  badge?: ReactNode;
  action?: ReactNode;
  /** 앞 줄과 구분선으로 나눈다. 목록의 첫 줄만 끈다. */
  divided?: boolean;
}) {
  return (
    <li style={{ listStyle: 'none', ...(divided ? { borderTop: '1px solid var(--list-row-border)', paddingTop: 12 } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ProviderMark provider={mark} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{label}</div>
          <div className="tm-text-caption" style={{ wordBreak: 'keep-all' }}>{caption}</div>
        </div>
        {badge}
      </div>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </li>
  );
}

export function LoginMethodsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authMe = useV1AuthMe();
  const linkKakao = useV1LinkKakao();
  const linkApple = useV1LinkApple();
  const signOut = useSignOutAndLeave();
  const { showToast, hideToast, toast } = useToast();

  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<V1LinkableProvider | null>(null);
  const [nativeApple, setNativeApple] = useState(false);

  // 브리지 존재 여부는 브라우저에서만 알 수 있다 — 서버 렌더에는 Apple 버튼이 없고 하이드레이션 뒤에 나타난다.
  useEffect(() => setNativeApple(isNativeAppleSignInAvailable()), []);

  // 뒤로가기(bfcache)로 돌아오면 이동 중이던 시도는 끝난 것이다.
  useEffect(() => {
    const release = () => setActiveProvider(null);
    window.addEventListener('pageshow', release);
    return () => window.removeEventListener('pageshow', release);
  }, []);

  const present = useCallback((next: LinkOutcome) => {
    setOutcome(next);
    const message = linkSuccessToast(next);
    if (message) showToast(message);
  }, [showToast]);

  // 카카오 인가를 다녀온 결과는 주소로 온다. 안내로 옮긴 뒤 주소에서는 지워 새로고침이 다시 보여 주지 않게 한다.
  useEffect(() => {
    const fromQuery = readLinkResultQuery(searchParams);
    if (!fromQuery) return;
    present(fromQuery);
    router.replace(withoutLinkResultQuery(pathname, new URLSearchParams(searchParams.toString())), { scroll: false });
  }, [searchParams, pathname, router, present]);

  // 시작한 시도가 끝날 때까지 두 연결 버튼이 모두 잠긴다. 카카오 인가를 두 번 시작하면 먼저 저장한 state 가 덮어써진다.
  const begin = (provider: V1LinkableProvider) => {
    setActiveProvider(provider);
    setOutcome(null);
    setStartError(null);
    hideToast();
  };

  const finish = () => setActiveProvider(null);

  const linkWithNativeCredential = async <Payload,>(
    provider: V1LinkableProvider,
    request: () => Promise<NativeCredentialResult<Payload>>,
    link: (payload: Payload) => Promise<V1LinkSocialResult>,
  ) => {
    try {
      const credential = await request();
      if (credential.status === 'cancelled') return;
      if (credential.status === 'failed') {
        reportClientError({ message: `Native ${provider} link failed`, level: 'warn', context: { reason: credential.reason } });
        present({ linkResult: 'failed', provider });
        return;
      }
      present({ linkResult: linkResultFromSuccess(await link(credential.payload)), provider });
    } catch (error) {
      const signupRoute = getSignupIncompleteRoute(error);
      if (signupRoute) {
        router.replace(signupRoute);
        return;
      }
      // API 오류는 api-client 가 이미 보고한다. 브리지 오류(시간 초과·브리지 없음)만 여기서 남긴다.
      if (!(error instanceof V1ApiError)) {
        reportClientError({
          message: `Native ${provider} link bridge error`,
          stack: error instanceof Error ? error.stack : undefined,
          level: 'warn',
        });
      }
      present({ linkResult: linkResultFromError(error), provider });
    } finally {
      finish();
    }
  };

  const connectKakao = async () => {
    begin('kakao');
    if (isNativeKakaoSignInAvailable()) {
      await linkWithNativeCredential('kakao', requestNativeKakaoLinkPayload, (payload) => linkKakao.mutateAsync(payload));
      return;
    }
    const started = await startKakaoLinkAuthorize({ returnTo: LOGIN_METHODS_PATH });
    // 인가가 시작되면 화면을 떠나므로 busy 를 유지한다.
    if (started.status === 'unavailable') {
      setStartError(KAKAO_START_ERRORS[started.reason]);
      finish();
    }
  };

  const connectApple = async () => {
    begin('apple');
    await linkWithNativeCredential('apple', requestNativeAppleLinkPayload, (payload) => linkApple.mutateAsync(payload));
  };

  const reLogin = () => {
    void signOut.signOutAndLeave(RELOGIN_PATH, { failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.' });
  };

  const providers = authMe.data?.user.authProviders;
  if (authMe.isError || (authMe.data && !providers)) {
    return <ErrorState message="로그인 방법을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void authMe.refetch()} />;
  }
  if (!authMe.data || !providers) return <PageSkeleton variant="form" />;

  const has = (provider: string) => providers.includes(provider);
  const busy = activeProvider !== null;

  return (
    <div className="tm-my-shell tm-content-enter">
      <div className="tm-my-settings-desktop">
        <div className="tm-desktop-page-head tm-show-desktop">
          <AppBackLink className="tm-desktop-back" fallbackHref="/my/settings">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </AppBackLink>
          <h1 className="tm-text-heading">로그인 방법</h1>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <p className="tm-text-body" style={{ margin: 0, color: 'var(--text-muted)', wordBreak: 'keep-all' }}>
            이 계정에 연결된 로그인 방법이에요. 카카오나 Apple을 연결하면 같은 계정으로 바로 로그인할 수 있어요.
          </p>
          {outcome ? (
            <LinkResultNotice
              outcome={outcome}
              onDismiss={() => setOutcome(null)}
              onRelogin={reLogin}
              relogin={{ pending: signOut.pending, error: signOut.error }}
            />
          ) : null}
          {startError ? (
            <p className="tm-text-label" role="alert" style={{ margin: 0, color: 'var(--red700)' }}>{startError}</p>
          ) : null}
          <Card pad={16}>
            <ul role="list" aria-label="로그인 방법 목록" style={{ margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {has('email') ? (
                <ProviderRow
                  mark="email"
                  label="이메일 로그인"
                  caption={authMe.data.user.email ?? '이메일과 비밀번호로 로그인해요'}
                  badge={<ConnectedBadge />}
                  divided={false}
                />
              ) : null}
              {has('kakao') ? (
                <ProviderRow
                  mark="kakao"
                  label="카카오 로그인"
                  caption="카카오 버튼으로 이 계정에 들어와요"
                  badge={<ConnectedBadge />}
                  divided={has('email')}
                />
              ) : (
                <ProviderRow
                  mark="kakao"
                  label="카카오 로그인"
                  caption="연결하면 카카오 버튼으로도 이 계정에 들어와요"
                  divided={has('email')}
                  action={
                    <Button
                      size="lg"
                      variant="outline"
                      block
                      loading={activeProvider === 'kakao'}
                      disabled={busy}
                      onClick={() => void connectKakao()}
                      style={{
                        background: 'var(--kakao-yellow)',
                        color: 'var(--static-black)',
                        borderColor: 'transparent',
                        opacity: busy && activeProvider !== 'kakao' ? 0.58 : 1,
                      }}
                    >
                      {activeProvider === 'kakao' ? '연결 중이에요…' : '카카오 연결하기'}
                    </Button>
                  }
                />
              )}
              {has('apple') ? (
                <ProviderRow mark="apple" label="Apple 로그인" caption="Apple 버튼으로 이 계정에 들어와요" badge={<ConnectedBadge />} />
              ) : nativeApple ? (
                <ProviderRow
                  mark="apple"
                  label="Apple 로그인"
                  caption="연결하면 Apple 버튼으로도 이 계정에 들어와요"
                  action={
                    <button
                      type="button"
                      className="tm-btn tm-btn-lg tm-btn-block tm-auth-apple"
                      disabled={busy}
                      aria-busy={activeProvider === 'apple' || undefined}
                      onClick={() => void connectApple()}
                    >
                      <span className="tm-auth-apple-mark" aria-hidden="true" />
                      {activeProvider === 'apple' ? '연결 중이에요…' : 'Apple 연결하기'}
                    </button>
                  }
                />
              ) : (
                <ProviderRow
                  mark="apple"
                  label="Apple 로그인"
                  caption="Apple 연결은 iOS 앱에서 할 수 있어요"
                  badge={<span className="tm-badge tm-badge-grey">앱에서만</span>}
                />
              )}
              {has('naver') ? (
                <ProviderRow mark="other" label="네이버 로그인" caption="네이버 버튼으로 이 계정에 들어와요" badge={<ConnectedBadge />} />
              ) : null}
            </ul>
          </Card>
          {!has('kakao') ? (
            <p className="tm-text-caption" style={{ margin: 0, paddingInline: 4 }}>
              연결할 때 카카오 화면으로 이동했다가 돌아와요. 연결해도 팀과 경기 기록은 그대로예요.
            </p>
          ) : null}
        </div>
      </div>
      {toast}
    </div>
  );
}
