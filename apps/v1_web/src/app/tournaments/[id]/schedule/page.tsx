import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SchedulePageClient } from './schedule-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

// 없는 대회에서 이 라우트만 HTTP 200 을 반환하던 결함 — #298·#302·#305·#307 이 엔드포인트·notFound
// 위치·force-dynamic 가설로 다 실패했다. 이번엔 그 추가 장치(force-dynamic·generateMetadata 내
// notFound throw)를 모두 걷어내고, 정상 404 인 형제 라우트(results/bracket/awards/reviews)와
// **구조적으로 동일**하게 되돌린다: force-dynamic 없음, generateMetadata 는 없는 대회에서 notFound()
// 를 던지지 않고 noindex 메타를 반환하며, 존재 게이트는 페이지 컴포넌트의 notFound() 하나로 둔다.
// 200→404 실제 해소는 프로덕션 런타임 동작이라 배포 후 alpha 재측정으로 확정한다.
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
