'use client';

import { TournamentCampaignTab } from '../tournament-campaign-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentCampaignPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  return <TournamentCampaignTab tournamentId={tournamentId} canWrite={canWrite} showToast={showToast} />;
}
