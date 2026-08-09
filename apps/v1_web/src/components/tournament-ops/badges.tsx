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
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
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
const WARNING_META: Record<V1TournamentOperationsWarningCode, { label: string; tone: Tone; icon: ReactNode }> = {
  NO_FIELD_ASSIGNED: { label: '필드 미배정', tone: 'amber', icon: <AlertTriangle size={12} aria-hidden="true" /> },
  MISSING_SCORER: { label: '기록자 없음', tone: 'amber', icon: <AlertTriangle size={12} aria-hidden="true" /> },
  RESULT_REVIEW_OVERDUE: { label: '결과 검토 지연', tone: 'red', icon: <ShieldAlert size={12} aria-hidden="true" /> },
  NO_STAFF_ASSIGNED: { label: '담당자 미배정', tone: 'amber', icon: <UserX size={12} aria-hidden="true" /> },
  LINEUP_NOT_SUBMITTED: { label: '라인업 미제출', tone: 'red', icon: <Clock size={12} aria-hidden="true" /> },
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
