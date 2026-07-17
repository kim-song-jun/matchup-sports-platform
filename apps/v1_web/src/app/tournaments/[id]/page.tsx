import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TournamentDetailPageClient } from './tournament-detail-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) return buildNoIndexMetadata('대회를 찾을 수 없어요');

  return buildPublicMetadata({
    title: tournament.title,
    description: metadataDescription(
      tournament.promoListSubtitle || tournament.prizeSummary,
      `${tournament.sport.name} 대회의 일정, 참가 조건과 경기 정보를 확인해 보세요.`,
    ),
    path: `/tournaments/${id}`,
    image: tournament.coverImageUrl || tournament.promoListImageUrl,
  });
}

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`)) notFound();
  return <TournamentDetailPageClient tournamentId={id} />;
}
