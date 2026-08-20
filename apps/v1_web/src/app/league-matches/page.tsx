import { Suspense } from 'react';
import { buildPublicMetadata } from '@/lib/seo';
import LeagueMatchesListClient from './league-matches-list-client';

export const metadata = buildPublicMetadata({
  title: '리그전 찾기',
  description: '진행 중이거나 곧 시작하는 리그전을 종목·지역별로 찾아보세요.',
  path: '/league-matches',
});

// team-matches/page.tsx와 동일한 구조: 클라이언트 컴포넌트가 useSearchParams()로
// 필터 상태를 URL에 반영하므로(공유 가능한 딥링크), Next.js App Router 요구대로
// Suspense 경계를 여기서 감싼다.
export default function LeagueMatchesPage() {
  return (
    <Suspense fallback={null}>
      <LeagueMatchesListClient />
    </Suspense>
  );
}
