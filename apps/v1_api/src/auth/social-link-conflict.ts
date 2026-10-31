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
 *
 * `targetUserIds` are the accounts it collided with (email owner, phone owner). Only a session of one of them can
 * spend the token, so a token handed to one person cannot attach their provider login to somebody else's account.
 */
export function signInThenLinkConflict(
  code: SignInThenLinkCode,
  claims: SocialLinkClaims,
  targetUserIds: readonly string[],
  /** Present when the account that holds the contact value is a withdrawal waiting out its grace period. */
  pendingWithdrawal?: { withdrawalPendingUntil: string | null },
): ConflictException {
  return new ConflictException({
    code,
    message: `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인하면 ${SOCIAL_PROVIDER_LABELS[claims.provider]} 로그인이 자동으로 연결돼요.`,
    details: {
      next: 'sign_in_then_link',
      provider: claims.provider,
      linkToken: issueSocialLinkToken(claims, targetUserIds),
      linkTokenExpiresInSeconds: SOCIAL_LINK_TOKEN_TTL_SECONDS,
      ...(pendingWithdrawal ? { withdrawalPendingUntil: pendingWithdrawal.withdrawalPendingUntil } : {}),
    },
  });
}

/**
 * The same advice without a token, for a collision the person has not proven they are part of (a number typed in
 * but never verified): they can still link from settings after signing in, but nothing is attached automatically.
 */
export function signInThenLinkHint(code: SignInThenLinkCode, provider: LinkableSocialProvider): ConflictException {
  return new ConflictException({
    code,
    message: `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인한 뒤 설정 › 로그인 방법에서 ${SOCIAL_PROVIDER_LABELS[provider]} 로그인을 연결해 주세요.`,
    details: { next: 'sign_in_then_link', provider },
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
