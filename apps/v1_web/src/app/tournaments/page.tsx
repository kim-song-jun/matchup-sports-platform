import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { parseCompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { firstSearchParam, hasListFilter, tournamentListSeedPath, type TournamentListSeed } from '@/lib/public-list-seed';
import { fetchSeoMasterSports, fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import type { V1TournamentListPage } from '@/types/api';
import { buildTournamentListMetadata, tournamentListCanonical, tournamentListTitle } from './tournament-list-metadata';
import { TournamentsListPageClient } from './tournaments-list-client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const ITEM_LIST_FILTER_PARAMS = ['status', 'sportId', 'genderCategory'] as const;

// matches/page.tsx 와 같은 이유 — 빌드 타임 프리렌더를 끈다(빈 seed 가 구워진다).
export const revalidate = 0;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  return buildTournamentListMetadata(parseCompetitionKind(firstSearchParam(params.kind), 'all'));
}

export default async function TournamentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const kind = parseCompetitionKind(firstSearchParam(params.kind), 'all');
  // 클라이언트와 같은 양의 안전한 정수 규칙. 두 번째 페이지부터는 첫 페이지 seed가
  // 실제 화면과 다르므로 불필요한 조회와 잘못된 ItemList를 모두 생략한다.
  const rawPage = firstSearchParam(params.page);
  const parsedPage = rawPage !== null && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const nonFirstPage = Number.isSafeInteger(parsedPage) && parsedPage > 1;
  const sports = nonFirstPage ? [] : await fetchSeoMasterSports();
  const query = nonFirstPage ? null : tournamentListSeedPath(kind, params, sports);
  const page = query
    ? await fetchSeoSeed<V1TournamentListPage>(query, 'tournaments', { cache: 'no-store' })
    : null;
  const seed: TournamentListSeed | undefined = page && query ? { kind, page, query, sports } : undefined;
  const hasFilters = hasListFilter(params, ITEM_LIST_FILTER_PARAMS);
  const itemListAllowed = !hasFilters && seed !== undefined && seed.query === tournamentListSeedPath(kind, { kind }, sports);

  return (
    <>
      {seed && itemListAllowed && seed.page.items.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            tournamentListTitle(kind),
            tournamentListCanonical(kind),
            seed.page.items.map((item) => ({ name: item.title, path: `/tournaments/${item.id}` })),
          )}
        />
      ) : null}
      <TournamentsListPageClient seed={seed} />
    </>
  );
}
