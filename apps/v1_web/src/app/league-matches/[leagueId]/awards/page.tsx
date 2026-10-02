import { LeagueAwardsPageClient } from './league-awards-page-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

// AppChrome 승격(U31) — 셸은 route-chrome 테이블(lib/route-chrome/fragments/
// league-matches.ts)이 정적으로 그린다. backHref로 리그 상세를 명시한다(딥링크로
// 바로 들어온 사용자도 시즌 결산 화면 밖으로 나갈 길이 있어야 한다). 대회 시상 화면
// (tournaments/[id]/awards/page.tsx)과 달리 generateMetadata로 notFound()를 미리
// 확인하지 않는다 — 형제 라우트도 그렇게 하지 않고, 잘못된 leagueId는 클라이언트가
// 이미 ErrorState+재시도로 처리한다(league-match-standings-client.tsx와 동일한
// seriesQuery.isError 분기, 아래 클라이언트도 동일 패턴을 재사용한다).
export default async function LeagueAwardsPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueAwardsPageClient leagueId={leagueId} />;
}
