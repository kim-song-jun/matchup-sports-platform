import { AppChrome } from '@/components/v1-ui/shell';
import LeagueFixtureDetailClient from './league-fixture-detail-client';

interface Props {
  params: Promise<{ leagueId: string; fixtureId: string }>;
}

// 리그 상세(../page.tsx)와 같은 이유로 셸을 여기서 두른다. backHref 는 이 경기가 속한
// 리그의 순위표·일정 화면 — 딥링크(알림·리다이렉트)로 바로 들어와도 리그로 나갈 수 있다.
export default async function LeagueFixturePage({ params }: Props) {
  const { leagueId, fixtureId } = await params;
  return (
    <AppChrome title="리그 경기" activeTab="tournaments" backHref={`/league-matches/${leagueId}`}>
      <LeagueFixtureDetailClient leagueId={leagueId} fixtureId={fixtureId} />
    </AppChrome>
  );
}
