'use client';

import { useV1AdminTournament } from '@/hooks/use-v1-api';
import { RegistrationsTab } from '../registrations-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentRegistrationsPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(tournamentId);

  return (
    <RegistrationsTab
      tournamentId={tournamentId}
      showToast={showToast}
      tournamentTeamCount={tournament?.teamCount}
      canWrite={canWrite}
      admissionsBlockedReason={!tournament ? '대회 상태를 불러온 뒤 참가 확정·대기 처리를 할 수 있어요.' : tournament.status === 'completed' || tournament.status === 'cancelled' ? '종료·취소된 대회에서는 참가 확정·대기 처리를 할 수 없어요.' : null}
      // 무료 대회는 입금 단계가 없다 — 배지·안내·버튼을 입금 말이 아니라 신청 말로 바꾼다.
      isFreeEntry={tournament?.entryFee === 0}
      rosterDeadlineAt={tournament?.rosterDeadlineAt ?? null}
    />
  );
}
