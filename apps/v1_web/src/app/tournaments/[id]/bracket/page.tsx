import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BracketPageClient } from './bracket-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!tournament) return buildNoIndexMetadata('대진표를 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${tournament.title} 대진표`,
    description: `${tournament.title}의 조별 순위와 토너먼트 대진표를 확인하세요.`,
    path: `/tournaments/${id}/bracket`,
    image: tournament.coverImageUrl,
  });
}

export default async function TournamentBracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!tournament) notFound();
  // 404 판정에 받은 응답을 첫 화면으로 넘긴다 — 크롤러가 받는 서버 HTML 에 실제 내용이 들어간다.
  return <BracketPageClient tournamentId={id} seed={tournament} />;
}
