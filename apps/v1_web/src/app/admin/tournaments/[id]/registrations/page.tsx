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
      // 무료 대회는 입금 단계가 없다 — 필터·상태를 '신청 확인 중' 같은 신청 말로 바꾼다(리그 신청 화면과 같다, MD-QA #171).
      isFreeEntry={tournament?.entryFee === 0}
    />
  );
}
