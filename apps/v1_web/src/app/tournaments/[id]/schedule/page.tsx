import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SchedulePageClient } from './schedule-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { PublicTournamentScheduleResponse } from '@/components/public-game-records/types';

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
  if (!(await fetchPublicV1<PublicTournamentScheduleResponse>(`/tournaments/${encodeURIComponent(id)}/schedule`))) {
    notFound();
  }
  return <SchedulePageClient tournamentId={id} />;
}
