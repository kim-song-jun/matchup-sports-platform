import { Suspense } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
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
//
// AppChrome은 클라이언트 컴포넌트가 아니라 **여기** page에서 두른다. 이 페이지는 원래
// 셸 밖의 맨 div라 하단 내비가 없어서, 들어온 사용자가 브라우저 뒤로가기 말고는 앱으로
// 돌아갈 길이 없었다(/tournaments 등 다른 공개 목록은 전부 AppChrome을 쓴다).
// 클라이언트 안에 두지 않는 이유: 그러면 목록 클라이언트를 직접 렌더하는 테스트가
// 알림 벨까지 끌어와 use-v1-api 모킹 표면이 화면과 무관하게 넓어진다.
// activeTab은 'matches' — 리그는 개인·팀 매치와 같은 "경기를 찾는" 축이고,
// MatchTypeSegment로 셋이 서로 오간다.
export default function LeagueMatchesPage() {
  return (
    <AppChrome title="리그" activeTab="matches">
      <Suspense fallback={null}>
        <LeagueMatchesListClient />
      </Suspense>
    </AppChrome>
  );
}
