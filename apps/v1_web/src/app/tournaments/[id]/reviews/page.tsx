import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TournamentReviewsPageClient } from './reviews-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) return buildNoIndexMetadata('대회 후기를 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${tournament.title} 참가 후기`,
    description: `${tournament.title}에 참가한 팀들의 실제 후기를 확인하세요.`,
    path: `/tournaments/${id}/reviews`,
    image: tournament.coverImageUrl,
  });
}

export default async function TournamentReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`)) notFound();
  return <TournamentReviewsPageClient tournamentId={id} />;
}
