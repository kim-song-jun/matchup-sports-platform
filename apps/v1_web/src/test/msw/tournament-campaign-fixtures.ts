import type {
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
  V1TournamentCampaign,
  V1TournamentCampaignContent,
  V1TournamentCampaignListItem,
  V1TournamentCampaignStatus,
} from '@/types/tournament-campaign';

const PUBLISHED_AT = '2026-07-14T01:00:00.000Z';
const ARCHIVED_AT = '2026-07-14T02:00:00.000Z';

const tournament: V1AdminTournamentCampaignPreview['tournament'] = {
  id: 'tournament-1',
  title: 'Teameet Futsal Cup',
  status: 'open',
  format: 'group_knockout',
  sport: { code: 'futsal', name: '풋살' },
  scheduledAt: '2026-08-15T00:00:00.000Z',
  scheduledEndAt: '2026-08-16T00:00:00.000Z',
  registrationDeadlineAt: '2026-08-08T00:00:00.000Z',
  venue: '데일리그라운드 청라국제도시점',
  coverImageUrl: '/uploads/tournaments/campaign.jpg',
  teamCount: 8,
  minPlayers: 6,
  maxPlayers: 10,
  entryFee: 300000,
  rulesText: '대회 규정을 준수해 주세요.',
  refundPolicyText: '마감 전 취소는 전액 환불돼요.',
  prizePool: 4000000,
  prizeSummary: '총 400만원 상당 상금 및 상품',
  prizeBreakdown: null,
  sponsors: [],
  confirmedCount: 4,
  pendingPaymentCount: 0,
  registrationAvailability: 'available',
  participantTeams: [],
};

function createContent(): V1TournamentCampaignContent {
  return {
    version: 1,
    hero: {
      title: 'Teameet Futsal Cup',
      summary: '도심에서 펼쳐지는 하루 완결형 풋살 대회',
      imageUrl: '/uploads/tournaments/campaign.jpg',
    },
    intro: {
      title: '대회 소개',
      body: '경기 정보는 실제 대회 데이터와 연결되고, 캠페인 설명만 별도로 편집돼요.',
    },
    highlightsSectionTitle: '대회 하이라이트',
    highlights: [],
    faqSectionTitle: '자주 묻는 질문',
    faq: [],
  };
}

export function createV1TournamentCampaignFixture(
  status: V1TournamentCampaignStatus = 'published',
): V1TournamentCampaign {
  return {
    id: 'campaign-1',
    tournamentId: tournament.id,
    slug: 'teameet-futsal-cup',
    status,
    content: createContent(),
    publishedAt: status === 'draft' ? null : PUBLISHED_AT,
    archivedAt: status === 'archived' ? ARCHIVED_AT : null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: status === 'draft' ? '2026-07-14T00:00:00.000Z' : PUBLISHED_AT,
  };
}

export function createV1AdminTournamentCampaignPreviewFixture(
  campaign: V1TournamentCampaign,
): V1AdminTournamentCampaignPreview {
  return {
    id: campaign.id,
    slug: campaign.slug,
    status: campaign.status,
    content: campaign.content,
    publishedAt: campaign.publishedAt,
    updatedAt: campaign.updatedAt,
    tournament,
  };
}

export function createV1PublicTournamentCampaignFixture(
  campaign: V1TournamentCampaign,
): V1PublicTournamentCampaign | null {
  if (campaign.status !== 'published') return null;
  return {
    id: campaign.id,
    slug: campaign.slug,
    status: 'published',
    content: campaign.content,
    publishedAt: campaign.publishedAt,
    updatedAt: campaign.updatedAt,
    tournament,
  };
}

export function createV1TournamentCampaignListItemFixture(
  campaign: V1TournamentCampaign,
): V1TournamentCampaignListItem | null {
  if (campaign.status !== 'published') return null;
  return {
    id: campaign.id,
    slug: campaign.slug,
    heroTitle: campaign.content.hero.title,
    heroSummary: campaign.content.hero.summary ?? null,
    heroImageUrl: campaign.content.hero.imageUrl ?? null,
    publishedAt: campaign.publishedAt ?? new Date().toISOString(),
    updatedAt: campaign.updatedAt,
    tournament: {
      id: tournament.id,
      title: tournament.title,
      status: tournament.status,
      sport: tournament.sport,
      scheduledAt: tournament.scheduledAt,
      scheduledEndAt: tournament.scheduledEndAt,
      registrationDeadlineAt: tournament.registrationDeadlineAt,
      venue: tournament.venue,
      coverImageUrl: tournament.coverImageUrl,
      teamCount: tournament.teamCount,
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      prizeSummary: tournament.prizeSummary,
      confirmedCount: tournament.confirmedCount,
      pendingPaymentCount: tournament.pendingPaymentCount,
      registrationAvailability: tournament.registrationAvailability,
    },
  };
}
