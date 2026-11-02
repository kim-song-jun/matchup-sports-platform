import { ForbiddenException } from '@nestjs/common';
import { ACTIVITY_PROFILE_ROUTE, getPendingSocialSignupRoute, isUnfinishedSocialSignup } from './social-signup-access';

// Guards shared by every route that adds a login method to the signed-in account.

/** A session older than this must sign in again before it can attach a login method. */
export const RECENT_LOGIN_MAX_AGE_SECONDS = 30 * 60;

/** No session age is only possible with a non-production header identity; production never lets it through. */
export function assertRecentLogin(sessionAgeSeconds: number | null) {
  if (sessionAgeSeconds === null ? process.env.NODE_ENV === 'production' : sessionAgeSeconds > RECENT_LOGIN_MAX_AGE_SECONDS) {
    throw new ForbiddenException({
      code: 'RECENT_LOGIN_REQUIRED',
      message: '보안을 위해 다시 로그인한 뒤 연결해 주세요.',
      details: { maxAgeSeconds: RECENT_LOGIN_MAX_AGE_SECONDS },
    });
  }
}

/** What `assertLinkableCaller` reads; select exactly this from the caller's row. */
export const LINK_CALLER_SELECT = {
  accountStatus: true,
  deletedAt: true,
  onboardingStatus: true,
  signupEmailLoginRequired: true,
  adminUser: { select: { status: true } },
} as const;

export type LinkCaller = {
  accountStatus: string;
  deletedAt: Date | null;
  onboardingStatus: string;
  signupEmailLoginRequired?: boolean;
  adminUser: { status: string } | null;
};

const ADMIN_REFUSAL_MESSAGES = {
  social: '운영 권한이 있는 계정에는 소셜 로그인을 연결할 수 없어요.',
  email: '운영 권한이 있는 계정에는 이메일 로그인을 추가할 수 없어요.',
} as const;

/**
 * Refuses a caller whose login methods may not be changed from a browser session: a restricted account, an operator's
 * account, or a social signup that has not finished. The one exception is required email setup
 * for a newly deferred social signup; social account linking remains forbidden there.
 */
export function linkCallerRestriction(caller: LinkCaller): 'account' | 'admin' | 'signup' | null {
  if (caller.accountStatus !== 'active' || caller.deletedAt !== null) return 'account';
  if (caller.adminUser && caller.adminUser.status !== 'revoked') return 'admin';
  if (isUnfinishedSocialSignup(caller.onboardingStatus)) return 'signup';
  return null;
}

export function assertLinkableCaller(caller: LinkCaller, method: keyof typeof ADMIN_REFUSAL_MESSAGES) {
  const restriction = linkCallerRestriction(caller);
  if (restriction === 'account') {
    throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이용이 제한된 계정이에요.' });
  }
  if (restriction === 'admin') {
    throw new ForbiddenException({ code: 'SOCIAL_LINK_ADMIN_FORBIDDEN', message: ADMIN_REFUSAL_MESSAGES[method] });
  }
  if (restriction === 'signup' && !(method === 'email' && caller.onboardingStatus === 'social_profile_deferred' && caller.signupEmailLoginRequired)) {
    throw new ForbiddenException({
      code: 'SIGNUP_INCOMPLETE',
      message: '가입을 먼저 마무리해 주세요.',
      details: { next: { route: getPendingSocialSignupRoute(caller.onboardingStatus) ?? ACTIVITY_PROFILE_ROUTE } },
    });
  }
}
