import type { V1LinkableProvider } from '@/types/api';

/** provider 를 모를 때(주소로 직접 들어온 안내 화면)는 특정 서비스를 단정하지 않는다. */
export function linkProviderLabel(provider: V1LinkableProvider | null): string {
  if (provider === 'kakao') return '카카오';
  if (provider === 'apple') return 'Apple';
  return '소셜';
}

/** 서버가 연결 토큰을 받아 주는 시간(`linkTokenExpiresInSeconds` 1800). 문구가 이 숫자를 약속한다. */
export const LINK_TOKEN_WINDOW_MINUTES = 30;

/** 연결 토큰을 보관할 수 없는 브라우저에서 자동 연결 대신 하는 약속. */
export function manualLinkPromise(provider: V1LinkableProvider | null): string {
  return `원래 방법으로 로그인한 뒤 설정의 "로그인 방법"에서 ${linkProviderLabel(provider)} 로그인을 연결해 주세요.`;
}

/**
 * 안내 화면·번호 중복 안내·가입 그만두기 확인 창이 같은 약속을 같은 말로 하도록 한 곳에 둔다.
 * 그 계정이 탈퇴 유예 중이면(`withdrawalPending`) 로그인만으로는 세션이 열리지 않아 탈퇴 취소가 한 단계 끼어든다.
 */
export function autoLinkPromise(provider: V1LinkableProvider | null, { withdrawalPending = false }: { withdrawalPending?: boolean } = {}): string {
  const login = withdrawalPending ? '원래 방법으로 로그인하고 탈퇴 신청을 취소하면' : '원래 방법으로 로그인하면';
  return `${LINK_TOKEN_WINDOW_MINUTES}분 안에 ${login} ${linkProviderLabel(provider)} 로그인 연결을 시도해요. 이미 다른 ${linkProviderLabel(provider)} 계정이 연결돼 있으면 결과를 알려 드려요.`;
}
