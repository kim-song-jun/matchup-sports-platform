import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

export default function TeamsLoading() {
  return (
    <AppChrome title="팀" activeTab="teams" topBar={false}>
      <PageSkeleton />
    </AppChrome>
  );
}
