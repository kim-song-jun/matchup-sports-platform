import { TeamMatchStatePageView } from '@/components/team-matches/team-matches-page';
import { getTeamMatchStateViewModel } from '@/components/team-matches/team-matches.view-model';

export default function TeamMatchFilterPage() {
  return <TeamMatchStatePageView model={getTeamMatchStateViewModel('filter')} />;
}
