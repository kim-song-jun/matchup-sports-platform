import type { ReactNode } from 'react';
import { TournamentLiveGate } from '@/components/tournament-live/tournament-live-gate';

interface Props {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * 어드민 표면의 대회 현장 콘솔. 스태프 표면(`/tournament-ops/tournaments/[id]`)과 **같은
 * 게이트·같은 화면**을 쓴다 — 인가 판정은 하나이고 경로만 둘이다.
 *
 * `/admin/tournaments/[id]/live` 가 아니라 형제 경로인 이유는 `lib/tournament-live-routes.ts`
 * 주석 참고(대회 관리 셸이 이중으로 겹치는 것을 피한다).
 */
export default async function AdminTournamentLiveLayout({ children, params }: Props) {
  const { id } = await params;
  return <TournamentLiveGate tournamentId={id}>{children}</TournamentLiveGate>;
}
