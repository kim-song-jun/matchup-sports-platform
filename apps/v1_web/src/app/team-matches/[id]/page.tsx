import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamMatchDetailPageClient } from '@/components/team-matches/team-matches-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import type { V1TeamMatch } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const teamMatch = await fetchPublicV1<V1TeamMatch>(`/team-matches/${encodeURIComponent(id)}`);
  if (!teamMatch) return buildNoIndexMetadata('팀 매치를 찾을 수 없어요');

  return buildPublicMetadata({
    title: teamMatch.title,
    description: metadataDescription(
      teamMatch.description,
      `${teamMatch.sportName} · ${teamMatch.placeName}에서 열리는 팀 매치 정보를 확인해 보세요.`,
    ),
    path: `/team-matches/${id}`,
    image: teamMatch.imageUrl,
  });
}

export default async function TeamMatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await fetchPublicV1<V1TeamMatch>(`/team-matches/${encodeURIComponent(id)}`)) notFound();
  return <TeamMatchDetailPageClient teamMatchId={id} />;
}
