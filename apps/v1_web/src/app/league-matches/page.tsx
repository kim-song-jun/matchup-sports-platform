import { Suspense } from 'react';
import { CompetitionKindSegment } from '@/components/v1-ui/competition-kind-segment';
import { buildPublicMetadata } from '@/lib/seo';
import LeagueMatchesListClient from './league-matches-list-client';

export const metadata = buildPublicMetadata({
  title: '정규 리그 찾기',
  description: '진행 중이거나 곧 시작하는 정규 리그를 종목·지역별로 찾아보세요.',
  path: '/league-matches',
});

// AppChrome 승격(U31) — 셸은 이제 이 페이지가 아니라 route-chrome 테이블
// (lib/route-chrome/fragments/league-matches.ts)이 정적으로 그린다. 이 화면은
// 원래 셸 밖의 맨 div라 하단 내비가 없어서, 들어온 사용자가 브라우저 뒤로가기 말고는
// 앱으로 돌아갈 길이 없었다 — 그 이유로 테이블에 등록해 다른 공개 목록(/tournaments 등)과
// 동일하게 셸을 갖췄다(docs/design/app-shell-promotion.md 부록 B).
export default function LeagueMatchesPage() {
  return (
    <>
      <CompetitionKindSegment active="league" />
      <Suspense fallback={null}>
        <LeagueMatchesListClient />
      </Suspense>
    </>
  );
}
