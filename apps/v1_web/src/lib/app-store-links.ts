// 팀밋 iOS 앱(2026-10-08 출시). 같은 사이트 링크는 iOS 가 앱으로 넘기지 않으므로 App Store 로 보내고,
// 설치돼 있으면 App Store 가 "열기" 를 보여 준다.
export const IOS_APP_STORE_URL = 'https://apps.apple.com/kr/app/id6809736050';
export const ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=kr.co.teameet';

// 웹 방문자의 OS에 맞는 스토어로 보낸다. 데스크톱과 iPad 데스크톱 UA에는 안내하지 않는다.
export function getMobileAppStoreUrl(userAgent: string): string | null {
  if (/iPhone|iPod/i.test(userAgent)) return IOS_APP_STORE_URL;
  if (/Android/i.test(userAgent)) return ANDROID_PLAY_STORE_URL;
  return null;
}
