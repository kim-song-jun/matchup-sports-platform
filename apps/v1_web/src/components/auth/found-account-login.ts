import { isNativeAppleSignInAvailable } from '@/lib/native-apple';
import type { V1FoundAccount } from '@/types/api';
import type { LoginMethod } from './login-method-chips';

export type FoundAccountLoginLink = { href: string; label: string; kakao: boolean };

export type FoundAccountSummary = {
  /** 안내 카드의 첫 줄 라벨. */
  label: string;
  /** 마스킹 이메일. 번호 증명만으로는 오지 않아 null 이다. */
  maskedEmail: string | null;
  /** 가입한 로그인 수단(이메일 로그인·카카오·Apple). 이 환경의 로그인 첫 화면에 없는 제공자는 뺀다. */
  methods: LoginMethod[];
  /** 이 환경의 로그인 첫 화면에 있는 소셜 제공자 이름을 `·` 로 이은 것. 없으면 빈 문자열. */
  socialNames: string;
  /** Apple 로 가입했지만 이 환경에는 Apple 버튼이 없다(iOS 앱에만 있다). */
  appleUnavailable: boolean;
  /** 이 계정이 쓰는 로그인 수단마다 맞는 화면으로 가는 링크. 첫 번째가 주된 길이다. */
  links: FoundAccountLoginLink[];
};

/** 번호로 찾은 계정이 실제로 쓰는 로그인 수단만 골라, 수단마다 맞는 화면으로 보낸다. */
export function describeFoundAccount(
  account: V1FoundAccount,
  { emailLoginHref, loginHref }: { emailLoginHref: string; loginHref: string },
): FoundAccountSummary {
  // 로그인 첫 화면에 없는 제공자(naver 등)는 안내할 수 없어 뺀다. Apple 버튼은 iOS 앱에만 있다.
  const hasKakao = account.providers.includes('kakao');
  const hasApple = account.providers.includes('apple');
  const appleButton = hasApple && isNativeAppleSignInAvailable();
  const socialNames = [hasKakao ? '카카오' : null, hasApple ? 'Apple' : null].filter(Boolean).join('·');
  const methods: LoginMethod[] = [
    ...(account.hasPassword ? [{ key: 'email' as const, label: '이메일·비밀번호' }] : []),
    ...(hasKakao ? [{ key: 'kakao' as const, label: '카카오' }] : []),
    ...(hasApple ? [{ key: 'apple' as const, label: 'Apple' }] : []),
  ];
  const links: FoundAccountLoginLink[] = [
    ...(account.hasPassword ? [{ href: emailLoginHref, label: socialNames ? '이메일로 로그인하기' : '로그인하러 가기', kakao: false }] : []),
    ...(hasKakao ? [{ href: loginHref, label: '카카오로 로그인하기', kakao: true }] : []),
    ...(appleButton ? [{ href: loginHref, label: 'Apple로 로그인하기', kakao: false }] : []),
  ];
  let label = '가입한 로그인 방법';
  if (account.maskedEmail) label = '가입한 이메일';
  else if (methods.length === 0) label = '로그인 방법을 확인하지 못했어요';
  return {
    label,
    maskedEmail: account.maskedEmail,
    methods,
    socialNames,
    appleUnavailable: hasApple && !appleButton,
    links,
  };
}
