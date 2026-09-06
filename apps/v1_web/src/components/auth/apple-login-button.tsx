'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeAppleSignInAvailable, requestNativeAppleSignIn } from '@/lib/native-apple';
import { extractErrorMessage } from '@/lib/error-message';
import { v1Post } from '@/lib/api-client';
import type { V1AuthSessionResponse } from '@/types/api';

/**
 * Apple 로그인 버튼 — iOS 앱에서만 나타난다.
 *
 * Apple 의 웹 리다이렉트 흐름은 임베디드 웹뷰 안에서 막히므로, 셸이 네이티브 시트를 띄우고
 * identity token 을 돌려주는 경로만 쓴다. 브라우저에는 이 버튼을 아예 그리지 않는다 —
 * 눌리지 않는 버튼을 "준비 중" 으로 두는 것보다 없는 편이 정직하다.
 *
 * 순서가 중요하다: nonce 를 **서버에서** 먼저 받아야 한다. 앱이 만든 nonce 는 앱이 다시
 * 고를 수 있어서, 가로챈 토큰을 그 nonce 로 재생하는 것을 막지 못한다.
 */
export function AppleLoginButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 브리지 존재 여부는 브라우저에서만 알 수 있다. 서버 렌더 결과에는 버튼이 없고,
  // 앱에서 하이드레이션된 뒤에 나타난다.
  useEffect(() => setAvailable(isNativeAppleSignInAvailable()), []);

  if (!available) return null;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const { nonce } = await v1Post<{ nonce: string }>('/auth/apple/nonce');
      const result = await requestNativeAppleSignIn(nonce);
      // 취소는 실패가 아니다 — 시트를 닫은 사람에게 오류를 띄우지 않는다.
      if (!result.ok || !result.identityToken) return;

      const session = await v1Post<V1AuthSessionResponse>('/auth/apple', {
        identityToken: result.identityToken,
        nonce,
        ...(result.fullName ? { fullName: result.fullName } : {}),
      });
      // 신규 가입이면 약관 단계로, 기존 회원이면 홈으로. 경로는 서버가 정한다.
      router.replace(session.next?.route ?? '/home');
      router.refresh();
    } catch (err) {
      setError(extractErrorMessage(err, 'Apple 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={signIn}
        disabled={busy}
        aria-label="Apple로 계속하기"
      >
        {busy ? '연결 중이에요…' : 'Apple로 계속하기'}
      </button>
      {error ? (
        <p className="tm-text-caption tm-auth-provider-note" role="alert">{error}</p>
      ) : null}
    </>
  );
}
