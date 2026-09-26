import { Suspense } from 'react';
import { MatchListPageClient } from '@/components/matches/matches-client';
import { MatchListSsrView } from '@/components/matches/matches-ssr-list';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoListPage, fetchSeoMasterSports } from '@/lib/seo-list';
import type { V1Match } from '@/types/api';

export const metadata = buildPublicMetadata({
  title: '개인 매치 찾기',
  description: '내 지역과 종목에 맞는 스포츠 매치를 찾고 함께 운동할 사람을 만나보세요.',
  path: '/matches',
});

// 첫 페이지를 서버에서 미리 받아 크롤러에게 내보낸다. revalidate=0으로 정적/ISR 프리렌더를
// 끈다 — 켜 두면 API에 못 닿는 빌드(next build, CI)에서 구운 빈 목록이 배포 직후 그대로
// 나간다(teams/page.tsx와 동일 이유). fetchPublicV1 내부 fetch는 `next: { revalidate: 300 }`를
// 그대로 쓰므로 5분 캐시는 유지된다.
export const revalidate = 0;

export default async function MatchesPage() {
  const [matches, sports] = await Promise.all([
    fetchSeoListPage<V1Match>('/matches', 'matches'),
    fetchSeoMasterSports(),
  ]);

  return (
    <Suspense fallback={<MatchListSsrView matches={matches} sports={sports} />}>
      <MatchListPageClient />
    </Suspense>
  );
}
