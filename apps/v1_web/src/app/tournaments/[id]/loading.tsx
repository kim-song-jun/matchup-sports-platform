import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

export default function TournamentDetailLoading() {
  return (
    <AppChrome title="대회 상세" backHref="/tournaments" bottomNav={false} activeTab="tournaments">
      <PageSkeleton variant="detail" />
    </AppChrome>
  );
}
