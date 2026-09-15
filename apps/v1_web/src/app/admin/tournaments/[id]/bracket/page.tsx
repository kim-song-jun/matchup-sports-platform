'use client';

import { useV1AdminTournament, useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { BracketTab } from '../bracket-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentBracketPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(tournamentId);
  // 확정 팀 목록은 대진 편성에 필요하다. 셸이 아니라 이 섹션에서만 구독한다.
  const { data: regData } = useV1AdminTournamentRegistrations(tournamentId);

  return (
    <BracketTab
      tournamentId={tournamentId}
      showToast={showToast}
      registrations={regData?.items ?? []}
      registrationDeadlineAt={tournament?.registrationDeadlineAt}
      bracketPublishedAt={tournament?.bracketPublishedAt}
      bracketPublishScheduledAt={tournament?.bracketPublishScheduledAt}
      canWrite={canWrite}
    />
  );
}
