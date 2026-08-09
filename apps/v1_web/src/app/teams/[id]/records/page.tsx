import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamRecordsPageClient } from './team-records-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { PublicTeamRecordsResponse } from '@/components/public-game-records/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const records = await fetchPublicV1<PublicTeamRecordsResponse>(`/teams/${encodeURIComponent(id)}/records`);
  if (!records) return buildNoIndexMetadata('팀 전적을 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${records.teamName} 전적`,
    description: `${records.teamName}의 공식 경기 전적과 최근 결과를 확인하세요.`,
    path: `/teams/${id}/records`,
  });
}

export default async function TeamRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await fetchPublicV1<PublicTeamRecordsResponse>(`/teams/${encodeURIComponent(id)}/records`))) notFound();
  return <TeamRecordsPageClient teamId={id} />;
}
