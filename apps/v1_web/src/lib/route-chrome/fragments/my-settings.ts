// apps/v1_web/src/lib/route-chrome/fragments/my-settings.ts
// U37 — my-settings 세그먼트(components/my/my-api-clients.tsx, 9개 export function, 17곳).
// 전부 정적 title(하드코딩 문자열)이고 activeTab='my'/bottomNav=false 공통. desktopHead는
// 두 함수(ProfileEditPageClient/NotificationSettingsPageClient)에서만 분기한다 —
// loading/error 분기는 desktopHead:true, success 분기는 자체 tm-desktop-page-head를
// 직접 그려서 desktopHead:false로 끈다(app-shell-promotion.md §1.9 R3 패턴, 이 파일
// my-api-clients.tsx:399,407 vs :613 / :1396,1406,1417 vs :1479 에서 직접 확인).
// 나머지 5개(RecordConsent/TournamentRealNameVisibility/PlayerCardHidden/Sports/Location)
// 는 loading·error·success 전부 desktopHead 값이 같거나(RecordConsent 등, desktopHead:true
// 고정) AppChrome 호출이 하나뿐(Sports/Location/Theme/Withdrawal, desktopHead 미지정)이라
// override 없이 테이블 값만으로 충분하다.
import type { RouteChromeEntry } from '../types';

export const MY_SETTINGS_ROUTES: RouteChromeEntry[] = [
  {
    // ProfileEditPageClient(my-api-clients.tsx:342). backHref는 항상 정적 '/my' — 컴포넌트가
    // ?returnTo= 쿼리로 저장 후 이동할 곳을 따로 계산하지만(router.replace), AppChrome의
    // backHref 자체는 원래도 '/my' 고정이었다(returnTo를 안 씀) — 승격 전/후 동일 유지.
    pattern: '/my/profile/edit',
    chrome: { title: '프로필 수정', activeTab: 'my', bottomNav: false, backHref: '/my', desktopHead: true },
  },
  {
    // SportsSettingsPageClient(:861). AppChrome 호출 1곳뿐 — desktopHead 미지정(기본값).
    pattern: '/my/settings/sports',
    chrome: { title: '운동 정보', activeTab: 'my', bottomNav: false, backHref: '/my' },
  },
  {
    // LocationSettingsPageClient(:1242). AppChrome 호출 1곳뿐.
    pattern: '/my/settings/location',
    chrome: { title: '위치 및 활동 지역', activeTab: 'my', bottomNav: false, backHref: '/my/settings' },
  },
  {
    // NotificationSettingsPageClient(:1385). titleAsHeading은 세 분기 전부 공통.
    pattern: '/my/settings/notifications',
    chrome: {
      title: '알림 설정',
      activeTab: 'my',
      bottomNav: false,
      backHref: '/my/settings',
      titleAsHeading: true,
      desktopHead: true,
    },
  },
  {
    // RecordConsentSettingsPageClient(:1659). error/success 둘 다 desktopHead:true — 분기 없음.
    pattern: '/my/settings/record-consent',
    chrome: { title: '경기 기록 공개', activeTab: 'my', bottomNav: false, backHref: '/my/settings', desktopHead: true },
  },
  {
    // TournamentRealNameVisibilitySettingsPageClient(:1792). error/success 둘 다 desktopHead:true.
    pattern: '/my/settings/tournament-real-name',
    chrome: { title: '대회 기록 실명 표시', activeTab: 'my', bottomNav: false, backHref: '/my/settings', desktopHead: true },
  },
  {
    // PlayerCardHiddenSettingsPageClient(:1883). error/success 둘 다 desktopHead:true.
    pattern: '/my/settings/player-card',
    chrome: { title: '선수 카드', activeTab: 'my', bottomNav: false, backHref: '/my/settings', desktopHead: true },
  },
  {
    // ThemeSettingsPageClient(:2055). AppChrome 호출 1곳뿐.
    pattern: '/my/settings/theme',
    chrome: { title: '화면 테마', activeTab: 'my', bottomNav: false, backHref: '/my/settings' },
  },
  {
    // WithdrawalPageClient(:2120). AppChrome 호출 1곳뿐.
    pattern: '/my/settings/withdrawal',
    chrome: { title: '회원 탈퇴', activeTab: 'my', bottomNav: false, backHref: '/my/settings' },
  },
];
