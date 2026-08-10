import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

// 결과 입력(/result)과 승인(/result/approval) 모두 인증 사용자만 접근한다 — 실제
// 권한(호스트/상대팀) 구분은 각 페이지가 로드한 뷰어 상태로 판단한다.
export default function TeamMatchResultLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
