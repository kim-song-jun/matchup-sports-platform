import type { ReactNode } from 'react';
import { RequireActivityProfile } from '@/components/auth/require-activity-profile';
import { RequireAuth } from '@/components/auth/require-auth';

export default function TeamCreateLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">{children}</RequireActivityProfile>
    </RequireAuth>
  );
}
