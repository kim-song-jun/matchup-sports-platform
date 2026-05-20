import { MatchStatePageView } from '@/components/matches/matches-page';
import { getMatchStateViewModel } from '@/components/matches/matches.view-model';

export default function MatchFilterPage() {
  return <MatchStatePageView model={getMatchStateViewModel('filter')} />;
}
