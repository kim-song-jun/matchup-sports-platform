// apps/v1_web/src/lib/route-chrome/fragments/teams.ts
// U29 — teams: 목록/생성/상세/수정/멤버 관리/전적/전술/컨택설정/컨택보내기 9패턴.
// app-motion-wave-plan.md §2.25~2.38 "U29 teams" 지시대로 실제 파일을 직접 열어 확인한 값으로 채웠다.
import type { RouteChromeEntry } from '../types';

export const TEAMS_ROUTES: RouteChromeEntry[] = [
  {
    // TeamListPageView는 단일 return이라 loading/error 분기가 없다(내부 스켈레톤으로 처리).
    // floatingSlot("팀 만들기" FAB)만 ShellOverride에 없는 정적 JSX라 useShellOverride로
    // 옮긴다(teams-page.tsx) — RouteChromeConfig엔 floatingSlot 필드 자체가 없다(설계 문서 §1.3).
    pattern: '/teams',
    chrome: { title: '팀', activeTab: 'teams', topBar: false },
  },
  {
    // TeamCreatePageClient는 항상 cancelHref 기본값('/teams')을 그대로 쓴다(teams-form-client.tsx).
    pattern: '/teams/new',
    chrome: { title: '팀 만들기', activeTab: 'teams', bottomNav: false, backHref: '/teams' },
  },
  {
    // TeamDetailPageView는 로딩·에러·성공 3분기 없이 fallback 모델로 항상 렌더되므로
    // (teams-client.tsx:320 TeamDetailPageClient) title/backHref 전부 고정.
    pattern: '/teams/:id',
    chrome: { title: '팀 상세', activeTab: 'teams', bottomNav: false, backHref: '/teams' },
  },
  {
    // TeamEditPageClient의 cancelHref는 원래 `?from=my` 쿼리 파라미터에 따라
    // '/teams'|`/teams/${id}` 로 갈리지만(teams-form-client.tsx:122-123), 실제로
    // `/teams/:id/edit?from=my` 를 생성하는 링크가 저장소 전체에 0건이라(teams-client.tsx:857의
    // 유일한 편집 링크가 쿼리 없이 연결) 이 분기는 현재 도달 불가능한 죽은 경로다.
    // 또한 ShellOverride엔 backHref 필드 자체가 없어(shell-override.ts) 셸의 backHref는
    // route-chrome 테이블의 정적 값으로만 정해진다 — 그래서 실측상 유일하게 관찰되는 값인
    // '/teams'를 그대로 등록한다. 콘텐츠 영역의 데스크톱 뒤로가기 링크(teams-page.tsx의
    // tm-desktop-back)는 여전히 cancelHref를 그대로 쓰므로 그 부분만은 from=my가 살아있어도
    // 정확하다 — 셸 topbar back 버튼만 이 근사값의 영향을 받는다.
    pattern: '/teams/:id/edit',
    chrome: { title: '팀 수정', activeTab: 'teams', bottomNav: false, backHref: '/teams' },
  },
  {
    // TeamMembersPageClient가 항상 backHref={`/teams/${teamId}`}로 호출한다(teams-client.tsx:538).
    pattern: '/teams/:id/members',
    chrome: {
      title: '멤버 관리',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}`,
    },
  },
  {
    // 로딩/에러 분기의 기본값. success 분기(team-records-page-client.tsx)가
    // useShellOverride({ title: `${팀명} 전적` })로 덮어쓴다(§1.9 "결합 제목" 하위유형) —
    // 계획 문서는 이 3곳을 "정적"이라 적었지만 실제 코드는 fetch된 팀명을 접두어로 붙이는
    // 결합 제목이었다(추측 대신 파일을 직접 열어 확인, 전역 지침 5).
    pattern: '/teams/:id/records',
    chrome: {
      title: '팀 전적',
      activeTab: 'teams',
      backHref: (p) => `/teams/${p.id}`,
      desktopHead: true,
    },
  },
  {
    // tactics-board-client.tsx는 로딩/에러/성공 3분기 전부 동일 정적 props라 override가 필요 없다.
    pattern: '/teams/:id/tactics/:gameId',
    chrome: {
      title: '우리 팀 전술',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}`,
    },
  },
  {
    pattern: '/teams/:id/contact/settings',
    chrome: {
      title: '컨택 설정',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/teams/:id/contact/new',
    chrome: {
      title: '컨택 보내기',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}`,
    },
  },
];
