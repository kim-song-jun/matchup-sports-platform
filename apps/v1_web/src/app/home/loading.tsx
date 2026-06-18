import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

export default function HomeLoading() {
  return (
    <AppChrome title="teameet" activeTab="home" showSearch>
      <PageSkeleton />
    </AppChrome>
  );
}
