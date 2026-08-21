import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

// 컨택 발신은 운영 권한 전용 화면이다. 게스트가 URL 로 직접 들어오면 설명 없는
// 비활성 폼을 보게 되므로, app/my 와 app/teams/new 와 같은 layout 게이트를 건다.
export default function TeamContactNewLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
