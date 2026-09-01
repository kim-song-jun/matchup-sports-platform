import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

// 셸 승격(U25): 이 라우트의 title/activeTab/showSearch는 이제 AppShellFrame이
// route-chrome/fragments/home.ts 테이블로 렌더한다 — 자체 AppChrome 래핑을 걷어내지 않으면
// 이중 셸 가드(ShellMountedContext)가 상시 발동한다(app-motion-wave-plan.md §0.4-1).
export default function HomeLoading() {
  return <PageSkeleton />;
}
