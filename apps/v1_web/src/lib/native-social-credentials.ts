/**
 * 네이티브 셸에서 소셜 신원 증명만 받아 온다 — 로그인 API 는 부르지 않는다.
 * 받은 값은 `POST /auth/link/kakao|apple` 본문으로 그대로 넘긴다(로그인 버튼의 `/auth/kakao/token`·`/auth/apple` 과 다른 호출).
 *
 * 브리지 자체가 던지는 오류(`NativeKakaoSignInError`·`NativeAppleSignInError`, postMessage 실패)는 잡지 않는다.
 * 호출한 쪽이 `extractErrorMessage` 로 안내한다.
 */

import { v1Post } from './api-client';
import { requestNativeAppleSignIn } from './native-apple';
import { requestNativeKakaoSignIn } from './native-kakao';
import type { V1LinkApplePayload } from '@/types/api';

export type NativeCredentialResult<T> =
  | { status: 'ready'; payload: T }
  /** 사용자가 시트를 닫았다 — 안내할 오류가 아니다. */
  | { status: 'cancelled' }
  /** 셸이 이유를 실어 보냈거나 토큰 없이 끝났다. `reason` 은 로그용이다. */
  | { status: 'failed'; reason: string };

export async function requestNativeKakaoLinkPayload(): Promise<NativeCredentialResult<{ accessToken: string }>> {
  const result = await requestNativeKakaoSignIn();
  if (result.cancelled) return { status: 'cancelled' };
  if (result.error || !result.accessToken) return { status: 'failed', reason: result.error ?? 'missing-token' };
  return { status: 'ready', payload: { accessToken: result.accessToken } };
}

/**
 * nonce 는 서버에서 먼저 받는다 — 앱이 고른 nonce 로는 가로챈 토큰의 재생을 막지 못한다(`AppleLoginButton` 과 같은 순서).
 */
export async function requestNativeAppleLinkPayload(): Promise<NativeCredentialResult<V1LinkApplePayload>> {
  const { nonce } = await v1Post<{ nonce: string }>('/auth/apple/nonce');
  const result = await requestNativeAppleSignIn(nonce);
  if (!result.ok && !result.error) return { status: 'cancelled' };
  if (!result.ok || !result.identityToken) return { status: 'failed', reason: result.error ?? 'missing-token' };
  return {
    status: 'ready',
    payload: {
      identityToken: result.identityToken,
      nonce,
      ...(result.authorizationCode ? { authorizationCode: result.authorizationCode } : {}),
      ...(result.fullName ? { fullName: result.fullName } : {}),
    },
  };
}
