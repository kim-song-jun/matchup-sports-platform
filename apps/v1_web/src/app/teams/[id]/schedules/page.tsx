import type { Metadata } from 'next';
import { TeamScheduleListPageClient } from '@/components/team-schedules/team-schedules-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TeamDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await fetchPublicV1<V1TeamDetail>(`/teams/${encodeURIComponent(id)}`);
  if (!team) return buildNoIndexMetadata('팀 일정을 찾을 수 없어요');
  // 해체된 팀은 팀 상세와 같이 검색에서 뺀다.
  if (team.dissolution) return buildNoIndexMetadata(`${team.name} 일정 (해체된 팀)`);
  return buildPublicMetadata({
    title: `${team.name} 일정`,
    description: `${team.name}의 공개된 훈련·경기·행사 일정을 한눈에 확인하세요.`,
    path: `/teams/${id}/schedules`,
  });
}

export default async function TeamSchedulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamScheduleListPageClient teamId={id} />;
}
