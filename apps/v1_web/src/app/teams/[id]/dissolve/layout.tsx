import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

export default function TeamDissolveLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
