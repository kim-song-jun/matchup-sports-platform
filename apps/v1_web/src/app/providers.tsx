'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { GlobalPopup } from '@/components/popups/global-popup';

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
      <PendingSocialSignupGate>{children}</PendingSocialSignupGate>
      <GlobalPopup />
    </QueryClientProvider>
  );
}
