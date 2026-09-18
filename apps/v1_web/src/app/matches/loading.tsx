import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

// 셸 승격(U27): AppChrome 래핑은 route-chrome/fragments/matches.ts의 '/matches' 행이
// 대신한다(AppShellFrame이 마운트). 여기선 스켈레톤만 그린다.
export default function MatchesLoading() {
  return <PageSkeleton />;
}
