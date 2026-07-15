import type {
  V1PublicTournamentStatus,
  V1TournamentFormat,
  V1TournamentParticipantTeam,
  V1TournamentSponsor,
} from './api';

export type V1TournamentCampaignStatus = 'draft' | 'published' | 'archived';
export type V1TournamentRegistrationAvailability =
  | 'available'
  | 'deadline_passed'
  | 'full'
  | 'started'
  | 'closed';

export type V1TournamentCampaignListItem = {
  id: string;
  slug: string;
  heroTitle: string;
  heroSummary: string | null;
  heroImageUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  tournament: {
    id: string;
    title: string;
    status: V1PublicTournamentStatus;
    sport: { code: string; name: string };
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    registrationDeadlineAt: string | null;
    venue: string | null;
    coverImageUrl: string | null;
    teamCount: number;
    entryFee: number;
    prizePool: number | null;
    prizeSummary: string | null;
    confirmedCount: number;
    pendingPaymentCount: number;
    registrationAvailability: V1TournamentRegistrationAvailability;
  };
};

export type V1TournamentCampaignList = {
  items: V1TournamentCampaignListItem[];
  nextCursor: string | null;
};

export type V1TournamentCampaignContent = {
  version: 1;
  hero: {
    title: string;
    summary?: string;
    imageUrl?: string;
  };
  intro: {
    title: string;
    body: string;
  };
  highlightsSectionTitle: string;
  highlights: Array<{
    title: string;
    body: string;
    imageUrl?: string;
  }>;
  faqSectionTitle: string;
  faq: Array<{
    question: string;
    answer: string;
  }>;
};

export type V1TournamentCampaign = {
  id: string;
  tournamentId: string;
  slug: string;
  status: V1TournamentCampaignStatus;
  content: V1TournamentCampaignContent;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V1AdminTournamentCampaignPreview = Omit<
  V1TournamentCampaign,
  'tournamentId' | 'archivedAt' | 'createdAt'
> & {
  tournament: {
    id: string;
    title: string;
    status: V1PublicTournamentStatus;
    format: V1TournamentFormat;
    sport: { code: string; name: string };
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    registrationDeadlineAt: string | null;
    venue: string | null;
    coverImageUrl: string | null;
    teamCount: number;
    minPlayers: number;
    maxPlayers: number;
    entryFee: number;
    rulesText: string | null;
    refundPolicyText: string | null;
    prizePool: number | null;
    prizeSummary: string | null;
    prizeBreakdown: string | null;
    sponsors: V1TournamentSponsor[];
    confirmedCount: number;
    pendingPaymentCount: number;
    registrationAvailability: V1TournamentRegistrationAvailability;
    participantTeams: V1TournamentParticipantTeam[];
  };
};

export type V1PublicTournamentCampaign = Omit<
  V1AdminTournamentCampaignPreview,
  'status'
> & {
  status: 'published';
};

export type V1CreateTournamentCampaignPayload = {
  slug: string;
  content: V1TournamentCampaignContent;
};

export type V1UpdateTournamentCampaignPayload = Partial<V1CreateTournamentCampaignPayload>;

export type V1ChangeTournamentCampaignStatusPayload = {
  status: V1TournamentCampaignStatus;
  reason: string;
};

export type V1TournamentCampaignStatusChangeResult =
  | V1TournamentCampaign
  | {
      tournamentId: string;
      previousStatus: V1TournamentCampaignStatus;
      status: V1TournamentCampaignStatus;
      alreadyInStatus: true;
    };
