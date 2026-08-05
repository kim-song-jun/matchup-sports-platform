import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MatchPageClient } from './match-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { PublicMatchDetail } from '@/components/public-game-records/types';

async function loadMatch(tournamentId: string, fixtureId: string) {
  return fetchPublicV1<PublicMatchDetail>(
    `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(fixtureId)}`,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; fixtureId: string }>;
}): Promise<Metadata> {
  const { id, fixtureId } = await params;
  const match = await loadMatch(id, fixtureId);
  // 히든 픽스처와 실제로 존재하지 않는 픽스처는 서버가 동일한 404를 내려준다 --
  // 이 메타데이터도 그 둘을 구분하지 않고 항상 같은 noindex로 떨어진다.
  if (!match) return buildNoIndexMetadata('경기 정보를 찾을 수 없어요');

  const homeLabel = match.home?.teamName ?? '미정';
  const awayLabel = match.away?.teamName ?? '미정';
  return buildPublicMetadata({
    title: `${homeLabel} vs ${awayLabel} | ${match.tournamentTitle}`,
    description: `${match.tournamentTitle} ${match.round} 경기 기록을 확인하세요.`,
    path: `/tournaments/${id}/matches/${fixtureId}`,
  });
}

export default async function TournamentMatchPage({
  params,
}: {
  params: Promise<{ id: string; fixtureId: string }>;
}) {
  const { id, fixtureId } = await params;
  // 히든 픽스처와 실제로 존재하지 않는 픽스처가 동일한 404를 내려야 한다는
  // 계약(존재 여부를 캐는 오라클 방지, public-game-records.test.tsx가 고정)이라
  // 이 서버 게이트는 되돌린다 — 참가팀이 공개 시점 전에 라인업을 준비하는 경로는
  // /tournaments/:id/matches/:fixtureId/lineup 을 이 route와 별개로 뒀다(이
  // 페이지의 notFound()를 거치지 않는다). 이 경로에서는 공개된 이후에만
  // 라인업 CTA가 보인다 — 사전 준비 진입점은 후속 작업(대회 "내 경기" 목록 등).
  if (!(await loadMatch(id, fixtureId))) notFound();
  return <MatchPageClient tournamentId={id} fixtureId={fixtureId} />;
}
