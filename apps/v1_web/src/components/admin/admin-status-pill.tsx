import {
  CheckCircle2,
  CircleDot,
  Clock,
  XCircle,
  Archive,
  Ban,
  AlertCircle,
  UserX,
  FileText,
  Loader2,
} from 'lucide-react';
import type { ReactNode } from 'react';

// ── Tone → classes ────────────────────────────────────────────────────────
type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

const TONE_CLASSES: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
};

// ── Status meta map ───────────────────────────────────────────────────────
export interface StatusMeta {
  label: string;
  tone: Tone;
  icon: ReactNode;
}

/**
 * Single source of truth for all v1 status enums.
 * Covers: account, match, team, teamMatch status values.
 * Icon + label ensures info is NEVER conveyed by colour alone (WCAG 1.4.1).
 */
export const STATUS_META: Record<string, StatusMeta> = {
  // ── Account ──────────────────────────────────────────────────────────
  active: {
    label: '활성',
    tone: 'blue',
    icon: <CircleDot size={12} aria-hidden="true" />,
  },
  suspended: {
    label: '정지',
    tone: 'amber',
    icon: <AlertCircle size={12} aria-hidden="true" />,
  },
  blocked: {
    label: '차단',
    tone: 'red',
    icon: <Ban size={12} aria-hidden="true" />,
  },
  withdrawal_pending: {
    label: '탈퇴 대기',
    tone: 'amber',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  deleted: {
    label: '삭제됨',
    tone: 'red',
    icon: <UserX size={12} aria-hidden="true" />,
  },

  // ── Match ────────────────────────────────────────────────────────────
  recruiting: {
    label: '모집 중',
    tone: 'blue',
    icon: <CircleDot size={12} aria-hidden="true" />,
  },
  closed: {
    label: '마감',
    tone: 'amber',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  cancelled: {
    label: '취소됨',
    tone: 'red',
    icon: <XCircle size={12} aria-hidden="true" />,
  },
  completed: {
    label: '완료',
    tone: 'gray',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  archived: {
    label: '보관',
    tone: 'gray',
    icon: <Archive size={12} aria-hidden="true" />,
  },

  // ── Team ─────────────────────────────────────────────────────────────
  // active already defined above
  // suspended already defined above
  // archived already defined above

  // ── Team match ───────────────────────────────────────────────────────
  matched: {
    label: '매칭됨',
    tone: 'green',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  // recruiting already defined above
  // cancelled already defined above
  // completed already defined above
  // archived already defined above

  // ── Tournament ───────────────────────────────────────────────────────
  // closed already defined above (amber/Clock — reused)
  // cancelled already defined above (red/XCircle — reused)
  // completed already defined above (gray/CheckCircle2 — reused; green variant not used to avoid match-domain conflict)
  open: {
    label: '접수 중',
    tone: 'blue',
    icon: <CircleDot size={12} aria-hidden="true" />,
  },
  in_progress: {
    label: '진행 중',
    tone: 'green',
    icon: <Loader2 size={12} aria-hidden="true" />,
  },
  draft: {
    label: '초안',
    tone: 'gray',
    icon: <FileText size={12} aria-hidden="true" />,
  },

  // ── Registration ─────────────────────────────────────────────────────
  // cancelled already defined above (red/XCircle — reused)
  awaiting_payment: {
    label: '입금 대기',
    tone: 'amber',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  payment_checking: {
    label: '명단 확인 중',
    tone: 'amber',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  paid: {
    label: '결제 완료',
    tone: 'blue',
    icon: <CircleDot size={12} aria-hidden="true" />,
  },
  confirmed: {
    label: '참가 확정',
    tone: 'green',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  waitlisted: {
    label: '대기',
    tone: 'gray',
    icon: <Archive size={12} aria-hidden="true" />,
  },
  cancel_requested: {
    label: '취소 요청',
    tone: 'amber',
    icon: <AlertCircle size={12} aria-hidden="true" />,
  },
};

// ── Component ─────────────────────────────────────────────────────────────
interface AdminStatusPillProps {
  status: string;
  /** Override the derived label */
  label?: string;
}

export function AdminStatusPill({ status, label }: AdminStatusPillProps) {
  const meta = STATUS_META[status];
  const displayLabel = label ?? meta?.label ?? status;
  const tone: Tone = meta?.tone ?? 'gray';

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
      ].join(' ')}
    >
      {meta?.icon ?? <CircleDot size={12} aria-hidden="true" />}
      {displayLabel}
    </span>
  );
}
