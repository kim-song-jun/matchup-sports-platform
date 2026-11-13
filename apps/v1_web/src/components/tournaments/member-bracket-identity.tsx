'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { V1MyTournamentFixtures } from '@/hooks/use-v1-api';

export type MemberBracketIdentity = { teamIds: string[]; myFixtures: V1MyTournamentFixtures };
const MemberBracketContext = createContext<MemberBracketIdentity | null>(null);
export function MemberBracketIdentityProvider({ value, children }: { value: MemberBracketIdentity; children: ReactNode }) {
  return <MemberBracketContext.Provider value={value}>{children}</MemberBracketContext.Provider>;
}
export function useMemberBracketIdentity() { return useContext(MemberBracketContext); }
