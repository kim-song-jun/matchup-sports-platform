'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { ClientErrorListener } from '@/components/providers/client-error-listener';
import { GoogleAnalytics } from '@/components/providers/google-analytics';
import { getGaMeasurementId } from '@/lib/analytics';
import { GlobalPopup } from '@/components/popups/global-popup';
import { NotificationSocketBridge } from '@/components/providers/notification-socket-bridge';

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
      <NotificationSocketBridge />
      {getGaMeasurementId() && (
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
      )}
      <PendingSocialSignupGate>
        {children}
        <GlobalPopup />
      </PendingSocialSignupGate>
    </QueryClientProvider>
  );
}
