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
    /**
     * **캠페인 응답에는 명단이 없다.** BE 캠페인 직렬화는 팀 식별 정보와 상태까지만 내고
     * `players` 를 보내지 않는다 — 캠페인은 명단을 보여주는 화면이 아니다. 그래서
     * `V1TournamentParticipantTeam` 을 그대로 쓰면 **타입이 거짓말을 한다**: 누가 캠페인
     * 화면에 명단 컴포넌트를 재사용하면 TS 는 통과시키고 런타임에 `players.length` 가
     * `undefined.length` 로 터진다. 없는 것을 없다고 적는다.
     *
     * (반대로 응답에 `players: []` 를 싣는 방향은 **안 쓰는 필드를 응답에 싣는 것**이라
     * 공개 명단을 조건부로 바꾼 이유와 정면으로 어긋난다.)
     */
    participantTeams: Omit<V1TournamentParticipantTeam, 'players'>[];
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
