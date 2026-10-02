import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

// 컨택 설정(수신 정책 + 차단 목록)은 팀 운영진 전용 화면이다. contact/new와 같은 이유로
// layout 게이트를 건다 — Phase 1 리뷰에서 이 누락이 정확히 Critical로 잡힌 전례가 있다
// (contact/new에 layout이 없었다).
export default function TeamContactSettingsLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
