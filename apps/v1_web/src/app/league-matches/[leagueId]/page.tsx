import { AppChrome } from '@/components/v1-ui/shell';
import LeagueMatchStandingsClient from './league-match-standings-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

// 목록(page.tsx)과 같은 이유로 셸을 여기서 두른다 — 이 화면도 원래 하단 내비가 없었다.
// backHref로 리그 목록을 명시해, 딥링크로 바로 들어온 사용자도 목록으로 나갈 수 있다.
export default async function LeagueMatchPage({ params }: Props) {
  const { leagueId } = await params;
  return (
    <AppChrome title="리그" activeTab="tournaments" backHref="/league-matches">
      <LeagueMatchStandingsClient leagueId={leagueId} />
    </AppChrome>
  );
}
