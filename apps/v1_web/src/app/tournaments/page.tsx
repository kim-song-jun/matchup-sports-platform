import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { parseCompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { firstSearchParam, tournamentListSeedPath, type TournamentListSeed } from '@/lib/public-list-seed';
import { fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import type { V1TournamentListPage } from '@/types/api';
import { buildTournamentListMetadata, tournamentListTitle } from './tournament-list-metadata';
import { TournamentsListPageClient } from './tournaments-list-client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 이 값이 하나라도 있으면 무필터 첫 페이지가 그 화면의 결과가 아니다. */
const LIST_FILTER_PARAMS = ['status', 'sportId', 'genderCategory'] as const;

// matches/page.tsx 와 같은 이유 — 빌드 타임 프리렌더를 끈다(빈 seed 가 구워진다).
export const revalidate = 0;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  return buildTournamentListMetadata(parseCompetitionKind(firstSearchParam(params.kind), 'all'));
}

export default async function TournamentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const kind = parseCompetitionKind(firstSearchParam(params.kind), 'all');
  const filtered = LIST_FILTER_PARAMS.some((key) => firstSearchParam(params[key]) !== null);
  const page = filtered
    ? null
    : await fetchSeoSeed<V1TournamentListPage>(tournamentListSeedPath(kind), 'tournaments');
  const seed: TournamentListSeed | undefined = page ? { kind, page } : undefined;

  return (
    <>
      {seed && seed.page.items.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            tournamentListTitle(kind),
            '/tournaments',
            seed.page.items.map((item) => ({ name: item.title, path: `/tournaments/${item.id}` })),
          )}
        />
      ) : null}
      <TournamentsListPageClient seed={seed} />
    </>
  );
}
