import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TournamentDetailPageClient } from './tournament-detail-client';
import { JsonLd } from '@/components/seo/json-ld';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import { buildBreadcrumbLd, buildSportsEventLd } from '@/lib/structured-data';
import { resolveTournamentImage } from '@/lib/tournament-promo';
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
    image: resolveTournamentImage(tournament, 'cover'),
  });
}

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`);
  if (!tournament) notFound();

  // generateMetadata가 이미 같은 URL을 가져왔지만 Next의 fetch 캐시가 요청을 합쳐 주므로
  // 추가 왕복은 없다. 이 응답을 버리지 않고 구조화 데이터로 흘려보낸다.
  const eventLd = buildSportsEventLd(tournament, { image: resolveTournamentImage(tournament, 'cover') });

  return (
    <>
      {eventLd ? <JsonLd data={eventLd} /> : null}
      <JsonLd
        data={buildBreadcrumbLd([
          { name: '대회', path: '/tournaments' },
          { name: tournament.title, path: `/tournaments/${id}` },
        ])}
      />
      <TournamentDetailPageClient tournamentId={id} />
    </>
  );
}
