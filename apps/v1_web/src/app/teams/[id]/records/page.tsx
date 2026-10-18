import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamRecordsPageClient } from './team-records-page-client';
import { buildNoIndexMetadata, buildPublicMetadata, fetchPublicV1 } from '@/lib/seo';
import type { PublicTeamRecordsResponse, TeamRecordCategory } from '@/components/public-game-records/types';

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
  const records = await fetchPublicV1<PublicTeamRecordsResponse>(`/teams/${encodeURIComponent(id)}/records`);
  if (!records) return buildNoIndexMetadata('팀 전적을 찾을 수 없어요');
  return buildPublicMetadata({
    title: `${records.teamName} 전적`,
    description: `${records.teamName}의 공식 경기 전적과 최근 결과를 확인하세요.`,
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
  const records = await fetchPublicV1<PublicTeamRecordsResponse>(recordsPath(id, filters));
  if (!records) notFound();
  return <TeamRecordsPageClient teamId={id} seed={records} seedSeason={filters.season} seedType={filters.type} />;
}
