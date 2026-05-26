import { Suspense } from 'react';
import { KakaoCallbackClient } from '@/components/auth/kakao-callback-client';
import { AuthFrame } from '@/components/auth/auth-page';

export default function KakaoCallbackPage() {
  return (
    <Suspense fallback={<KakaoCallbackFallback />}>
      <KakaoCallbackClient />
    </Suspense>
  );
}

function KakaoCallbackFallback() {
  return (
    <AuthFrame>
      <div className="tm-auth-body tm-auth-center">
        <h1 className="tm-text-heading tm-auth-heading">카카오 로그인을 확인하고 있어요</h1>
        <p className="tm-text-body tm-auth-sub">잠시만 기다려 주세요.</p>
      </div>
    </AuthFrame>
  );
}
