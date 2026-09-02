import LeagueMatchStandingsClient from './league-match-standings-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

// AppChrome 승격(U31) — 셸은 route-chrome 테이블(lib/route-chrome/fragments/
// league-matches.ts)이 정적으로 그린다. backHref는 리그 목록으로 고정돼 있어
// 딥링크로 바로 들어온 사용자도 목록으로 나갈 수 있다.
export default async function LeagueMatchPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueMatchStandingsClient leagueId={leagueId} />;
}
