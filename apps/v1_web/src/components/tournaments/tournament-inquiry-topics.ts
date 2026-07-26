import type { V1InquiryCategory } from '@/types/api';

export type TournamentInquiryTopic = 'participation' | 'schedule' | 'payment_refund' | 'rules' | 'other';

type InquiryTopicOption = {
  readonly value: TournamentInquiryTopic;
  readonly label: string;
  readonly description: string;
  readonly titlePrefix: string;
  readonly apiCategory: V1InquiryCategory;
};

export const TOURNAMENT_INQUIRY_TOPICS = [
  {
    value: 'participation',
    label: '참가·신청',
    description: '참가 자격, 신청 상태, 선수 명단',
    titlePrefix: '[참가·신청]',
    apiCategory: 'tournament',
  },
  {
    value: 'schedule',
    label: '일정·경기 운영',
    description: '경기 시간, 장소, 진행 방식',
    titlePrefix: '[일정·운영]',
    apiCategory: 'tournament',
  },
  {
    value: 'payment_refund',
    label: '결제·환불',
    description: '참가비 결제, 취소, 환불 규정',
    titlePrefix: '[결제·환불]',
    apiCategory: 'payment_refund',
  },
  {
    value: 'rules',
    label: '대회 규정',
    description: '규칙, 준비물, 참가자 유의사항',
    titlePrefix: '[대회 규정]',
    apiCategory: 'tournament',
  },
  {
    value: 'other',
    label: '기타',
    description: '위 유형에 해당하지 않는 문의',
    titlePrefix: '[기타]',
    apiCategory: 'other',
  },
] as const satisfies readonly InquiryTopicOption[];

export function findTournamentInquiryTopic(value: string) {
  return TOURNAMENT_INQUIRY_TOPICS.find((option) => option.value === value);
}
