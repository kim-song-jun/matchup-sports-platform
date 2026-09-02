import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

// 셸 승격 이후 topbar/제목은 route-chrome 테이블(fragments/team-matches.ts)이 책임진다 —
// 여기서 자체 AppChrome을 다시 씌우면 AppShellFrame과 이중으로 셸을 그린다(§0.4-1).
export default function TeamMatchesLoading() {
  return <PageSkeleton />;
}
