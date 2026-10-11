'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/v1-ui/button';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { buildActivityProfileHref } from '@/lib/activity-profile-required';
import { ShieldAlert } from 'lucide-react';

/**
 * 정보 입력을 미룬 계정이 만들기·신청 화면에 들어오면 긴 폼 대신 안내를 먼저 보여 준다.
 * RequireAuth 안쪽에서 쓴다(로딩·로그아웃 처리는 거기서 끝난 뒤다).
 */
export function RequireActivityProfile({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const authMe = useV1AuthMe();

  if (authMe.data?.user.onboardingStatus !== 'social_profile_deferred') return <>{children}</>;

  const enter = () => {
    router.push(buildActivityProfileHref(`${window.location.pathname}${window.location.search}`));
  };

  return (
    <div className="tm-empty-state tm-empty-state-fill" role="region" aria-labelledby="activity-profile-gate-title">
      <div className="tm-empty-icon" aria-hidden="true">
        <ShieldAlert size={36} strokeWidth={1.5} />
      </div>
      <div id="activity-profile-gate-title" className="tm-text-body-lg">{title}</div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        이름·생년월일·성별과 휴대폰 인증을 한 번만 입력하면 바로 이어서 할 수 있어요.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <Button onClick={() => router.back()} size="md" type="button" variant="neutral">다음에 할게요</Button>
        <Button onClick={enter} size="md" type="button" variant="primary">정보 입력하기</Button>
      </div>
    </div>
  );
}
