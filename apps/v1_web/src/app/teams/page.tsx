import { Suspense } from 'react';
import { TeamListPageClient } from '@/components/teams/teams-client';
import { TeamListSsrView } from '@/components/teams/teams-ssr-list';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoListPage } from '@/lib/seo-list';
import type { V1Team } from '@/types/api';

export const metadata = buildPublicMetadata({
  title: '스포츠 팀 찾기',
  description: '종목과 활동 지역이 맞는 스포츠 팀을 찾고 팀원으로 함께해 보세요.',
  path: '/teams',
});

export const revalidate = 300;

export default async function TeamsPage() {
  const teams = await fetchSeoListPage<V1Team>('/teams', 'teams');

  return (
    <Suspense fallback={<TeamListSsrView teams={teams} />}>
      <TeamListPageClient />
    </Suspense>
  );
}
