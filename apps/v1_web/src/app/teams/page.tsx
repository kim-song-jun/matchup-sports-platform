import { Suspense } from 'react';
import { TeamListPageClient } from '@/components/teams/teams-client';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: '스포츠 팀 찾기',
  description: '종목과 활동 지역이 맞는 스포츠 팀을 찾고 팀원으로 함께해 보세요.',
  path: '/teams',
});

export default function TeamsPage() {
  return (
    <Suspense fallback={null}>
      <TeamListPageClient />
    </Suspense>
  );
}
