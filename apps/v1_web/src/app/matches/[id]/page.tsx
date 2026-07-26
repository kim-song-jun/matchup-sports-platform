import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MatchDetailPageClient } from '@/components/matches/matches-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import type { V1Match } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const match = await fetchPublicV1<V1Match>(`/matches/${encodeURIComponent(id)}`);
  if (!match) return buildNoIndexMetadata('매치를 찾을 수 없어요');

  return buildPublicMetadata({
    title: match.title,
    description: metadataDescription(
      match.description,
      `${match.sportName} · ${match.placeName}에서 열리는 개인 매치 정보를 확인해 보세요.`,
    ),
    path: `/matches/${id}`,
    image: match.imageUrl,
  });
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await fetchPublicV1<V1Match>(`/matches/${encodeURIComponent(id)}`)) notFound();
  return <MatchDetailPageClient matchId={id} />;
}
