---
"v1_web": patch
---

팀 탭 진입 시 화면이 빈 스켈레톤(0건)으로 잠깐 멈췄다가 실제 목록으로 바뀌던 것을 고친다.

- **원인**: `/teams`는 서버(SEO 프리렌더)가 이미 무필터 팀 목록·종목 목록을 받아 두고
  `<Suspense fallback={<TeamListSsrView>}>`로 감싸 두었지만, 실제로는 그 fallback이 보인 적이
  없었다 — `TeamListPageClient`가 `useSearchParams()`를 쓰는 일반 클라이언트 컴포넌트라 서버
  렌더 시 진짜로 suspend하지 않고, 항상 자기 자신의 빈 로딩 상태(0건 카운트·회색 스켈레톤)부터
  그린 뒤 클라이언트에서 처음부터 다시 fetch했다. alpha에서 `/api/v1/teams` fetch만 인위적으로
  2.5초 지연시켜 재현: 지연 시간 내내 빈 스켈레톤이 떠 있다가 fetch가 끝나는 순간에야 실제
  목록으로 바뀌었다.
- **수정**: `useV1TeamDetail`의 seed(placeholderData) 패턴을 재사용해, 서버가 이미 받아 둔
  무필터 목록·종목 목록을 `useV1Teams`/`useV1MasterSports`의 첫 표시값으로 연결한다. URL에
  종목·성별·레벨·검색어·정렬 필터가 걸려 있으면 무필터 스냅샷을 목록 seed로 넘기지 않는다
  (필터링 안 된 결과를 필터링된 화면처럼 잠깐 보여주는 쪽이 더 나쁘다) — 종목 목록 seed는
  필터와 무관하므로 그대로 넘긴다.
- **범위**: 이번 변경은 `/teams`만 고친다. `/matches`(`matches/page.tsx`)도 같은 구조를
  쓰지만 매치 카드는 `viewer` 상태(주최/신청/승인)에 따라 상태 뱃지가 달라져, 팀 목록과
  달리 무필터 seed를 그대로 얹으면 잠깐 잘못된 뱃지가 보일 수 있다 — 별도 검토가 필요해
  이번 범위에서 뺐다.
