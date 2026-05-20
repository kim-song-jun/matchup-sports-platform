import { MatchStatePageView } from '@/components/matches/matches-page';
import { getMatchStateViewModel } from '@/components/matches/matches.view-model';

export default function EmptyMatchesPage() {
  return <MatchStatePageView model={getMatchStateViewModel('empty')} />;
}
