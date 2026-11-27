import type { V1Tournament } from '@/types/api';

/** 대회 정보 화면의 수정 섹션 — `?edit=` 값이자 `InfoNeed.section` 의 값이다. */
export const TOURNAMENT_INFO_SECTIONS = ['basic', 'schedule', 'entry', 'rules', 'public', 'promo'] as const;
export type TournamentInfoSectionKey = (typeof TOURNAMENT_INFO_SECTIONS)[number];

const adminBasePath = (tournamentId: string) => `/admin/tournaments/${tournamentId}`;

/** 스태프 면·샘플처럼 `/admin` 이 아닌 곳에서 쓰면 그 대회 경로를 `basePath` 로 넘긴다. */
export function tournamentInfoHref(tournamentId: string, section: TournamentInfoSectionKey, basePath?: string): string {
  return `${basePath ?? adminBasePath(tournamentId)}/info?edit=${section}`;
}

export type InfoNeedTier = 'required' | 'review' | 'optional';

export const INFO_NEED_TIER_LABEL: Record<InfoNeedTier, string> = {
  required: '필요',
  review: '기본값 확인',
  optional: '선택',
};

export type InfoNeedKey =
  | 'venue'
  | 'roster-deadline'
  | 'bank-account'
  | 'registration-deadline'
  | 'scheduled-at'
  | 'entry'
  | 'rules'
  | 'stage-plan'
  | 'public-screen';

export interface InfoNeed {
  readonly key: InfoNeedKey;
  readonly section: TournamentInfoSectionKey;
  readonly tier: InfoNeedTier;
  readonly label: string;
  readonly detail: string;
  /** 정보 섹션이 아닌 다른 탭에서 고치는 항목의 이동 경로 — 있으면 `tournamentInfoHref` 대신 이 값을 쓴다. */
  readonly href?: string;
}

/** 소비처는 `href` 를 직접 읽지 않고 이 함수로 이동 경로를 얻는다. */
export function infoNeedHref(need: InfoNeed, tournamentId: string, basePath?: string): string {
  return need.href ?? tournamentInfoHref(tournamentId, need.section, basePath);
}

function hasPrizeInfo(t: V1Tournament): boolean {
  return Boolean((t.prizePool ?? 0) > 0 || t.prizeSummary?.trim() || t.prizeBreakdown?.trim());
}

function entryDetail(t: V1Tournament): string {
  const players = t.maxPlayers === null ? `${t.minPlayers}명 이상` : `${t.minPlayers}~${t.maxPlayers}명`;
  const fee = t.entryFee > 0 ? `${t.entryFee.toLocaleString('ko-KR')}원` : '무료';
  return `종목 기본값이에요. 팀당 선수 ${players}, 참가비 ${fee}.`;
}

function rulesDetail(t: V1Tournament): string {
  const parts: string[] = [];
  if (t.lineupMaxPlayers != null) parts.push(`출전 ${t.lineupMaxPlayers}명`);
  if (t.substitutionMode === 'rolling') parts.push('자유 교체');
  else if (t.substitutionMode === 'limited') {
    parts.push(t.maxSubstitutions != null ? `교체 ${t.maxSubstitutions}회 제한` : '교체 횟수 제한');
  }
  return parts.length > 0 ? `종목 기본값이에요. ${parts.join(', ')}.` : '종목 기본값이에요.';
}

function publicScreenDetail(t: V1Tournament): string | null {
  const noImage = !t.coverImageUrl;
  const noPrize = !hasPrizeInfo(t);
  if (noImage && noPrize) return '커버 이미지와 상금·시상 안내가 비어 있어요.';
  if (noImage) return '커버 이미지가 없으면 목록과 상세 상단이 비어 보여요.';
  if (noPrize) return '상금과 시상 정보는 참가 결정에 큰 영향을 줘요.';
  return null;
}

/**
 * 지금 채우거나 확인해야 할 설정 — 필요 → 기본값 확인 → 선택 순이고 같은 단계는 아래 선언 순서다.
 * 끝난 대회는 고칠 것이 없어 비어 있다. 기본값 확인은 초안에서만 나온다(공개한 뒤에는 이미 확인한 값이다).
 * 대진·공지 같은 다른 탭의 할 일은 여기에 넣지 않는다.
 */
export function tournamentInfoNeeds(t: V1Tournament, basePath?: string): InfoNeed[] {
  if (t.status === 'completed' || t.status === 'cancelled') return [];

  const required: InfoNeed[] = [];

  if (!t.venue?.trim()) {
    required.push({
      key: 'venue',
      section: 'schedule',
      tier: 'required',
      label: '장소',
      detail: '정하지 않으면 참가자에게 「장소 미정」으로 보여요.',
    });
  }
  if (!t.rosterDeadlineAt) {
    required.push({
      key: 'roster-deadline',
      section: 'schedule',
      tier: 'required',
      label: '명단 제출 마감',
      detail: '마감이 없으면 경기 직전까지 선수단이 바뀔 수 있어요.',
    });
  }
  if (t.entryFee > 0 && !t.bankAccount?.trim()) {
    required.push({
      key: 'bank-account',
      section: 'entry',
      tier: 'required',
      label: '정산 계좌',
      detail: '참가비를 받는데 정산 계좌가 없으면 신청 팀이 입금할 곳을 알 수 없어요.',
    });
  }
  if (!t.registrationDeadlineAt) {
    required.push({
      key: 'registration-deadline',
      section: 'schedule',
      tier: 'required',
      label: '신청 마감',
      detail: '마감이 없으면 신청이 언제까지 열려 있는지 알 수 없어요.',
    });
  }
  if (!t.scheduledAt) {
    required.push({
      key: 'scheduled-at',
      section: 'schedule',
      tier: 'required',
      label: '대회 시작',
      detail: '대회 날짜가 없으면 목록과 상세에 일정이 보이지 않아요.',
    });
  }

  const review: InfoNeed[] = [];
  if (t.status === 'draft') {
    review.push({
      key: 'entry',
      section: 'entry',
      tier: 'review',
      label: '참가 조건',
      detail: entryDetail(t),
    });
    review.push({
      key: 'rules',
      section: 'rules',
      tier: 'review',
      label: '경기 규칙',
      detail: rulesDetail(t),
    });
    if (t.format === 'league_knockouts' && t.stagePlan) {
      review.push({
        key: 'stage-plan',
        section: 'basic',
        tier: 'review',
        label: '단계 구성',
        detail: '예선과 결선 구성을 기본값으로 만들어 뒀어요. 대진 관리에서 확인해 주세요.',
        href: `${basePath ?? adminBasePath(t.id)}/bracket`,
      });
    }
  }

  const optional: InfoNeed[] = [];
  const publicDetail = publicScreenDetail(t);
  if (publicDetail) {
    optional.push({
      key: 'public-screen',
      section: 'public',
      tier: 'optional',
      label: '공개 화면',
      detail: publicDetail,
    });
  }

  return [...required, ...review, ...optional];
}
