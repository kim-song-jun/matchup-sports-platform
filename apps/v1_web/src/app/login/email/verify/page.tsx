import { LoginStepUpVerifyClient } from '@/components/auth/login-step-up-verify-client';

// 챌린지는 URL 이 아니라 sessionStorage 에 있다(lib/login-step-up.ts). 서버에서 읽을 값이 없다.
export default function LoginStepUpVerifyPage() {
  return <LoginStepUpVerifyClient />;
}
