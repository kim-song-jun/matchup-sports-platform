// apps/v1_web/src/lib/route-chrome/fragments/my-settings.ts
// U37 — my-settings 세그먼트(components/my/my-api-clients.tsx, 9개 export function, 17곳).
// 전부 정적 title(하드코딩 문자열)이고 activeTab='my'/bottomNav=false 공통. desktopHead:true 인
// 화면 중 자체 tm-desktop-page-head 를 그리는 5개(ProfileEdit/NotificationSettings/RecordConsent/
// TournamentRealNameVisibility/PlayerCardHidden)는 그 상태에서 useShellOverride({ desktopHead: false })
// 로 셸 헤더를 끈다(app-shell-promotion.md §1.9 R3 패턴) — 이 표의 true 는 셸 헤더만 남는 상태
// (에러 등)의 값이다. Sports/Location/Theme/Withdrawal 은 desktopHead 미지정이라 override 가 없다.
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
    // RecordConsentSettingsPageClient(:1649). 데이터가 있으면 자체 헤더 → override 로 false.
    pattern: '/my/settings/record-consent',
    chrome: { title: '경기 기록 공개', activeTab: 'my', bottomNav: false, backHref: '/my/settings', desktopHead: true },
  },
  {
    // TournamentRealNameVisibilitySettingsPageClient(:1773). 에러 외에는 자체 헤더 → override 로 false.
    pattern: '/my/settings/tournament-real-name',
    chrome: { title: '대회 기록 실명 표시', activeTab: 'my', bottomNav: false, backHref: '/my/settings', desktopHead: true },
  },
  {
    // PlayerCardHiddenSettingsPageClient(:1863). 에러 외에는 자체 헤더 → override 로 false.
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
