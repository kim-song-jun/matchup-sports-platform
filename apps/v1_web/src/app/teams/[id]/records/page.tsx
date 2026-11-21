import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamRecordsPageClient } from './team-records-page-client';
import { JsonLd } from '@/components/seo/json-ld';
import { buildNoIndexMetadata, buildPublicMetadata, buildTeamRecordsDescription, fetchPublicV1 } from '@/lib/seo';
import { buildTeamSubpageBreadcrumbLd } from '@/lib/structured-data';
import type { PublicTeamRecordsResponse, TeamRecordCategory } from '@/components/public-game-records/types';
import type { V1TeamDetail } from '@/types/api';

type RecordsSearchParams = Record<string, string | string[] | undefined>;

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRecordsFilters(searchParams: RecordsSearchParams | undefined) {
  const rawType = firstSearchParam(searchParams?.type);
  const type: TeamRecordCategory | undefined =
    rawType === 'league' || rawType === 'tournament' || rawType === 'friendly' ? rawType : undefined;
  const rawSeason = firstSearchParam(searchParams?.season);
  const season = rawSeason && /^[0-9]{4}$/.test(rawSeason) ? rawSeason : undefined;
  return { season, type };
}

function recordsPath(id: string, filters: { season?: string; type?: TeamRecordCategory }) {
  const query = new URLSearchParams();
  if (filters.season) query.set('season', filters.season);
  if (filters.type) query.set('type', filters.type);
  const suffix = query.toString();
  return `/teams/${encodeURIComponent(id)}/records${suffix ? `?${suffix}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const records = await fetchPublicV1<PublicTeamRecordsResponse>(`/teams/${encodeURIComponent(id)}/records`, { cache: 'no-store' });
  if (!records) return buildNoIndexMetadata('팀 전적을 찾을 수 없어요');
  // 해체된 팀은 팀 상세와 같이 검색에서 뺀다.
  const team = await fetchPublicV1<V1TeamDetail>(`/teams/${encodeURIComponent(id)}`);
  if (team?.dissolution) return buildNoIndexMetadata(`${records.teamName} 전적 (해체된 팀)`);
  return buildPublicMetadata({
    title: `${records.teamName} 전적`,
    description: buildTeamRecordsDescription(records),
    path: `/teams/${id}/records`,
  });
}

export default async function TeamRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<RecordsSearchParams>;
}) {
  const { id } = await params;
  const filters = normalizeRecordsFilters(searchParams ? await searchParams : undefined);
  const records = await fetchPublicV1<PublicTeamRecordsResponse>(recordsPath(id, filters), { cache: 'no-store' });
  if (!records) notFound();
  // 빵부스러기 중간 항목인 팀 상세가 noindex 인 해체된 팀에는 달지 않는다. 팀 상세가 없는(비공개) 팀도 마찬가지다.
  const team = await fetchPublicV1<V1TeamDetail>(`/teams/${encodeURIComponent(id)}`);
  const showBreadcrumb = Boolean(team) && !team?.dissolution;
  return (
    <>
      {showBreadcrumb && (
        <JsonLd data={buildTeamSubpageBreadcrumbLd({ id, name: records.teamName }, { name: '전적', segment: 'records' })} />
      )}
      <TeamRecordsPageClient teamId={id} seed={records} seedSeason={filters.season} seedType={filters.type} />
    </>
  );
}
