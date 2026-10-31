import { isNativeAppleSignInAvailable } from '@/lib/native-apple';

/**
 * "카카오(나 Apple)로 가입하셨다면 로그인 첫 화면의 … 버튼으로 로그인해 주세요" 안내의 가변 부분.
 * Apple 버튼은 iOS 앱의 로그인 첫 화면에만 있어서 그 환경에서만 언급한다.
 */
export function describeSocialLoginGuide(): string {
  const withApple = isNativeAppleSignInAvailable();
  const signupMethods = withApple ? '카카오나 Apple' : '카카오';
  const buttons = withApple ? "'카카오' 또는 'Apple로 계속하기'" : "'카카오'";
  return `${signupMethods}로 가입하셨다면 로그인 첫 화면의 ${buttons} 버튼으로 로그인해 주세요.`;
}
