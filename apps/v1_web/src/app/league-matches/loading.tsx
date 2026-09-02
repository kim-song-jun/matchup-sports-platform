import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 라우트 전환 중 보여줄 스켈레톤. 셸(AppShellFrame)이 이미 프레임을 그리므로 여기서는
 * 본문 스켈레톤만 렌더한다 — LeagueMatchesPage는 useShellOverride를 쓰지 않고
 * lib/route-chrome/fragments/league-matches.ts 테이블 값 그대로 쓰므로 헤더가 튈 일이 없다.
 *
 * 이 세그먼트는 이제 목록을 그리지 않고 통합 목록으로 **넘긴다**. 그래도 이 파일이 필요한
 * 이유는 하위 세그먼트를 덮기 때문이 아니라(`[leagueId]`·`awards`·`fixtures` 는 각자
 * `loading.tsx` 를 갖고 있고 Next 는 가장 가까운 것이 이긴다) `page.tsx` 가
 * `await searchParams` 를 하는 동안 **리다이렉트 페이지 자체가 잠깐 suspend** 하기 때문이다.
 * 목적지도 목록이라 `variant="list"` 를 그대로 둔다 — 빈 화면이 번쩍이지 않는다.
 */
export default function LeagueMatchesLoading() {
  return (
    <>
      <p className="sr-only" role="status">리그 목록으로 이동하는 중이에요.</p>
      <PageSkeleton variant="list" />
    </>
  );
}
