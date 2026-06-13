import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { AdminGate } from './_gate';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AdminGate>{children}</AdminGate>
    </RequireAuth>
  );
}
