import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { serverFetch } from '@/lib/server-fetch';
import { parseMatchDiscoveryFilters, buildMatchApiParams } from '@/lib/match-discovery';
import { MatchesPage } from './matches-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const rawParams = await searchParams;

  const paramsGetter: Pick<URLSearchParams, 'get'> = {
    get: (key: string): string | null => {
      const val = rawParams[key];
      if (Array.isArray(val)) return val[0] ?? null;
      return val ?? null;
    },
  };

  const filters = parseMatchDiscoveryFilters(paramsGetter);
  const apiParams = buildMatchApiParams(filters);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 120_000 } },
  });

  if (process.env.CAPACITOR_BUILD !== 'true') {
    await Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: ['matches', apiParams],
        queryFn: () => serverFetch('/matches', apiParams),
      }),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MatchesPage />
    </HydrationBoundary>
  );
}
