import { Suspense } from 'react';
import { MatchListPageClient } from '@/components/matches/matches-client';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: '개인 매치 찾기',
  description: '내 지역과 종목에 맞는 스포츠 매치를 찾고 함께 운동할 사람을 만나보세요.',
  path: '/matches',
});

export default function MatchesPage() {
  return (
    <Suspense fallback={null}>
      <MatchListPageClient />
    </Suspense>
  );
}
