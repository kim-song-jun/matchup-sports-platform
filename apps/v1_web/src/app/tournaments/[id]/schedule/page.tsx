import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SchedulePageClient } from './schedule-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { PublicTournamentScheduleResponse } from '@/components/public-game-records/types';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const schedule = await fetchPublicV1<PublicTournamentScheduleResponse>(`/tournaments/${encodeURIComponent(id)}/schedule`);
  if (!schedule) return buildNoIndexMetadata('대회 일정을 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${schedule.tournamentTitle} 경기 일정`,
    description: `${schedule.tournamentTitle}의 경기 일정과 조별 순위를 확인하세요.`,
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
  // 예전엔 하위 엔드포인트 `/tournaments/:id/schedule` 로 게이트했는데, 그 비대칭 탓에 없는
  // 대회에서도 이 라우트만 HTTP 200 을 반환했다(형제 4개는 정확히 404. 2026-08-09 alpha 실측).
  // 대회가 존재하면 일정이 비어 있어도 페이지는 존재해야 하므로 의미상으로도 이쪽이 맞다 —
  // 실제 일정 데이터는 SchedulePageClient 가 클라이언트에서 가져온다.
  if (!(await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`))) {
    notFound();
  }
  return <SchedulePageClient tournamentId={id} />;
}
