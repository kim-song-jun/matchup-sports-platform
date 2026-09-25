import { Suspense } from 'react';
import { TeamMatchListPageClient } from '@/components/team-matches/team-matches-client';
import { TeamMatchListSsrView } from '@/components/team-matches/team-matches-ssr-list';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoListPage, fetchSeoMasterSports } from '@/lib/seo-list';
import type { V1TeamMatch } from '@/types/api';

export const metadata = buildPublicMetadata({
  title: '팀매치 찾기',
  description: '우리 팀과 조건이 맞는 상대 팀을 찾고 스포츠 팀매치를 성사시켜 보세요.',
  path: '/team-matches',
});

// matches/page.tsx와 동일 이유 — revalidate=0으로 빌드 타임 프리렌더를 끈다.
export const revalidate = 0;

export default async function TeamMatchesPage() {
  const [matches, sports] = await Promise.all([
    fetchSeoListPage<V1TeamMatch>('/team-matches', 'team-matches'),
    fetchSeoMasterSports(),
  ]);

  return (
    <Suspense fallback={<TeamMatchListSsrView matches={matches} sports={sports} />}>
      <TeamMatchListPageClient />
    </Suspense>
  );
}
