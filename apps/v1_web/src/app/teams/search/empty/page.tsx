import { TeamStatePageView } from '@/components/teams/teams-page';
import { getTeamStateViewModel } from '@/components/teams/teams.view-model';

export default function TeamSearchEmptyPage() {
  return <TeamStatePageView model={getTeamStateViewModel('empty')} />;
}
