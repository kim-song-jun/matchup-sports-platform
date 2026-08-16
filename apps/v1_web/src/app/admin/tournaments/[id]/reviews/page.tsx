'use client';

import { ReviewsTab } from '../tournament-detail-client';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentReviewsPage() {
  const { tournamentId, showToast } = useTournamentAdmin();
  return <ReviewsTab tournamentId={tournamentId} showToast={showToast} />;
}
