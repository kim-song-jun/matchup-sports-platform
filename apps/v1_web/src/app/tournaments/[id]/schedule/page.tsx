import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

// 없는 대회에서 이 라우트만 HTTP 200 을 반환하던 결함의 실제 원인(2026-08-09 alpha 실측으로 격리):
// page.tsx 코드도(#312, 형제와 코드-동일해도 200), 라우트 경로도(#314, 동일 내용을 schedule-view 로
// 옮겨도 200) 원인이 아니었다 — 유일하게 남은 차이인 **SchedulePageClient 클라이언트 컴포넌트의 import
// 그래프**가 이 서버 컴포넌트 번들에 정적으로 들어오면서, notFound() 응답이 200 으로 커밋되게 만들었다
// (형제 results 의 클라이언트는 그렇지 않다). 그래서 **`next/dynamic` 으로 lazy-load** 해 그 그래프를
// 페이지의 초기 서버 렌더 경로에서 분리한다 — 존재하는 대회에선 그대로 렌더되고(SSR 유지), notFound
// 경로는 그 그래프를 건드리지 않는다. 200→404 실제 해소는 프로덕션 런타임이라 배포 후 alpha 재측정으로 확정.
const SchedulePageClient = dynamic(() =>
  import('./schedule-page-client').then((mod) => mod.SchedulePageClient),
);
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) return buildNoIndexMetadata('대회 일정을 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${tournament.title} 경기 일정`,
    description: `${tournament.title}의 경기 일정과 조별 순위를 확인하세요.`,
    path: `/tournaments/${id}/schedule`,
  });
}

export default async function TournamentSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 대회 존재 여부로 게이트한다 — 형제 라우트(bracket/results/reviews/detail)와 동일 패턴.
  // 실제 일정 데이터는 존재하는 대회에 대해 SchedulePageClient 가 클라이언트에서 가져온다.
  if (!(await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`))) {
    notFound();
  }
  return <SchedulePageClient tournamentId={id} />;
}
