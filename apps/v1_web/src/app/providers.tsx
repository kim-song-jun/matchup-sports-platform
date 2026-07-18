'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { ClientErrorListener } from '@/components/providers/client-error-listener';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ClientErrorListener />
      <PendingSocialSignupGate>{children}</PendingSocialSignupGate>
    </QueryClientProvider>
  );
}
