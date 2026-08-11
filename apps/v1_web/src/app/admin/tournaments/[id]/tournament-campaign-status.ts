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
    // 흰 카드(--card-surface) 내부에 렌더되므로 bg-gray-100 채움만으로는 대비 ~1.10:1이라
    // 배지 경계가 사실상 안 보였다. tm-profile-level-panel/tm-review-avatar와 동일 패턴으로
    // --surface-soft(카드보다 한 단계 진한 표면) + --border-strong 보더를 더한다.
    case 'draft': return 'rounded-full border border-[var(--border-strong)] bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]';
    case 'archived': return 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700';
  }
}
