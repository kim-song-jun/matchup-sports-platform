import { ConflictException } from '@nestjs/common';
import type { V1AuthProvider } from '@prisma/client';

/** Providers an account can attach while signed in (`POST /auth/link/{provider}`). */
export type LinkableSocialProvider = Extract<V1AuthProvider, 'kakao' | 'apple'>;

export type SignInThenLinkCode =
  | 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL'
  | 'SOCIAL_LINK_CONTACT_CONFLICT'
  | 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF'
  | 'PHONE_CONFLICT';

export const SOCIAL_PROVIDER_LABELS: Record<LinkableSocialProvider, string> = { kakao: '카카오', apple: 'Apple' };

export function isLinkableSocialProvider(provider: V1AuthProvider): provider is LinkableSocialProvider {
  return provider === 'kakao' || provider === 'apple';
}

/**
 * A social sign-in or signup that collides with an existing account cannot be resolved by proving the phone
 * or email. The one path that works is signing in to the existing account and linking the provider there, so
 * every such 409 carries `details.next` for the client to route on.
 */
export function signInThenLinkConflict(code: SignInThenLinkCode, provider: LinkableSocialProvider): ConflictException {
  return new ConflictException({
    code,
    message: `이미 팀밋 계정이 있어요. 원래 가입한 방법으로 로그인한 뒤 설정에서 ${SOCIAL_PROVIDER_LABELS[provider]} 로그인을 연결해 주세요.`,
    details: { next: 'sign_in_then_link', provider },
  });
}
