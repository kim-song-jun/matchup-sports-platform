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

  if (status === 'social_terms_required') {
    return pathname.endsWith('/auth/social-terms');
  }

  if (status === 'social_profile_required') {
    return pathname.endsWith('/auth/social-profile');
  }

  return true;
}
