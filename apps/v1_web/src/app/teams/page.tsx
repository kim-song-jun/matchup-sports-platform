import { Suspense } from 'react';
import { TeamListPageClient } from '@/components/teams/teams-client';
import { TeamListSsrView } from '@/components/teams/teams-ssr-list';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoCursorPage, fetchSeoMasterSports } from '@/lib/seo-list';
import type { V1Team } from '@/types/api';

export const metadata = buildPublicMetadata({
  title: '스포츠 팀 찾기',
  description: '종목과 활동 지역이 맞는 스포츠 팀을 찾고 팀원으로 함께해 보세요.',
  path: '/teams',
});

// 0 = 이 라우트를 정적/ISR 프리렌더 대상에서 뺀다. `next build`는 API에 못 닿는 CI에서
// 돈다 — revalidate>0로 두면 그 시점의 (실패해 빈) seed가 배포 직후 첫 HIT까지 그대로
// 나간다(관련 메모: isr-serves-build-time-empty-cache). fetchPublicV1의 fetch 자체는
// `next: { revalidate: 300 }`를 여전히 쓰므로 API 부하는 그대로 5분 캐시된다.
export const revalidate = 0;

export default async function TeamsPage() {
  const [page, sports] = await Promise.all([
    fetchSeoCursorPage<V1Team>('/teams', 'teams'),
    fetchSeoMasterSports(),
  ]);

  return (
    <Suspense fallback={<TeamListSsrView teams={page.items} total={page.pageInfo?.total} sports={sports} />}>
      <TeamListPageClient seed={{ page, sports }} />
    </Suspense>
  );
}
