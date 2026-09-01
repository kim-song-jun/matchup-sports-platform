'use client';

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Suspense, type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { PhoneVerificationRequiredModal } from '@/components/auth/phone-verification/phone-verification-required-modal';
import { ClientErrorListener } from '@/components/providers/client-error-listener';
import { GoogleAnalytics } from '@/components/providers/google-analytics';
import { getGaMeasurementId } from '@/lib/analytics';
import { GlobalPopup } from '@/components/popups/global-popup';
import { NotificationSocketBridge } from '@/components/providers/notification-socket-bridge';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { KeyboardViewportBridge } from '@/components/providers/keyboard-viewport-bridge';
import { AppShellFrame } from '@/components/v1-ui/app-shell-frame';
import {
  createV1Persister,
  shouldPersistQuery,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
} from '@/lib/query-persist';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  const [persister] = useState(() => createV1Persister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: PERSIST_BUSTER,
        maxAge: PERSIST_MAX_AGE_MS,
        dehydrateOptions: {
          // persist 패키지 2종(@tanstack/react-query-persist-client ·
          // query-sync-storage-persister)은 peer 로 @tanstack/react-query ^5.102.8 을
          // 요구한다. package.json 의 범위를 거기에 맞춰 정렬해 두었으므로 query-core 는
          // 한 벌만 설치되고, 이 콜백은 타입 우회 없이 그대로 연결된다 — 범위를 다시
          // 낮추면 query-core 가 두 벌이 되면서 여기서 TS2345 가 난다.
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && shouldPersistQuery(query),
        },
      }}
    >
      <ThemeProvider>
        <KeyboardViewportBridge />
        <ClientErrorListener />
        <NotificationSocketBridge />
        {getGaMeasurementId() && (
          <Suspense fallback={null}>
            <GoogleAnalytics />
          </Suspense>
        )}
        <PendingSocialSignupGate>
          <AppShellFrame>{children}</AppShellFrame>
          <GlobalPopup />
          <PhoneVerificationRequiredModal />
        </PendingSocialSignupGate>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
