import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

export default function TeamScheduleEditLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
