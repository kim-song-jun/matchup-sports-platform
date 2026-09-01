import { Suspense } from 'react';
import { MatchListPageClient } from '@/components/matches/matches-client';
import { MatchListSsrView } from '@/components/matches/matches-ssr-list';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoListPage } from '@/lib/seo-list';
import type { V1Match } from '@/types/api';

export const metadata = buildPublicMetadata({
  title: '개인 매치 찾기',
  description: '내 지역과 종목에 맞는 스포츠 매치를 찾고 함께 운동할 사람을 만나보세요.',
  path: '/matches',
});

// 첫 페이지를 서버에서 미리 받아 크롤러에게 내보낸다. 목록은 자주 바뀌므로 5분 ISR —
// sitemap.ts 와 같은 주기를 쓴다.
export const revalidate = 300;

export default async function MatchesPage() {
  const matches = await fetchSeoListPage<V1Match>('/matches', 'matches');

  return (
    <Suspense fallback={<MatchListSsrView matches={matches} />}>
      <MatchListPageClient />
    </Suspense>
  );
}
