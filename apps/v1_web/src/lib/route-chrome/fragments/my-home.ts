// apps/v1_web/src/lib/route-chrome/fragments/my-home.ts
// U36 — my-home 세그먼트(components/my/my-page.tsx). 8곳 중 6곳이 실제로 도달 가능한
// 라우트를 갖는다:
//   - MyHomePageView(/my): title/activeTab/centerTitle 정적, hasNewNotification은 런타임
//     override(§0.4-3). MyHomePageView 자체엔 floatingSlot이 없다(home-page.tsx와 달리
//     이 컴포넌트를 직접 열어 확인함).
//   - MyMatchesPageView(/my/matches/joined, /my/matches/created): my-matches-client.tsx가
//     model.title(모드별 '참여한 매치'/'내가 만든 매치')을 만들지만 MyHomePageView가 아니라
//     이 컴포넌트 자신은 그 값을 **쓰지 않는다** — AppChrome title도, 데스크톱 헤드 h1도
//     둘 다 하드코딩 "내 매치"다(직접 열어 model.title 참조 0건 확인, model.title은
//     MyMatchesViewModel에만 존재하고 렌더에 안 쓰이는 dead field). §2.1 불변식(승격 전/후
//     픽셀 단위 동일)에 따라 현재 동작 그대로 두 라우트 모두 title:'내 매치'로 옮긴다 —
//     "원래는 모드별로 달라야 하는 것 아닌가"는 이 유닛의 범위를 벗어난 별개의 버그이므로
//     여기서 임의로 고치지 않는다.
//   - MyTeamsPageView(/my/teams), MyInvitationsPageView(/my/invitations),
//     MyJoinApplicationsPageView(/my/join-applications): 전부 정적.
//   - SettingsPageView(/my/settings): title={model.title}이지만 model.title은 항상
//     settingsModel.title='설정' 상수(my.view-model.ts) — spread로 덮이는 필드가 아니므로
//     사실상 정적. ErrorState 분기는 AppChrome을 아예 안 거치므로 R7(분기별 렌더 차이)
//     대상도 아니다.
//   - LegalPageView(/my/settings/legal): 정적.
//
// MyTeamMembersPageView(components/my/my-page.tsx:386)는 8곳 중 나머지 하나인데
// **테이블에 등록하지 않는다** — 소비 경로 `app/my/teams/[id]/members/page.tsx`가
// `redirect('/teams/${id}/members')`뿐이라 이 뷰로 절대 도달하지 않는다(메모리
// "my/teams/[id]는 redirect — 마이 팀 상세는 죽은 경로"와 동일 패턴, 실제 렌더는
// components/teams/teams-client.tsx의 TeamMembersPageClient가 담당하고 그건 U29 소관).
// AppChrome 호출은 걷어내되(§2.25~2.38 절차 5), route-chrome 행은 없는 라우트를
// 매핑하는 죽은 항목이 되므로 추가하지 않는다.
import type { RouteChromeEntry } from '../types';

export const MY_HOME_ROUTES: RouteChromeEntry[] = [
  { pattern: '/my', chrome: { title: '마이페이지', activeTab: 'my', centerTitle: true } },
  { pattern: '/my/matches/joined', chrome: { title: '내 매치', activeTab: 'my', bottomNav: false, backHref: '/my' } },
  { pattern: '/my/matches/created', chrome: { title: '내 매치', activeTab: 'my', bottomNav: false, backHref: '/my' } },
  { pattern: '/my/teams', chrome: { title: '내 팀', activeTab: 'my', bottomNav: false, backHref: '/my' } },
  { pattern: '/my/invitations', chrome: { title: '받은 초대', activeTab: 'my', bottomNav: false, backHref: '/my' } },
  { pattern: '/my/join-applications', chrome: { title: '보낸 가입 신청', activeTab: 'my', bottomNav: false, backHref: '/my' } },
  { pattern: '/my/settings', chrome: { title: '설정', activeTab: 'my', bottomNav: false, backHref: '/my' } },
  { pattern: '/my/settings/legal', chrome: { title: '약관 및 정책', activeTab: 'my', bottomNav: false, backHref: '/my/settings' } },
];
