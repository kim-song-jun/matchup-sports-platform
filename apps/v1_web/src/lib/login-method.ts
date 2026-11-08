import { V1ApiError } from './api-client';
import { LOGIN_METHOD_UNLINKED_CODE } from './auth-error-codes';
import type { V1LinkableProvider, V1UnlinkableProvider } from '@/types/api';

/** 로그인 방법의 이름. 연결·해제 안내, 확인 창, 로그인 실패 안내가 같은 말을 쓴다. */
export const LOGIN_METHOD_NAME: Record<V1UnlinkableProvider, string> = {
  kakao: '카카오',
  apple: 'Apple',
  email: '이메일',
};

/**
 * 이 계정으로 지금 로그인할 수 있는 수단. 서버가 마지막 수단을 가르는 기준(`canSignIn`)과 같다 —
 * 카카오·Apple, 그리고 비밀번호가 있는 이메일. 네이버는 로그인 경로가 없고, 비밀번호 없는 이메일은 로그인을 열지 못한다.
 */
export function signInMethods(providers: readonly string[], hasPassword: boolean): V1UnlinkableProvider[] {
  const methods = new Set<V1UnlinkableProvider>();
  for (const provider of providers) {
    if (provider === 'kakao' || provider === 'apple' || (provider === 'email' && hasPassword)) methods.add(provider);
  }
  return [...methods];
}

/** 스스로 연결을 해제한 카카오·Apple 로 로그인하려 한 403 인가. */
export function isUnlinkedLoginError(error: unknown): boolean {
  return error instanceof V1ApiError && error.statusCode === 403 && error.code === LOGIN_METHOD_UNLINKED_CODE;
}

/** 해제한 소셜 로그인으로 들어오려 할 때 로그인 화면의 오류 안내 자리에 보이는 문구. */
export function unlinkedLoginMessage(provider: V1LinkableProvider): string {
  return `이 ${LOGIN_METHOD_NAME[provider]} 로그인은 연결을 해제했어요. 원래 방법으로 로그인한 뒤 설정 > 로그인 방법에서 다시 연결해 주세요.`;
}
