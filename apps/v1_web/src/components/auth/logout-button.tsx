'use client';

import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/v1-ui/button';
import { useSignOutAndLeave } from './use-sign-out-and-leave';

/** 계정 설정 하단의 텍스트 수준 ghost 버튼 — 파괴 액션이 그 화면의 가장 강한 CTA가 되지 않도록. */
export function LogoutButton() {
  const { signOutAndLeave, pending, error } = useSignOutAndLeave();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Button
        className="tm-logout-ghost"
        loading={pending}
        onClick={() => {
          void signOutAndLeave('/login', {
            failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.',
            onStart: () => trackEvent('logout', {}),
          });
        }}
        size="md"
        type="button"
        variant="ghost"
      >
        로그아웃
      </Button>
      {error ? (
        <p className="tm-text-caption" role="alert" style={{ margin: 0, color: 'var(--red700)', textAlign: 'center' }}>{error}</p>
      ) : null}
    </div>
  );
}
