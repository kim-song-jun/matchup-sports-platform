import { KAKAO_SYMBOL_PATH } from '@/components/v1-ui/kakao-symbol-path';
import { KAKAO_LOGIN_LABEL } from './auth.view-model';

/** 카카오 공식 로그인 버튼 리소스의 말풍선 심볼. 경로와 비율은 내려준 그대로 둔다. */
export function KakaoSymbol() {
  return (
    <svg className="tm-auth-kakao-symbol" aria-hidden="true" focusable="false" viewBox="13 14 22 21">
      <path fill="currentColor" d={KAKAO_SYMBOL_PATH} />
    </svg>
  );
}

/** 카카오 버튼 공통 모양(심볼 + 문구). 심볼은 장식이라 접근성 이름은 문구 하나다. */
export function KakaoButtonFace({ label = KAKAO_LOGIN_LABEL }: { label?: string }) {
  return (
    <>
      <KakaoSymbol />
      <span className="tm-auth-kakao-label">{label}</span>
    </>
  );
}
