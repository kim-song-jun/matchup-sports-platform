/**
 * 옥토모 MO 인증 문자 딥링크를 생성한다.
 * iOS의 sms: URI 스킴은 body 파라미터 앞에 `&`를 요구하고(첫 파라미터도 예외),
 * 그 외(Android 등)는 표준 `?`를 사용한다.
 */
export function buildSmsLink(destNumber: string, body: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const encoded = encodeURIComponent(body);
  return isIos ? `sms:${destNumber}&body=${encoded}` : `sms:${destNumber}?body=${encoded}`;
}
