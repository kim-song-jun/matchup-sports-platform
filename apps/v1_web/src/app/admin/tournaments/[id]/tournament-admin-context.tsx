'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AdminToastVariant } from '@/components/admin';
import type { TournamentAdminRole } from '@/lib/admin-tournament-role';

/**
 * 대회 상세는 섹션마다 라우트가 나뉜다(`/admin/tournaments/:id/:section`). 셸(layout)이
 * 한 번만 판정하는 값을 각 섹션 페이지가 다시 계산하지 않도록 컨텍스트로 내린다.
 *
 * 대회 데이터 자체는 여기 담지 않는다 — 각 섹션이 `useV1AdminTournament(id)` 를 직접 부르면
 * React Query 가 같은 키로 중복 요청을 합쳐 주고, 섹션별로 필요한 만큼만 구독하게 된다.
 */
export interface TournamentAdminContextValue {
  tournamentId: string;
  /**
   * 지금 사용자의 대회 관리 역할. 플랫폼 관리자와 대회 스태프를 같은 어휘로 표현한다
   * (`lib/admin-tournament-role.ts` — 서버 `assertAccess` 와 같은 역할 집합).
   */
  role: TournamentAdminRole;
  /** 쓰기 액션 노출 판정 — `role` 에서 파생된다(별도 상태가 아니다). */
  canWrite: boolean;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}

const TournamentAdminContext = createContext<TournamentAdminContextValue | null>(null);

export function TournamentAdminProvider({
  value,
  children,
}: {
  value: TournamentAdminContextValue;
  children: ReactNode;
}) {
  return <TournamentAdminContext.Provider value={value}>{children}</TournamentAdminContext.Provider>;
}

/** 셸 밖에서 부르면 즉시 실패시킨다 — 조용히 기본값으로 도는 것보다 개발 중 드러나는 편이 낫다. */
export function useTournamentAdmin(): TournamentAdminContextValue {
  const ctx = useContext(TournamentAdminContext);
  if (!ctx) {
    throw new Error('useTournamentAdmin 은 대회 상세 셸(layout) 안에서만 사용할 수 있어요.');
  }
  return ctx;
}
