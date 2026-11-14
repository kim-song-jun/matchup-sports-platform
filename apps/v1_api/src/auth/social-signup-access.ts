import { V1AuthProvider, type V1OnboardingStatus } from '@prisma/client';

export type PendingSocialSignupStatus = Extract<
  V1OnboardingStatus,
  'social_terms_required' | 'social_profile_required'
>;

export function getPendingSocialSignupRoute(status: V1OnboardingStatus | string) {
  if (status === 'social_terms_required') return '/terms?mode=social';
  if (status === 'social_profile_required') return '/signup/social';
  return null;
}

export const ACTIVITY_PROFILE_ROUTE = '/signup/social';

/** Where the gate sends someone whose only missing item is the interest sport. */
export const ACTIVITY_SPORT_ROUTE = '/onboarding/sport';

export type ActivityMissingItem = 'phone' | 'basicProfile' | 'interestSport';

/**
 * What a social-signup account still owes before it may act with other people (create/apply/chat...).
 * Order matters: the first item is where the web sends the user. An empty list means the gate is open.
 * Email signups and completed accounts never reach this (the caller only asks for the two deferred states).
 */
export function listActivityMissingItems(input: {
  onboardingStatus: V1OnboardingStatus | string;
  phoneVerified: boolean;
  hasInterestSport: boolean;
  hasSocialIdentity: boolean;
}): ActivityMissingItem[] {
  const profileDeferred = input.onboardingStatus === 'social_profile_deferred';
  // 'deferred' is also the state of an email signup that skipped onboarding; only social accounts are gated on it.
  const sportDeferred = input.onboardingStatus === 'deferred' && input.hasSocialIdentity;
  if (!profileDeferred && !sportDeferred) return [];

  const missing: ActivityMissingItem[] = [];
  if (profileDeferred) {
    if (!input.phoneVerified) missing.push('phone');
    missing.push('basicProfile');
  }
  if (!input.hasInterestSport) missing.push('interestSport');
  return missing;
}

export function activityRouteFor(missing: readonly ActivityMissingItem[]): string {
  return missing[0] === 'interestSport' ? ACTIVITY_SPORT_ROUTE : ACTIVITY_PROFILE_ROUTE;
}

/** Skipped the profile form at signup: reads are open, writes ask for the profile. */
export function isActivityProfileRequired(status: V1OnboardingStatus | string) {
  return status === 'social_profile_deferred';
}

/**
 * A signup with a Kakao login row never skips the profile step (Kakao's consent screen marks these items required).
 * Do not read the draft here: a later Kakao login overwrites it and an unlink notice can clear it.
 */
export function canDeferSocialSignup(input: {
  onboardingStatus: V1OnboardingStatus | string;
  identities: ReadonlyArray<{ provider: V1AuthProvider | string }>;
}) {
  return input.onboardingStatus === 'social_profile_required'
    && !input.identities.some((identity) => identity.provider === V1AuthProvider.kakao);
}

/** Social signup not finished: still pending, or the profile step was skipped. */
export function isUnfinishedSocialSignup(status: V1OnboardingStatus | string) {
  return isPendingSocialSignup(status) || isActivityProfileRequired(status);
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
      pathname.endsWith('/auth/social-profile/defer') ||
      pathname.endsWith('/auth/check-nickname') ||
      pathname.endsWith('/verification/phone/request') ||
      pathname.endsWith('/verification/phone/confirm')
    );
  }

  return true;
}

/** A social signup that nobody finishes stops being resumable this long after its last update. */
export const SOCIAL_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

export function isExpiredSocialSignup(user: { onboardingStatus: string; createdAt: Date; updatedAt: Date }) {
  if (!isPendingSocialSignup(user.onboardingStatus)) return false;

  const referenceTime = user.updatedAt ?? user.createdAt;
  return Date.now() - referenceTime.getTime() > SOCIAL_SIGNUP_TTL_MS;
}
