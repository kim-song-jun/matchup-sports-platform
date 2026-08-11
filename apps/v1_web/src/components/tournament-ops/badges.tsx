import {
  CircleDot,
  PauseCircle,
  CheckCircle2,
  XCircle,
  CalendarClock,
  AlertTriangle,
  Clock,
  UserX,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  V1GameState,
  V1TournamentOperationsWarningCode,
  V1TournamentStaffRole,
} from '@/types/api';

// ── 경기 상태 배지 ─────────────────────────────────────────────────────────
// 색만으로 상태를 구분하지 않는다 — 아이콘 + 텍스트를 항상 함께 노출한다.
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

const TONE_CLASSES: Record<Tone, string> = {
  blue: 'bg-[var(--blue50)] text-[var(--blue700)]',
  // --green700 토큰 없음 — text-green-700는 원래 값 유지, 배경만 토큰화 (전역 규칙 확인 완료)
  green: 'bg-[var(--green50)] text-green-700 dark:text-green-300',
  amber: 'bg-[var(--tint-orange)] text-[var(--orange700)]',
  red: 'bg-[var(--red50)] text-[var(--red700)]',
  gray: 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
};

function Pill({ tone, icon, label }: { tone: Tone; icon: ReactNode; label: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
      ].join(' ')}
    >
      {icon}
      {label}
    </span>
  );
}

const GAME_STATE_META: Record<V1GameState, { label: string; tone: Tone; icon: ReactNode }> = {
  SCHEDULED: { label: '예정', tone: 'gray', icon: <CalendarClock size={12} aria-hidden="true" /> },
  LIVE: { label: '진행 중', tone: 'green', icon: <CircleDot size={12} aria-hidden="true" /> },
  PAUSED: { label: '일시중지', tone: 'amber', icon: <PauseCircle size={12} aria-hidden="true" /> },
  ENDED: { label: '종료', tone: 'blue', icon: <CheckCircle2 size={12} aria-hidden="true" /> },
  CANCELLED: { label: '취소됨', tone: 'red', icon: <XCircle size={12} aria-hidden="true" /> },
};

export function GameStateBadge({ state }: { state: V1GameState | null }) {
  if (state === null) {
    return <Pill tone="gray" icon={<Clock size={12} aria-hidden="true" />} label="경기 미생성" />;
  }
  const meta = GAME_STATE_META[state];
  return <Pill tone={meta.tone} icon={meta.icon} label={meta.label} />;
}

// ── 운영 보드 경고 배지 ────────────────────────────────────────────────────
/* 경고 코드 → 한글 라벨의 단일 출처. 결과 검토·정정 화면(fixture-picker-list)도 이걸 쓴다.
 * MISSING_SCORER 는 서버에서 "골에 득점자가 지정되지 않음"(V1GameResultRevision.missingScorer)을
 * 뜻한다 — 예전 라벨 '기록자 없음'은 기록 담당 스태프가 없다는 뜻으로 읽혀서, 운영자가
 * 존재하지도 않는 '기록자' 역할을 배정하려 헤매고 정작 득점자 누락은 방치됐다. */
export const WARNING_LABELS: Record<V1TournamentOperationsWarningCode, string> = {
  NO_FIELD_ASSIGNED: '경기장 미배정',
  MISSING_SCORER: '득점자 미기재',
  RESULT_REVIEW_OVERDUE: '검토 기한 초과',
  NO_STAFF_ASSIGNED: '담당자 미배정',
  LINEUP_NOT_SUBMITTED: '라인업 미제출',
};

const WARNING_META: Record<V1TournamentOperationsWarningCode, { label: string; tone: Tone; icon: ReactNode }> = {
  NO_FIELD_ASSIGNED: { label: WARNING_LABELS.NO_FIELD_ASSIGNED, tone: 'amber', icon: <AlertTriangle size={12} aria-hidden="true" /> },
  MISSING_SCORER: { label: WARNING_LABELS.MISSING_SCORER, tone: 'amber', icon: <AlertTriangle size={12} aria-hidden="true" /> },
  RESULT_REVIEW_OVERDUE: { label: WARNING_LABELS.RESULT_REVIEW_OVERDUE, tone: 'red', icon: <ShieldAlert size={12} aria-hidden="true" /> },
  NO_STAFF_ASSIGNED: { label: WARNING_LABELS.NO_STAFF_ASSIGNED, tone: 'amber', icon: <UserX size={12} aria-hidden="true" /> },
  LINEUP_NOT_SUBMITTED: { label: WARNING_LABELS.LINEUP_NOT_SUBMITTED, tone: 'red', icon: <Clock size={12} aria-hidden="true" /> },
};

export function WarningBadge({ code }: { code: V1TournamentOperationsWarningCode }) {
  const meta = WARNING_META[code];
  return <Pill tone={meta.tone} icon={meta.icon} label={meta.label} />;
}

// ── 스태프 역할 라벨 ───────────────────────────────────────────────────────
export const STAFF_ROLE_LABELS: Record<V1TournamentStaffRole, string> = {
  PLATFORM_OPS: '플랫폼 운영자',
  TOURNAMENT_DIRECTOR: '대회 디렉터',
  FIELD_OPERATOR: '필드 담당자',
  SUPPORT_READONLY: '지원(조회 전용)',
};

export function staffRoleLabel(role: V1TournamentStaffRole): string {
  return STAFF_ROLE_LABELS[role] ?? role;
}
