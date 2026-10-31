import type { V1LinkableProvider } from '@/types/api';

/** provider 를 모를 때(주소로 직접 들어온 안내 화면)는 특정 서비스를 단정하지 않는다. */
export function linkProviderLabel(provider: V1LinkableProvider | null): string {
  if (provider === 'kakao') return '카카오';
  if (provider === 'apple') return 'Apple';
  return '소셜';
}

/** 안내 화면·번호 중복 안내·가입 그만두기 확인 창이 같은 약속을 같은 말로 하도록 한 곳에 둔다. */
export function autoLinkPromise(provider: V1LinkableProvider | null): string {
  return `원래 방법으로 로그인하면 ${linkProviderLabel(provider)} 로그인이 그 계정에 자동으로 연결돼요.`;
}
