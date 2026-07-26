import type { V1TournamentCampaignStatus } from '@/types/tournament-campaign';

export const TOURNAMENT_CAMPAIGN_STATUS_LABEL: Record<V1TournamentCampaignStatus, string> = {
  draft: '초안',
  published: '공개',
  archived: '보관',
};

export function allowedTournamentCampaignTransitions(
  status: V1TournamentCampaignStatus,
): readonly V1TournamentCampaignStatus[] {
  switch (status) {
    case 'draft': return ['published', 'archived'];
    case 'published': return ['draft', 'archived'];
    case 'archived': return ['draft'];
  }
}

export function tournamentCampaignStatusActionLabel(status: V1TournamentCampaignStatus): string {
  switch (status) {
    case 'published': return '공개하기';
    case 'draft': return '초안으로 전환';
    case 'archived': return '보관하기';
  }
}

export function tournamentCampaignStatusBadgeClass(status: V1TournamentCampaignStatus): string {
  switch (status) {
    case 'published': return 'rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600';
    case 'draft': return 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600';
    case 'archived': return 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700';
  }
}
