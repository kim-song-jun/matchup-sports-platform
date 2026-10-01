import { formatCardTime } from '@/lib/date-utils';
import { DAY_MS, toKstDateString } from '@/lib/kst-calendar';
import { teamMatchApplicationStatusLabel } from '@/lib/v1-status-labels';
import type { V1TeamMatchApplication, V1TeamMatchEligibility } from '@/types/api';
import type { TeamMatchDetailViewModel } from './team-matches.types';

/** 신청·처리 시각. 오늘·어제는 날짜 대신 그 말로 적는다(KST 달력 기준). */
export function formatApplicationTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = toKstDateString(at);
  const time = formatCardTime(iso);
  if (day === toKstDateString(now)) return `오늘 ${time}`;
  if (day === toKstDateString(new Date(now.getTime() - DAY_MS))) return `어제 ${time}`;
  const [, month, date] = day.split('-');
  return `${Number(month)}월 ${Number(date)}일 ${time}`;
}

export type ApplicationHistoryItem = NonNullable<TeamMatchDetailViewModel['manageMenu']>['history'][number];

/**
 * ⋯ 메뉴 "신청 기록" — 대기 중(requested)을 뺀 처리된 신청.
 * 승인 트랜잭션이 나머지 대기 신청을 rejected 로 바꾸므로, 승인 시각 이후에 rejected 된 것은 자동 종료다
 * (승인 뒤에는 대기 신청이 남지 않아 호스트가 직접 거절할 수 없다).
 */
export function toApplicationHistory(items: readonly V1TeamMatchApplication[], now: Date = new Date()): ApplicationHistoryItem[] {
  const approvedAt = items.find((item) => item.status === 'approved')?.reviewedAt ?? null;
  return items
    .filter((item) => item.status !== 'requested')
    .map((item) => ({
      key: item.applicationId,
      name: item.applicantTeam.name,
      statusLabel: teamMatchApplicationStatusLabel(item.status, {
        autoClosed:
          item.status === 'rejected'
          && approvedAt !== null
          && item.reviewedAt !== null
          && Date.parse(item.reviewedAt) >= Date.parse(approvedAt),
      }),
      timeLabel: formatApplicationTime(item.reviewedAt ?? item.createdAt, now),
    }));
}

/** '승인 완료 1팀 · 자동 종료 1팀' — 기록이 없으면 null. */
export function summarizeApplicationHistory(history: readonly ApplicationHistoryItem[]): string | null {
  if (history.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of history) counts.set(item.statusLabel, (counts.get(item.statusLabel) ?? 0) + 1);
  return [...counts].map(([label, count]) => `${label} ${count}팀`).join(' · ');
}

/**
 * 서버 edit() 과 같은 판정 — 수정은 모집 중(DB recruiting)이고 시작 전일 때만 열린다.
 * 인자는 `displayState` 가 아니라 `status`(api status) 다: 신청 마감 시각이 지나 화면에 '마감'으로
 * 보이는 매치도 서버는 수정을 받는다.
 */
export function teamMatchEditLockReason(apiStatus: string): string | null {
  if (apiStatus === 'recruiting') return null;
  if (apiStatus === 'closed') return '모집을 마감해서 바꿀 수 없어요. 모집을 다시 열면 바꿀 수 있어요.';
  if (apiStatus === 'matched') return '상대팀이 정해져서 바꿀 수 없어요. 바꿔야 하면 채팅으로 상의해요.';
  if (apiStatus === 'expired') return '경기 시간이 지나서 바꿀 수 없어요.';
  return '끝난 팀매치는 바꿀 수 없어요.';
}

export function teamRoleLabel(role: string): string {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '매니저';
  return '멤버';
}

const LAST_APPLY_TEAM_KEY = 'teameet.v1.lastTeamMatchApplyTeamId';

/** 마지막으로 팀매치를 신청한 팀. 스토리지를 못 읽으면(프라이빗 모드 등) 기억이 없는 것으로 본다. */
export function readLastApplyTeamId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_APPLY_TEAM_KEY);
  } catch {
    return null;
  }
}

export function rememberApplyTeamId(teamId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_APPLY_TEAM_KEY, teamId);
  } catch (error) {
    // 기억은 기본 선택을 돕는 것뿐이라 실패해도 신청은 끝났다 — 다음 시트가 첫 신청 가능 팀을 고른다.
    console.warn('team match apply team not remembered', error);
  }
}

/** 시트의 기본 선택 — 마지막 신청 팀이 지금도 신청 가능하면 그 팀, 아니면 첫 신청 가능 팀. */
export function pickDefaultApplyTeamId(teams: V1TeamMatchEligibility['teams'], lastTeamId: string | null): string | null {
  const eligible = teams.filter((team) => team.eligible);
  return eligible.find((team) => team.teamId === lastTeamId)?.teamId ?? eligible[0]?.teamId ?? null;
}

type NextActionInput = {
  cancelled: boolean;
  /** 모집을 운영하는 호스트(플랫폼 모집이 아닌 팀매치의 홈팀 팀장·매니저). */
  listingHost: boolean;
  /** 서버 api status(`displayState` 아님) — 수정·재개 가능 여부의 근거. */
  apiStatus: string;
  opponentAssigned: boolean;
  /** 진행 중·종료 확인 중처럼 경기 자체의 상태를 말하는 때. */
  matchPhase: boolean;
  completed: boolean;
  manageHref?: string;
  reopen?: () => Promise<unknown>;
  lineupAction?: TeamMatchDetailViewModel['lineupAction'];
  resultAction?: TeamMatchDetailViewModel['resultAction'];
  reviewAction?: TeamMatchDetailViewModel['reviewAction'];
};

/**
 * 하단 바의 "다음 할 일" 하나. 상대가 정해진 뒤에는 경기 단계(명단 → 기록 → 후기)를 따르고,
 * 그 전에는 호스트의 모집 관리(수정·재개)다. 할 일이 없으면 undefined — 신청 CTA 가 그 자리를 쓴다.
 */
export function buildNextAction(input: NextActionInput): TeamMatchDetailViewModel['nextAction'] {
  if (input.cancelled) return undefined;
  if (input.opponentAssigned) {
    const link = (action: { label: string; href: string } | null | undefined, tone: 'primary' | 'neutral' = 'primary') =>
      action ? { label: action.label, href: action.href, tone } : undefined;
    if (input.completed) return link(input.reviewAction) ?? link(input.resultAction);
    if (input.matchPhase) return link(input.resultAction);
    if (input.lineupAction?.kind === 'attendance') return { label: '참석명단 관리', href: input.lineupAction.href, tone: 'primary' };
    // 리그 대진의 경기 명단은 참가 명단에서 계산돼 손대지 않아도 된다(Task 179) — 결과 입구가 먼저다.
    return link(input.resultAction) ?? (input.lineupAction ? { label: '명단 조정', href: input.lineupAction.href, tone: 'neutral' } : undefined);
  }
  if (!input.listingHost) return undefined;
  if (input.apiStatus === 'recruiting' && input.manageHref) return { label: '매치 수정', href: input.manageHref, tone: 'neutral' };
  if (input.apiStatus === 'closed' && input.reopen) return { label: '모집 재개', onClick: input.reopen, tone: 'neutral' };
  return undefined;
}
