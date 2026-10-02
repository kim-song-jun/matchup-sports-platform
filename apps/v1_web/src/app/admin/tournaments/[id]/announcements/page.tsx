'use client';

import { AnnouncementsTab } from '../announcements-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentAnnouncementsPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  return <AnnouncementsTab tournamentId={tournamentId} canWrite={canWrite} showToast={showToast} />;
}
