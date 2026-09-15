import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { TeamMatchDetailPageClient } from '@/components/team-matches/team-matches-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import type { V1TeamMatch } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const teamMatch = await fetchPublicV1<V1TeamMatch>(`/team-matches/${encodeURIComponent(id)}`);
  if (!teamMatch) return buildNoIndexMetadata('팀매치를 찾을 수 없어요');

  return buildPublicMetadata({
    title: teamMatch.title,
    description: metadataDescription(
      teamMatch.description,
      `${teamMatch.sportName} · ${teamMatch.placeName}에서 열리는 팀매치 정보를 확인해 보세요.`,
    ),
    path: `/team-matches/${id}`,
    image: teamMatch.imageUrl,
  });
}

export default async function TeamMatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamMatch = await fetchPublicV1<V1TeamMatch>(`/team-matches/${encodeURIComponent(id)}`);
  if (!teamMatch) notFound();
  // 리그 대진은 리그 경기 상세로 보낸다 — 이 화면의 "상대팀 모집 → 신청 → 승인" 프레임은
  // 상대가 이미 확정된 리그 경기와 맞지 않는다(상대팀 이름 자리에 "승인 완료"가 뜨던
  // 2026-08-25 사용자 보고). 알림·목록 등 기존 /team-matches/:id 딥링크도 이 리다이렉트를
  // 지나므로 링크 전수 교체 없이 착지 화면만 바뀐다. 라인업·결과·수정 하위 라우트는
  // 별도 경로라 영향이 없다.
  if (teamMatch.league) redirect(`/league-matches/${teamMatch.league.leagueId}/fixtures/${id}`);
  // matches/[id] 와 같은 이유 — 리다이렉트 판정을 위해 이미 받은 응답을 첫 표시값으로 넘긴다.
  return <TeamMatchDetailPageClient teamMatchId={id} seed={teamMatch} />;
}
