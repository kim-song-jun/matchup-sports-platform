import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

export default function MatchesLoading() {
  return (
    <AppChrome title="매치" activeTab="matches" topBar={false}>
      <PageSkeleton />
    </AppChrome>
  );
}
