import LeagueFixtureDetailClient from './league-fixture-detail-client';

interface Props {
  params: Promise<{ leagueId: string; fixtureId: string }>;
}

// AppChrome 승격(U31) — 셸은 route-chrome 테이블(lib/route-chrome/fragments/
// league-matches.ts)이 정적으로 그린다. backHref는 이 경기가 속한 리그의 순위표/일정
// 화면 — 딥링크(알림·리다이렉트)로 바로 들어와도 리그로 나갈 수 있다.
export default async function LeagueFixturePage({ params }: Props) {
  const { leagueId, fixtureId } = await params;
  return <LeagueFixtureDetailClient leagueId={leagueId} fixtureId={fixtureId} />;
}
