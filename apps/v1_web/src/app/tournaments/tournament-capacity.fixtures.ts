import type { V1MyTeam, V1TournamentDetail, V1TournamentRegistration } from '@/types/api';

export type CapacityTournamentFixture = V1TournamentDetail & {
  readonly maxTeams: number | null;
  readonly activeRegistrationCount: number;
};

export function capacityTournament(overrides: Partial<CapacityTournamentFixture> = {}): CapacityTournamentFixture {
  return {
    id: 'tournament-1', sportId: 'sport-futsal', sport: { code: 'futsal', name: '풋살' },
    title: '팀 정원 검증 리그', kind: 'regular_league', status: 'open', format: 'group_knockout',
    maxTeams: null, teamCount: 99, activeRegistrationCount: 999,
    confirmedCount: 1, pendingPaymentCount: 1,
    minPlayers: 1, maxPlayers: 2,
    registrationDeadlineAt: '2099-08-10T14:59:00.000Z', rosterDeadlineAt: null,
    bracketPublishedAt: null, bracketPublishScheduledAt: null,
    scheduledAt: null, scheduledEndAt: null, venue: null, latitude: null, longitude: null,
    coverImageUrl: null, genderCategory: null,
    genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null,
    entryFee: 20000, entryFeeConfigured: true, prizePool: null, prizeSummary: null, prizeBreakdown: null,
    promoHomeEnabled: false, promoHomeTitle: null, promoHomeSubtitle: null, promoHomeImageUrl: null,
    promoHomeBadgeText: null, promoHomeDateText: null, promoHomeTeamsText: null,
    promoHomeLocationText: null, promoHomePrizeText: null, promoHomePriority: 0,
    promoListEnabled: false, promoListTitle: null, promoListSubtitle: null, promoListImageUrl: null,
    promoListBadgeText: null, promoListDateText: null, promoListTeamsText: null,
    promoListLocationText: null, promoListPrizeText: null, promoListPriority: 0,
    campaignSlug: null, rulesText: null, yellowAccumulationLimit: null, redCardSuspensionMatches: null,
    refundPolicyText: null, participantTeams: [], groups: [], fixtures: [], leagueFixtures: [],
    announcements: [], sponsors: [], reviews: [], reviewsTotalCount: 0, awards: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export const capacityTeam: V1MyTeam = {
  teamId: 'team-1', membershipId: 'membership-1', name: '성수 풋살 크루', role: 'owner', status: 'active',
  logoUrl: null, sport: { sportId: 'sport-futsal', name: '풋살' },
  region: { regionId: 'region-seoul', name: '서울', parentName: null }, memberCount: 12,
  canManage: true, canCreateTeamMatch: true, detailRoute: '/teams/team-1', manageRoute: '/teams/team-1/members',
};

export const capacityCancelledRegistration: V1TournamentRegistration = {
  id: 'registration-1', tournamentId: 'tournament-1', teamId: 'team-1', teamName: capacityTeam.name,
  appliedByUserId: 'user-1', status: 'cancelled', depositorName: null,
  agreedRules: false, agreedPrivacy: false, agreedRefund: false, agreedMediaConsent: false,
  confirmedAt: null, rosterLockedAt: null, rosterDeadlineOverrideAt: null,
  cancelRequestedAt: null, cancelReason: null, adminCancelReason: null, cancelOutcome: null,
  playerCount: 0, payment: null, paymentInstructions: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
