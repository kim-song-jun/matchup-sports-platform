import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

export default function TournamentManagementLayout({ children }: { children: ReactNode }) {
  return <RequireAuth><main className="min-h-screen bg-[var(--bg)] px-4 py-6 md:px-6 lg:px-8">{children}</main></RequireAuth>;
}
