import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BracketPageClient } from './bracket-page-client';
import { bracketIntroLine, isLeagueCompetition } from '@/lib/competition-kind';
import { JsonLd } from '@/components/seo/json-ld';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import { buildTournamentSubpageBreadcrumbLd } from '@/lib/structured-data';
import { resolveTournamentImage } from '@/lib/tournament-promo';
import type { V1TournamentDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tournament = await fetchPublicV1<V1TournamentDetail>(`/tournaments/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!tournament) return buildNoIndexMetadata('대진표를 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${tournament.title} 대진표`,
    // 리그처럼 그리는 대회만 화면 소개 줄과 같은 문장을 쓴다. 그 밖의 형식은 기존 설명을 그대로 둔다.
    description: isLeagueCompetition(tournament)
      ? `${tournament.title}의 ${bracketIntroLine(tournament)}`
      : `${tournament.title}의 조별 순위와 토너먼트 대진표를 확인하세요.`,
    path: `/tournaments/${id}/bracket`,
    image: resolveTournamentImage(tournament, 'cover'),
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
  return (
    <>
      <JsonLd data={buildTournamentSubpageBreadcrumbLd({ id, title: tournament.title }, { name: '대진표', segment: 'bracket' })} />
      <BracketPageClient tournamentId={id} seed={tournament} />
    </>
  );
}
