import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 라우트 전환 중 보여줄 셸. 없으면 이전 화면이 그대로 멈춰 있다가 갑자기 바뀐다.
 * AppChrome props 는 LeagueMatchesPage 와 같아야 전환 시 헤더·탭이 튀지 않는다.
 */
export default function LeagueMatchesLoading() {
  return (
    <AppChrome title="정규 리그" activeTab="tournaments" showNotifications>
      <p className="sr-only" role="status">정규 리그를 불러오는 중이에요.</p>
      <PageSkeleton />
    </AppChrome>
  );
}
