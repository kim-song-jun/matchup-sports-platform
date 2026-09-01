import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamDetailPageClient } from '@/components/teams/teams-client';
import { JsonLd } from '@/components/seo/json-ld';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1, metadataDescription } from '@/lib/seo';
import { buildBreadcrumbLd, buildSportsTeamLd } from '@/lib/structured-data';
import type { V1Team, V1TeamDetail } from '@/types/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await fetchPublicV1<V1Team>(`/teams/${encodeURIComponent(id)}`);
  if (!team) return buildNoIndexMetadata('팀을 찾을 수 없어요');

  return buildPublicMetadata({
    title: team.name,
    description: metadataDescription(
      team.introductionPreview,
      `${team.sportName} · ${team.regionName}에서 활동하는 ${team.name} 팀을 만나보세요.`,
    ),
    path: `/teams/${id}`,
    image: team.coverImageUrl || team.logoUrl,
  });
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 상세 응답은 목록과 구조가 다르다(로고·소개가 profile 아래) — 구조화 데이터가 그 값을
  // 읽어야 하므로 상세 타입으로 받는다.
  const team = await fetchPublicV1<V1TeamDetail>(`/teams/${encodeURIComponent(id)}`);
  if (!team) notFound();

  return (
    <>
      <JsonLd data={buildSportsTeamLd(team)} />
      <JsonLd
        data={buildBreadcrumbLd([
          { name: '팀', path: '/teams' },
          { name: team.name, path: `/teams/${id}` },
        ])}
      />
      <TeamDetailPageClient teamId={id} />
    </>
  );
}
