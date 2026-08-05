import type { Metadata } from 'next';
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
  // 예전엔 여기서 공개 조회가 실패하면(공개 시점 이전 등) 서버가 바로 notFound()로
  // 404를 냈다 — 참가팀 매니저가 공개 시점 전에 자기 라인업을 미리 준비하러
  // 들어와도 이 화면 자체를 못 봤다(대회 경기 라인업 자기 서비스 기능 추가로
  // 발견). 이제 항상 클라이언트로 렌더해서 MatchPageClient가 공개 기록 조회
  // 실패와 무관하게 라인업 관리 CTA(참가팀 전용)를 시도할 수 있게 한다.
  return <MatchPageClient tournamentId={id} fixtureId={fixtureId} />;
}
