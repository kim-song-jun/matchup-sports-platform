import type { ReactNode } from 'react';
import { TournamentLiveGate } from '@/components/tournament-live/tournament-live-gate';

interface Props {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * 스태프 표면의 대회 스코프 게이트. 어드민 표면(`/admin/live/[id]`)도 **같은 게이트**를 쓴다 —
 * 인가 판정은 하나이고 경로만 둘이다(`lib/tournament-live-routes.ts`).
 */
export default async function TournamentOpsTournamentLayout({ children, params }: Props) {
  const { id } = await params;
  return <TournamentLiveGate tournamentId={id}>{children}</TournamentLiveGate>;
}
