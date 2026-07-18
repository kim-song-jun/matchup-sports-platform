import type { V1PublicTournamentStatus } from '@/types/api';
import type { V1TournamentRegistrationAvailability } from '@/types/tournament-campaign';

type CampaignAction = {
  readonly label: string;
  readonly href: string;
};

type CampaignActions = {
  readonly primary: CampaignAction | null;
  readonly secondary: CampaignAction;
};

export function getCampaignActions(
  status: V1PublicTournamentStatus,
  registrationAvailability: V1TournamentRegistrationAvailability,
  tournamentId: string,
): CampaignActions {
  const secondary = { label: '대회 상세 보기', href: `/tournaments/${tournamentId}` };

  switch (status) {
    case 'open':
      return registrationAvailability === 'available'
        ? { primary: { label: '참가 신청하기', href: `/tournaments/${tournamentId}/my` }, secondary }
        : { primary: null, secondary };
    case 'closed':
      return { primary: null, secondary };
    case 'in_progress':
      return { primary: { label: '대진표 보기', href: `/tournaments/${tournamentId}/bracket` }, secondary };
    case 'completed':
      return { primary: { label: '결과 보기', href: `/tournaments/${tournamentId}/results` }, secondary };
  }
}

export function getCampaignActionHeading(
  status: V1PublicTournamentStatus,
  registrationAvailability: V1TournamentRegistrationAvailability,
): string {
  switch (status) {
    case 'open': {
      switch (registrationAvailability) {
        case 'available': return '함께 뛸 팀을 기다리고 있어요';
        case 'deadline_passed': return '접수 기간이 종료됐어요';
        case 'full': return '참가 정원이 모두 찼어요';
        case 'started': return '이미 시작된 대회예요';
        case 'closed': return '현재 참가 신청을 받지 않아요';
      }
    }
    case 'closed': return '접수가 마감된 대회예요';
    case 'in_progress': return '지금 펼쳐지는 경기를 확인하세요';
    case 'completed': return '대회의 마지막 기록을 확인하세요';
  }
}

export function formatPrizeSummary(prizeSummary: string | null, prizePool: number | null): string {
  if (prizePool !== null) return `총 ${prizePool.toLocaleString('ko-KR')}원`;
  return prizeSummary ?? '상금 공개 예정';
}

export function formatSponsorSummary(names: string[]): string {
  if (names.length === 0) return '공식 파트너 공개 예정';
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}곳`;
}
