import { TeamStatePageView } from '@/components/teams/teams-page';
import { getTeamStateViewModel } from '@/components/teams/teams.view-model';

export default function TeamFilterPage() {
  return <TeamStatePageView model={getTeamStateViewModel('filter')} />;
}
