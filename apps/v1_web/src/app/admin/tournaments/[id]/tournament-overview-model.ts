import type { V1Tournament } from '@/types/api';
import { isBracketPublished } from '@/lib/bracket-visibility';

/**
 * 대회 '개요' 섹션의 판정 로직 — 화면과 분리해 둔다. 여기 규칙이 곧 운영자가 보는
 * "지금 뭘 해야 하는가"라서, 문구가 아니라 조건이 계약이다.
 */

export type TournamentPhase = 'draft' | 'recruiting' | 'closed' | 'running' | 'finished';

export interface TournamentNextMilestone {
  phase: TournamentPhase;
  /** 지금 무엇을 기다리는 상태인지 한 줄. */
  headline: string;
  /** 남은 일수. 기준 시각이 없거나 이미 지났으면 null. */
  daysLeft: number | null;
  /** 마감이 이미 지났는데 상태가 따라오지 않은 경우 — 운영자 개입이 필요하다. */
  overdue: boolean;
}

export interface TournamentOverviewCheck {
  id: string;
  label: string;
  hint: string;
  /** 고칠 수 있는 화면. 셸 안에서 이동할 섹션 slug. */
  section?: 'info' | 'bracket' | 'announcements' | 'registrations';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 한국 시간 기준 달력 날짜(YYYY-MM-DD). 실행 환경의 로컬 타임존을 쓰면 같은 코드가
 * 브라우저(KST)와 CI(UTC)에서 다른 날을 가리킨다 — 국내 대회 운영 화면이므로 KST 로 고정한다.
 */
const SEOUL_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function seoulDayStart(date: Date): number {
  const [year, month, day] = SEOUL_DATE_FORMAT.format(date).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** 오늘(KST) 자정 기준으로 남은 일수 — "D-1"이 시/분 때문에 0으로 보이지 않게 날짜 단위로 센다. */
export function daysUntil(target: string | null | undefined, now: Date): number | null {
  if (!target) return null;
  const at = new Date(target);
  if (!Number.isFinite(at.getTime())) return null;
  return Math.round((seoulDayStart(at) - seoulDayStart(now)) / DAY_MS);
}

export function resolveNextMilestone(tournament: V1Tournament, now: Date): TournamentNextMilestone {
  const { status } = tournament;
  if (status === 'completed' || status === 'cancelled') {
    return {
      phase: 'finished',
      headline: status === 'completed' ? '종료된 대회예요.' : '취소된 대회예요.',
      daysLeft: null,
      overdue: false,
    };
  }
  if (status === 'draft') {
    return {
      phase: 'draft',
      headline: '아직 초안이라 사용자에게 보이지 않아요.',
      daysLeft: null,
      overdue: false,
    };
  }
  if (status === 'in_progress') {
    return { phase: 'running', headline: '경기가 진행 중이에요.', daysLeft: null, overdue: false };
  }
  if (status === 'open') {
    const left = daysUntil(tournament.registrationDeadlineAt, now);
    if (left === null) {
      return {
        phase: 'recruiting',
        headline: '접수 중이에요. 접수 마감 시각이 아직 없어요.',
        daysLeft: null,
        overdue: false,
      };
    }
    if (left < 0) {
      return {
        phase: 'recruiting',
        headline: '접수 마감 시각이 지났는데 아직 접수 중이에요.',
        daysLeft: left,
        overdue: true,
      };
    }
    return {
      phase: 'recruiting',
      headline: left === 0 ? '오늘 접수가 마감돼요.' : `접수 마감까지 ${left}일 남았어요.`,
      daysLeft: left,
      overdue: false,
    };
  }
  // closed — 접수는 끝났고 경기일을 기다린다.
  const left = daysUntil(tournament.scheduledAt, now);
  if (left === null) {
    return {
      phase: 'closed',
      headline: '접수가 마감됐어요. 경기 일정이 아직 없어요.',
      daysLeft: null,
      overdue: false,
    };
  }
  if (left < 0) {
    return {
      phase: 'closed',
      headline: '경기일이 지났는데 아직 마감 상태예요.',
      daysLeft: left,
      overdue: true,
    };
  }
  return {
    phase: 'closed',
    headline: left === 0 ? '오늘이 경기일이에요.' : `경기일까지 ${left}일 남았어요.`,
    daysLeft: left,
    overdue: false,
  };
}

function hasPrizeInfo(tournament: V1Tournament) {
  return Boolean(
    (tournament.prizePool ?? 0) > 0 ||
      tournament.prizeSummary?.trim() ||
      tournament.prizeBreakdown?.trim(),
  );
}

/**
 * 아직 안 된 것만 돌려준다 — 빈 배열이면 지금 손볼 게 없다는 뜻이다.
 * 끝난 대회(완료·취소)는 고칠 수 있는 게 없으므로 아무것도 내지 않는다.
 */
export function buildTournamentChecklist(
  tournament: V1Tournament,
  now: Date,
): TournamentOverviewCheck[] {
  if (tournament.status === 'completed' || tournament.status === 'cancelled') return [];

  const checks: TournamentOverviewCheck[] = [];
  const fixtures = tournament.operationCounts?.fixtures ?? 0;
  const announcements = tournament.operationCounts?.announcements ?? 0;

  if (!tournament.registrationDeadlineAt) {
    checks.push({
      id: 'registration-deadline',
      label: '접수 마감 시각이 없어요',
      hint: '마감이 없으면 신청이 언제까지 열려 있는지 참가자가 알 수 없어요.',
      section: 'info',
    });
  }
  if (!tournament.rosterDeadlineAt) {
    checks.push({
      id: 'roster-deadline',
      label: '명단 마감 시각이 없어요',
      hint: '명단 마감이 없으면 경기 직전까지 선수단이 바뀔 수 있어요.',
      section: 'info',
    });
  }
  if (tournament.entryFee > 0 && !tournament.bankAccount?.trim()) {
    checks.push({
      id: 'bank-account',
      label: '참가비를 받는데 입금 계좌가 없어요',
      hint: '입금 안내가 비어 있으면 신청 팀이 참가비를 보낼 곳을 알 수 없어요.',
      section: 'info',
    });
  }
  if (!tournament.scheduledAt) {
    checks.push({
      id: 'scheduled-at',
      label: '경기 일정이 없어요',
      hint: '대회 날짜가 없으면 목록·상세 어디에도 일정이 표시되지 않아요.',
      section: 'info',
    });
  }
  if (fixtures === 0) {
    checks.push({
      id: 'no-fixtures',
      label: '경기가 아직 없어요',
      hint: '대진 관리에서 조를 만들고 경기를 편성해요.',
      section: 'bracket',
    });
  } else if (!isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt, now)) {
    checks.push({
      id: 'bracket-unpublished',
      label: '대진표가 아직 공개되지 않았어요',
      hint: '공개 전에는 참가자에게 조·경기가 보이지 않아요.',
      section: 'bracket',
    });
  }
  if (!tournament.coverImageUrl) {
    checks.push({
      id: 'cover-image',
      label: '커버 이미지가 없어요',
      hint: '목록과 상세 상단이 비어 보여요.',
      section: 'info',
    });
  }
  if (!hasPrizeInfo(tournament)) {
    checks.push({
      id: 'prize',
      label: '상금·시상 정보가 없어요',
      hint: '참가 결정에 큰 영향을 주는 정보예요.',
      section: 'info',
    });
  }
  if (announcements === 0) {
    checks.push({
      id: 'no-announcements',
      label: '공지가 아직 없어요',
      hint: '집합 시간·준비물 같은 안내를 공지로 남겨요.',
      section: 'announcements',
    });
  }
  return checks;
}
