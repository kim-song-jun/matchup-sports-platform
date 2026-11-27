import type { V1Tournament } from '@/types/api';
import { isBracketPublished } from '@/lib/bracket-visibility';
import { infoNeedHref, tournamentInfoNeeds, type InfoNeedKey, type InfoNeedTier } from './info-sections';

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

function hoursOrMinutes(ms: number): string {
  return ms < 60 * 60 * 1000 ? `${Math.ceil(ms / 60_000)}분` : `${Math.floor(ms / 3_600_000)}시간`;
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
        headline: '접수 중이에요. 신청 마감 시각이 아직 없어요.',
        daysLeft: null,
        overdue: false,
      };
    }
    // 접수 마감은 시각이 중요하다 — 날짜로만 세면 자정 마감 45분 전에도 "1일 남았어요"가 되고(2026-10 알파 실측),
    // 오늘 오전에 지난 마감은 "오늘 마감돼요"로 보인다. 24시간 안쪽은 시각으로 센다.
    const msLeft = Date.parse(tournament.registrationDeadlineAt!) - now.getTime();
    if (left < 0 || msLeft <= 0) {
      return {
        phase: 'recruiting',
        headline: '신청 마감 시각이 지났는데 아직 접수 중이에요.',
        daysLeft: left,
        overdue: true,
      };
    }
    return {
      phase: 'recruiting',
      headline: `신청 마감까지 ${msLeft < DAY_MS ? hoursOrMinutes(msLeft) : `${left}일`} 남았어요.`,
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

export interface TournamentSetupItem {
  key: InfoNeedKey | 'bracket' | 'announcements';
  tier: InfoNeedTier;
  label: string;
  detail: string;
  /** info 항목은 `?edit=` 딥링크, 그 밖은 탭 경로. */
  href: string;
  /** 「필요」 첫 항목의 주 버튼 글자이자 그 밖 항목의 이동 글자. */
  actionLabel: string;
}

const SETUP_ACTION_LABEL: Record<TournamentSetupItem['key'], string> = {
  venue: '장소 정하기',
  'roster-deadline': '마감 정하기',
  'registration-deadline': '마감 정하기',
  'bank-account': '계좌 입력하기',
  'scheduled-at': '일정 정하기',
  entry: '대회 정보',
  rules: '대회 정보',
  'public-screen': '대회 정보',
  'stage-plan': '대진',
  bracket: '대진',
  announcements: '공지',
};

const TIER_ORDER: Record<InfoNeedTier, number> = { required: 0, review: 1, optional: 2 };

/**
 * 개요의 「채워야 할 설정」. 판정·문구·단계는 `tournamentInfoNeeds` 가 정하고, 여기서는 다른 탭에서
 * 고치는 대진·공지 두 항목만 덧붙인다. 필요 → 기본값 확인 → 선택 순이며 끝난 대회는 비어 있다.
 */
export function buildTournamentSetupItems(
  tournament: V1Tournament,
  now: Date,
  basePath: string,
): TournamentSetupItem[] {
  if (tournament.status === 'completed' || tournament.status === 'cancelled') return [];

  const items: TournamentSetupItem[] = tournamentInfoNeeds(tournament, basePath).map((need) => ({
    key: need.key,
    tier: need.tier,
    label: need.label,
    detail: need.detail,
    href: infoNeedHref(need, tournament.id, basePath),
    actionLabel: SETUP_ACTION_LABEL[need.key],
  }));

  const fixtures = tournament.operationCounts?.fixtures ?? 0;
  const announcements = tournament.operationCounts?.announcements ?? 0;

  if (fixtures === 0) {
    items.push({
      key: 'bracket',
      tier: 'optional',
      label: '대진',
      detail: '대진 관리에서 조를 만들고 경기를 편성해요.',
      href: `${basePath}/bracket`,
      actionLabel: SETUP_ACTION_LABEL.bracket,
    });
  } else if (!isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt, now)) {
    items.push({
      key: 'bracket',
      tier: 'optional',
      label: '대진표 공개',
      detail: '공개 전에는 참가자에게 조와 경기가 보이지 않아요.',
      href: `${basePath}/bracket`,
      actionLabel: SETUP_ACTION_LABEL.bracket,
    });
  }
  if (announcements === 0) {
    items.push({
      key: 'announcements',
      tier: 'optional',
      label: '공지',
      detail: '집합 시간·준비물 같은 안내를 공지로 남겨요.',
      href: `${basePath}/announcements`,
      actionLabel: SETUP_ACTION_LABEL.announcements,
    });
  }

  // Array.prototype.sort 는 안정 정렬이라 같은 단계 안의 선언 순서가 유지된다.
  return items.sort((left, right) => TIER_ORDER[left.tier] - TIER_ORDER[right.tier]);
}

export function requiredSetupLabels(items: readonly TournamentSetupItem[]): string[] {
  return items.filter((item) => item.tier === 'required').map((item) => item.label);
}
