'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { V1TournamentStaffRole } from '@/types/api';

/**
 * `_gate.tsx`가 이미 `GET .../staff`로 내 배정을 조회해 역할을 도출한다 — 하위 페이지가
 * 같은 조회/도출 로직을 반복하지 않도록 Context로 전달한다. Provider 밖에서 쓰면 개발 실수를
 * 조용히 삼키지 않기 위해 즉시 throw한다.
 */
const TournamentOpsRoleContext = createContext<V1TournamentStaffRole | null>(null);

export function TournamentOpsRoleProvider({
  role,
  children,
}: {
  role: V1TournamentStaffRole;
  children: ReactNode;
}) {
  return <TournamentOpsRoleContext.Provider value={role}>{children}</TournamentOpsRoleContext.Provider>;
}

export function useTournamentOpsRole(): V1TournamentStaffRole {
  const role = useContext(TournamentOpsRoleContext);
  if (role === null) {
    throw new Error('useTournamentOpsRole은 TournamentOpsRoleProvider 하위에서만 사용할 수 있어요.');
  }
  return role;
}
