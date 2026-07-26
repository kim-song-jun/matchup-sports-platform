import { Suspense } from 'react';
import { TeamMatchListPageClient } from '@/components/team-matches/team-matches-client';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: '팀 매치 찾기',
  description: '우리 팀과 조건이 맞는 상대 팀을 찾고 스포츠 팀 매치를 성사시켜 보세요.',
  path: '/team-matches',
});

export default function TeamMatchesPage() {
  return (
    <Suspense fallback={null}>
      <TeamMatchListPageClient />
    </Suspense>
  );
}
