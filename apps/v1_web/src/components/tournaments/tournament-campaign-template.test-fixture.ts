import type { V1PublicTournamentStatus } from '@/types/api';
import type { V1PublicTournamentCampaign } from '@/types/tournament-campaign';

const DAY_MS = 24 * 60 * 60 * 1000;

// 대회 일정을 절대 날짜로 박아두면 그 시각이 지나는 순간 'open' 픽스처가 마감 상태로
// 렌더돼 관련 테스트가 통째로 깨진다. 실제로 마감일이 2026-08-08T00:00Z 로 고정돼 있어
// 그날 dev CI 가 아무 코드 변경 없이 red 로 돌아섰다.
// 실행 시각 기준 상대값으로 잡아 'open' 이 언제 돌려도 실제로 열려 있게 한다.
// 마감 전환 자체를 검증하는 테스트는 자기 deadline 을 명시적으로 덮어쓴다.
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

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
      scheduledAt: daysFromNow(14),
      scheduledEndAt: daysFromNow(15),
      registrationDeadlineAt: daysFromNow(7),
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
