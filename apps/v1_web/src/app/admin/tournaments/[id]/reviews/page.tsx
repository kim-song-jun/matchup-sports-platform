'use client';

import { ReviewsTab } from '../reviews-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

export default function AdminTournamentReviewsPage() {
  const { tournamentId, showToast } = useTournamentAdmin();
  return <ReviewsTab tournamentId={tournamentId} showToast={showToast} />;
}
