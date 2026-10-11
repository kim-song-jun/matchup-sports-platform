'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/v1-ui/primitives';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { buildActivityProfileHref, currentReturnPath } from '@/lib/activity-profile-required';
import { hasPreviousInAppEntry, markAppInitiatedBack } from '@/lib/navigation-history';
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
    router.push(buildActivityProfileHref(currentReturnPath()));
  };

  const dismiss = () => {
    if (hasPreviousInAppEntry()) {
      markAppInitiatedBack();
      router.back();
      return;
    }
    router.replace('/home');
  };

  return (
    <div role="region" aria-label={title} style={{ display: 'flex', flexDirection: 'column' }}>
      <EmptyState
        fill
        icon={<ShieldAlert size={36} strokeWidth={1.5} />}
        title={title}
        sub="이름·생년월일·성별과 휴대폰 인증을 한 번만 입력하면 바로 이어서 할 수 있어요."
        cta="정보 입력하기"
        onCta={enter}
        secondaryCta="다음에 할게요"
        onSecondaryCta={dismiss}
      />
    </div>
  );
}
