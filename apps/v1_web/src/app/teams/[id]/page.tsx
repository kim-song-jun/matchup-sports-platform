import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamDetailPageClient } from '@/components/teams/teams-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import type { V1Team } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await fetchPublicV1<V1Team>(`/teams/${encodeURIComponent(id)}`);
  if (!team) return buildNoIndexMetadata('팀을 찾을 수 없어요');

  return buildPublicMetadata({
    title: team.name,
    description: metadataDescription(
      team.introductionPreview,
      `${team.sportName} · ${team.regionName}에서 활동하는 ${team.name} 팀을 만나보세요.`,
    ),
    path: `/teams/${id}`,
    image: team.coverImageUrl || team.logoUrl,
  });
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await fetchPublicV1<V1Team>(`/teams/${encodeURIComponent(id)}`)) notFound();
  return <TeamDetailPageClient teamId={id} />;
}
