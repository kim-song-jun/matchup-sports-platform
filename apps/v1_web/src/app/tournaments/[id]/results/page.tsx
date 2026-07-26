import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ResultsPageClient } from './results-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) return buildNoIndexMetadata('대회 결과를 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${tournament.title} 경기 결과`,
    description: `${tournament.title}의 경기별 결과와 기록을 확인하세요.`,
    path: `/tournaments/${id}/results`,
    image: tournament.coverImageUrl,
  });
}

export default async function TournamentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`)) notFound();
  return <ResultsPageClient tournamentId={id} />;
}
