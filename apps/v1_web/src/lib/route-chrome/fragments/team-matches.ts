// apps/v1_web/src/lib/route-chrome/fragments/team-matches.ts
// U28 — team-matches 세그먼트. 정적 필드는 각 라우트의 <AppChrome> 호출에서 그대로 옮긴다.
//
// - /team-matches, /team-matches/:id: 목록·상세 둘 다 loading/error 분기(TeamMatchStatePageView)와
//   success 분기(TeamMatchListPageView/TeamMatchDetailPageView)가 topBar를 다르게 쓴다
//   (성공: false — 자체 검색바/히어로, 에러: 기본값 true). topBar는 ShellOverride가 지원하지
//   않는 필드라 테이블엔 더 흔한 success 값(topBar:false)을 안전 기본값으로 넣는다 — 에러
//   상태는 상단 바 없이도 컴포넌트 자체의 "목록으로 돌아가기" 링크로 내비가 살아있다(안전한
//   열화, app-shell-promotion.md §4 R21). title/desktopHead는 override로 지원되므로
//   TeamMatchStatePageView가 useShellOverride로 밀어넣는다(team-matches-page.tsx).
// - /team-matches/new(bare)·/team-matches/new/*, /team-matches/:id/edit: 전부 정적 —
//   title이 라우트(step)마다 고정이라 fetch 의존이 없다(team-matches-page.tsx의
//   TeamMatchCreatePageView). /team-matches/new/complete(위저드 완료 화면)는 웨이브4에서
//   제거됐다 — 실제 제출 성공 경로는 항상 /team-matches/:id로 바로 이동해 닿는 진짜 경로가
//   없는 죽은 라우트였다(2026-09-04 감사).
// - /team-matches/:id/lineup: 4개 분기(로딩/에러/재로딩/성공) 전부 동일 props, 완전 정적.
// - /team-matches/:id/result, /result/approval: 리그 대진이면 LeagueTeamMatchResultPage로
//   합류해 title이 "경기 결과"로 바뀐다(fetch 이후에만 아는 값) — 그 컴포넌트가
//   useShellOverride로 override한다(team-match-result-client.tsx). 그 외 4개 분기는
//   각 라우트마다 동일한 제목("경기 결과 입력"/"경기 결과 승인")이라 테이블 값 그대로 쓴다.
import type { RouteChromeEntry } from '../types';

export const TEAM_MATCHES_ROUTES: RouteChromeEntry[] = [
  { pattern: '/team-matches', chrome: { title: '매치', activeTab: 'matches', topBar: false } },
  { pattern: '/team-matches/:id', chrome: { title: '', activeTab: 'matches', bottomNav: false, topBar: false } },
  // 위저드 2단계(bare) — app/team-matches/new/page.tsx가 step="team"으로 /new/team과 동일한
  // 화면을 렌더하는데, 이 엔트리가 없으면 세그먼트 수가 같은 /team-matches/:id에 걸려
  // topBar:false를 물려받아 모바일 상단바·뒤로가기가 사라진다(matches.ts의 /matches/new와
  // 같은 결함, 2026-09-04 웨이브4 감사). literal 세그먼트 수가 더 많아 resolveRouteChrome이
  // /team-matches/:id보다 이 엔트리를 우선 고른다(index.ts 참고) — 배열 순서는 무관하다.
  { pattern: '/team-matches/new', chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true } },
  {
    pattern: '/team-matches/new/team',
    chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true },
  },
  {
    pattern: '/team-matches/new/sport',
    chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true },
  },
  {
    pattern: '/team-matches/new/info',
    chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true },
  },
  {
    pattern: '/team-matches/new/condition',
    chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true },
  },
  {
    pattern: '/team-matches/new/place-time',
    chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true },
  },
  {
    pattern: '/team-matches/new/confirm',
    chrome: { title: '팀매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/team-matches', desktopHead: true },
  },
  {
    pattern: '/team-matches/:id/edit',
    chrome: {
      title: '팀매치 수정',
      activeTab: 'matches',
      bottomNav: false,
      backHref: (p) => `/team-matches/${p.id}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/team-matches/:id/lineup',
    chrome: {
      title: '라인업',
      bottomNav: false,
      backHref: (p) => `/team-matches/${p.id}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/team-matches/:id/result',
    chrome: {
      title: '경기 결과 입력',
      activeTab: 'matches',
      bottomNav: false,
      backHref: (p) => `/team-matches/${p.id}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/team-matches/:id/result/approval',
    chrome: {
      title: '경기 결과 승인',
      activeTab: 'matches',
      bottomNav: false,
      backHref: (p) => `/team-matches/${p.id}`,
      desktopHead: true,
    },
  },
];
