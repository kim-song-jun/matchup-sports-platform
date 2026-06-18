import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

export default function TournamentsLoading() {
  return (
    <AppChrome title="대회" activeTab="tournaments">
      <PageSkeleton />
    </AppChrome>
  );
}
