'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Smartphone } from 'lucide-react';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { Button } from '@/components/v1-ui/button';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { AlertBanner, Card, InfoRow } from '@/components/v1-ui/primitives';
import { useV1AuthMe, useV1RevokeOtherSessions } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { LOGIN_METHOD_NAME, signInMethods } from '@/lib/login-method';
import { withFromPath } from '@/lib/session-storage';

const LOGIN_DEVICES_PATH = '/my/settings/devices';

/**
 * 기기를 잃어버렸을 때 함께 챙길 것. 비밀번호가 있는 계정은 비밀번호 변경으로 이어 주고,
 * 소셜로만 들어오는 계정은 바꿀 비밀번호가 팀밋에 없으므로 링크 없이 그 소셜 계정의 보안을 말한다.
 */
function LostDeviceTip({ hasPassword, providers }: { hasPassword: boolean; providers: readonly string[] }) {
  if (hasPassword) {
    return (
      <p className="tm-text-caption" style={{ margin: 0, paddingInline: 4 }}>
        기기를 잃어버렸다면{' '}
        <Link className="tm-auth-inline-link" href={withFromPath('/auth/find-account?mode=reset-password', LOGIN_DEVICES_PATH)}>
          비밀번호 변경
        </Link>
        도 함께 해 두면 더 안전해요.
      </p>
    );
  }
  // 비밀번호가 없는 계정이므로 로그인에 쓰는 수단은 소셜뿐이다.
  const accounts = signInMethods(providers, false).map((method) => LOGIN_METHOD_NAME[method]);
  return (
    <p className="tm-text-caption" style={{ margin: 0, paddingInline: 4 }}>
      기기를 잃어버렸다면 {accounts.length > 0 ? `${accounts.join('·')} 계정` : '로그인에 쓰는 계정'}의 보안도 함께 확인해 두면 더 안전해요.
    </p>
  );
}

export function LoginDevicesPageClient() {
  const authMe = useV1AuthMe();
  const revokeOthers = useV1RevokeOtherSessions();
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    setError(null);
    try {
      await revokeOthers.mutateAsync();
      setRevoked(true);
    } catch (err) {
      setRevoked(false);
      setError(extractErrorMessage(err, '다른 기기에서 로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  };

  const user = authMe.data?.user;

  return (
    <div className="tm-my-shell tm-content-enter">
      <div className="tm-my-settings-desktop">
        <div className="tm-desktop-page-head tm-show-desktop">
          <AppBackLink className="tm-desktop-back" fallbackHref="/my/settings">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </AppBackLink>
          <h1 className="tm-text-heading">로그인 기기</h1>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
          {revoked ? <AlertBanner tone="info" message="다른 기기에서 모두 로그아웃했어요. 이 기기는 그대로 로그인돼 있어요." /> : null}
          {error ? <AlertBanner tone="error" message={error} /> : null}
          <Card pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                aria-hidden="true"
                className="tm-on-tint"
                style={{
                  width: 36,
                  height: 36,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 'var(--radius-circle)',
                  background: 'var(--blue50)',
                  color: 'var(--blue500)',
                }}
              >
                <Smartphone size={18} />
              </span>
              <h2 className="tm-text-body-lg" style={{ margin: 0 }}>다른 기기의 로그인을 끊어요</h2>
            </div>
            {revoked ? (
              <p className="tm-text-label" style={{ margin: '8px 0 0', color: 'var(--text-muted)', wordBreak: 'keep-all' }}>
                방금 정리했어요. 다시 끊으려면 한 번 더 누르세요.
              </p>
            ) : (
              <>
                <p className="tm-text-label" style={{ margin: '12px 0 0', color: 'var(--text-muted)', wordBreak: 'keep-all', lineHeight: 1.6 }}>
                  잃어버린 휴대폰이나 남의 기기에 로그인해 둔 게 걱정될 때 써요.
                </p>
                <div style={{ marginTop: 8 }}>
                  <InfoRow label="이 기기" value="로그인 유지" />
                  <InfoRow label="다른 기기" value="모두 로그아웃" />
                  <InfoRow label="비밀번호·계정 정보" value="그대로예요" isLast />
                </div>
              </>
            )}
          </Card>
          <Button
            size="lg"
            variant={revoked ? 'neutral' : 'primary'}
            block
            loading={revokeOthers.isPending}
            onClick={() => void revoke()}
          >
            {revoked ? '다시 한 번 로그아웃' : '다른 기기에서 모두 로그아웃'}
          </Button>
          {!revoked && user ? <LostDeviceTip hasPassword={user.hasPassword === true} providers={user.authProviders ?? []} /> : null}
        </div>
      </div>
    </div>
  );
}
