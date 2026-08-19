'use client';

import { ReviewsTab } from '../reviews-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentReviewsPage() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  return <ReviewsTab tournamentId={tournamentId} canWrite={canWrite} showToast={showToast} />;
}
