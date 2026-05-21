import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

export default function MatchCreateLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
