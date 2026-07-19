import type { V1PublicTournamentStatus } from '@/types/api';
import type { V1PublicTournamentCampaign } from '@/types/tournament-campaign';

export function campaign(status: V1PublicTournamentStatus): V1PublicTournamentCampaign {
  return {
    id: 'campaign-1',
    slug: 'summer-futsal-cup',
    status: 'published',
    content: {
      version: 1,
      hero: {
        title: 'Teameet Summer Futsal Cup',
        summary: '도심에서 펼쳐지는 하루 완결형 풋살 대회',
        imageUrl: 'https://images.example.com/campaign.webp',
      },
      intro: {
        title: '함께 만드는 여름의 결승전',
        body: '예선부터 결승까지 한곳에서 이어지는 대회예요.',
      },
      highlightsSectionTitle: '대회 하이라이트',
      highlights: [{
        title: '하루 완결 운영',
        body: '경기와 시상식을 하루 안에 진행해요.',
        imageUrl: 'https://images.example.com/highlight.webp',
      }],
      faqSectionTitle: '참가 전 확인해 주세요',
      faq: [{
        question: '선수 명단은 언제까지 제출하나요?',
        answer: '신청 마감일까지 제출해 주세요.',
      }],
    },
    publishedAt: '2026-07-14T01:00:00.000Z',
    updatedAt: '2026-07-14T01:00:00.000Z',
    tournament: {
      id: 'tournament-1',
      title: 'Teameet Summer Futsal Cup',
      status,
      format: 'group_knockout',
      sport: { code: 'futsal', name: '풋살' },
      scheduledAt: '2026-08-15T00:00:00.000Z',
      scheduledEndAt: '2026-08-16T00:00:00.000Z',
      registrationDeadlineAt: '2026-08-08T00:00:00.000Z',
      venue: '데일리그라운드 청라국제도시점',
      coverImageUrl: null,
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
      registrationAvailability: status === 'open' ? 'available' : 'closed',
      participantTeams: [],
    },
  };
}
