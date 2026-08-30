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
  // 히든 픽스처와 실제로 존재하지 않는 픽스처가 **동일한 404**를 내려야 한다는
  // 계약이다(존재 여부를 캐는 오라클 방지 — public-game-records.test.tsx 가 고정).
  //
  // [P1-d] 예전 주석은 "참가팀이 공개 전에 라인업을 준비하는 경로를 이 route 와 별개로
  // 뒀다"고 설명했는데, 그 경로(/tournaments/:id/matches/:fixtureId/lineup)는 사라졌다.
  // 경기 전 준비는 이제 **팀 전술보드**에서 하고, 그 진입점은 이 공개 페이지가 아니라
  // 팀 상세의 「다가오는 경기」다. 즉 이 route 는 **공개 기록 전용**이고, 404 계약만
  // 지키면 된다 — 팀장의 사전 준비 동선과 더 이상 얽히지 않는다.
  if (!(await loadMatch(id, fixtureId))) notFound();
  return <MatchPageClient tournamentId={id} fixtureId={fixtureId} />;
}
