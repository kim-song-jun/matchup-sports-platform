import { TeamMatchStatePageView } from '@/components/team-matches/team-matches-page';
import { getTeamMatchStateViewModel } from '@/components/team-matches/team-matches.view-model';

export default function ErrorTeamMatchesPage() {
  return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;
}
