import { MatchStatePageView } from '@/components/matches/matches-page';
import { getMatchStateViewModel } from '@/components/matches/matches.view-model';

export default function MatchParticipantsPage() {
  return <MatchStatePageView model={getMatchStateViewModel('participants')} />;
}
