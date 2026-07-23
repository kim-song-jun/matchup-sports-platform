import type { V1OnboardingStatus } from '@prisma/client';

export type PendingSocialSignupStatus = Extract<
  V1OnboardingStatus,
  'social_terms_required' | 'social_profile_required'
>;

export function getPendingSocialSignupRoute(status: V1OnboardingStatus | string) {
  if (status === 'social_terms_required') return '/terms?mode=social';
  if (status === 'social_profile_required') return '/signup/social';
  return null;
}

export function isPendingSocialSignup(status: V1OnboardingStatus | string) {
  return getPendingSocialSignupRoute(status) !== null;
}

export function isPendingSocialSignupRequestAllowed(
  status: V1OnboardingStatus | string,
  requestUrl: string,
) {
  const pathname = requestUrl.split('?')[0]?.replace(/\/+$/, '') ?? '';

  if (pathname.endsWith('/auth/me') || pathname.endsWith('/auth/logout')) {
    return true;
  }

  if (pathname.endsWith('/terms/current')) {
    return true;
  }

  if (status === 'social_terms_required') {
    return pathname.endsWith('/auth/social-terms');
  }

  if (status === 'social_profile_required') {
    // 프로필 완성 화면이 실제로 호출하는 것: 닉네임 중복확인 + authed 휴대폰 인증 카드
    // (옥토모 카카오 hard-block) + 최종 제출. 이 셋을 막으면 소셜 가입이 원천 봉쇄된다.
    return (
      pathname.endsWith('/auth/social-profile') ||
      pathname.endsWith('/auth/check-nickname') ||
      pathname.endsWith('/verification/phone/request') ||
      pathname.endsWith('/verification/phone/confirm')
    );
  }

  return true;
}
