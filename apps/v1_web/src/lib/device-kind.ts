export type DeviceKind = 'mobile' | 'desktop';

/**
 * 옥토모 MO 휴대폰 인증 채널 기본값을 고르기 위한 기기 판별.
 * 모바일이면 SMS 딥링크(sms:) 버튼을, 데스크탑이면 QR 코드를 기본 노출한다.
 * 사용자는 PhoneVerificationCard의 "다른 방법으로" 토글로 언제든 전환할 수 있다.
 */
export function detectDeviceKind(): DeviceKind {
  if (typeof navigator === 'undefined') return 'desktop';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return 'mobile';
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 820px)').matches
  ) {
    return 'mobile';
  }
  return 'desktop';
}
