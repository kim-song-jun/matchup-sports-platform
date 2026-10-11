import type { ReactNode } from 'react';
import { RequireActivityProfile } from '@/components/auth/require-activity-profile';
import { RequireAuth } from '@/components/auth/require-auth';

export default function TeamMatchCreateLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireActivityProfile title="팀 매치를 만들려면 정보가 필요해요">{children}</RequireActivityProfile>
    </RequireAuth>
  );
}
