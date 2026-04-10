import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { serverFetch } from '@/lib/server-fetch';
import { TeamsPage } from './teams-client';

export default async function Page() {
  const queryClient = new QueryClient();

  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: ['teams', undefined],
      queryFn: () => serverFetch('/teams'),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TeamsPage />
    </HydrationBoundary>
  );
}
