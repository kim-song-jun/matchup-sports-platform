'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { usePushRegistration } from '@/hooks/use-push-registration';
import { RealtimeProvider, useChatUnreadSync, useNotificationSync } from '@/hooks/use-realtime';

/** 앱 마운트 시 /auth/me 로 실제 사용자 정보를 채움 */
function AuthHydrator() {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    api
      .get('/auth/me')
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setUser(data);
      })
      .catch(() => {
        logout();
      });
  }, [setUser, logout]);

  return null;
}

function PushRegistrar() {
  usePushRegistration();
  return null;
}

function ChatUnreadSyncer() {
  useChatUnreadSync();
  return null;
}

function NotificationSyncer() {
  useNotificationSync();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 120 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <ToastProvider>
          <AuthHydrator />
          <PushRegistrar />
          <ChatUnreadSyncer />
          <NotificationSyncer />
          {children}
        </ToastProvider>
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
