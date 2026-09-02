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
  // 존재 확인을 위해 어차피 기다리는 응답이다 — 버리지 않고 첫 표시값으로 넘긴다.
  // 추가 요청이 아니므로 TTFB 는 그대로고, 딥링크·푸시·새로고침 진입에서 첫 화면이
  // 비어 있던 구간이 사라진다.
  const match = await fetchPublicV1<V1Match>(`/matches/${encodeURIComponent(id)}`);
  if (!match) notFound();
  return <MatchDetailPageClient matchId={id} seed={match} />;
}
