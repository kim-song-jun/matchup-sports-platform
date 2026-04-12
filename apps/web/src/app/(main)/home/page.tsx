import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { serverFetch } from '@/lib/server-fetch';
import { HomePage } from './home-client';

export default async function Page() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 120_000 } },
  });

  // Skip server prefetch in Capacitor export builds — fetches run at build time
  // and the API may be unavailable, producing stale or empty dehydrated caches.
  if (process.env.CAPACITOR_BUILD !== 'true') {
    await Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: ['matches', undefined],
        queryFn: () => serverFetch('/matches'),
      }),
      queryClient.prefetchQuery({
        queryKey: ['teams', { limit: '6' }],
        queryFn: () => serverFetch('/teams', { limit: '6' }),
      }),
      queryClient.prefetchQuery({
        queryKey: ['lessons', { limit: '4' }],
        queryFn: () => serverFetch('/lessons', { limit: '4' }),
      }),
      queryClient.prefetchQuery({
        queryKey: ['listings', { limit: '4' }],
        queryFn: () => serverFetch('/marketplace/listings', { limit: '4' }),
      }),
      queryClient.prefetchQuery({
        queryKey: ['team-matches', { limit: '3' }],
        queryFn: () => serverFetch('/team-matches', { limit: '3' }),
      }),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomePage />
    </HydrationBoundary>
  );
}
