import { ConflictException } from '@nestjs/common';
import {
  SOCIAL_LINK_TOKEN_TTL_SECONDS,
  isLinkableSocialProvider,
  issueSocialLinkToken,
  type LinkableSocialProvider,
  type SocialLinkClaims,
} from './social-link-token';

export type SignInThenLinkCode =
  | 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL'
  | 'SOCIAL_LINK_CONTACT_CONFLICT'
  | 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF'
  | 'PHONE_CONFLICT';

export const SOCIAL_PROVIDER_LABELS: Record<LinkableSocialProvider, string> = { kakao: '카카오', apple: 'Apple' };

/**
 * A social sign-in or signup that collides with an existing account cannot be resolved by proving the phone
 * or email. The one path that works is signing in to the existing account, where the provider attaches by itself
 * through `linkToken` (`POST /auth/link/pending`). Every such 409 carries `details.next` for the client to route on.
 */
export function signInThenLinkConflict(code: SignInThenLinkCode, claims: SocialLinkClaims): ConflictException {
  return new ConflictException({
    code,
    message: `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인하면 ${SOCIAL_PROVIDER_LABELS[claims.provider]} 로그인이 자동으로 연결돼요.`,
    details: {
      next: 'sign_in_then_link',
      provider: claims.provider,
      linkToken: issueSocialLinkToken(claims),
      linkTokenExpiresInSeconds: SOCIAL_LINK_TOKEN_TTL_SECONDS,
    },
  });
}

/** The unfinished social signup's own login as link claims, or null when it has none that can be linked. */
export function pendingAccountLinkClaims(
  userId: string,
  identities: { provider: string; providerUserKey: string }[],
): SocialLinkClaims | null {
  for (const identity of identities) {
    if (isLinkableSocialProvider(identity.provider)) {
      return { kind: 'pending_account', provider: identity.provider, providerUserKey: identity.providerUserKey, pendingUserId: userId };
    }
  }
  return null;
}
