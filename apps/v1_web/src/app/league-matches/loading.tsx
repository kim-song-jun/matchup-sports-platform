import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 라우트 전환 중 보여줄 스켈레톤. 셸(AppShellFrame)이 이미 프레임을 그리므로 여기서는
 * 본문 스켈레톤만 렌더한다 — LeagueMatchesPage는 useShellOverride를 쓰지 않고
 * lib/route-chrome/fragments/league-matches.ts 테이블 값 그대로 쓰므로 헤더가 튈 일이 없다.
 */
export default function LeagueMatchesLoading() {
  return (
    <>
      <p className="sr-only" role="status">정규 리그를 불러오는 중이에요.</p>
      <PageSkeleton variant="list" />
    </>
  );
}
