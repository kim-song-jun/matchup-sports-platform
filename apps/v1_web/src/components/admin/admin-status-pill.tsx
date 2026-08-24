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
  blue: 'bg-[var(--blue50)] text-[var(--blue700)]',
  // --green700 토큰이 globals.css에 없어 중립 강조 토큰(--text-strong)으로 대체 — 배경만 토큰화
  green: 'bg-[var(--green50)] text-[var(--text-strong)]',
  amber: 'bg-[var(--tint-orange)] text-[var(--orange700)]',
  red: 'bg-[var(--red50)] text-[var(--red700)]',
  // --surface-soft 배경만으로는 흰색 카드/행(--card-surface)과 대비가 거의 없어(~1.10:1)
  // border-strong 테두리를 더해 컨테이너와 무관하게 경계가 보이도록 함 (기존 P1 패턴 재사용)
  gray: 'bg-[var(--surface-soft)] text-[var(--text-muted)] border border-[var(--border-strong)]',
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
  published: {
    label: '발행',
    tone: 'green',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },

  // ── Registration ─────────────────────────────────────────────────────
  // cancelled already defined above (red/XCircle — reused)
  submitted: {
    label: '운영진 확인',
    tone: 'blue',
    icon: <FileText size={12} aria-hidden="true" />,
  },
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

  // ── 리그 대진의 결과 진행 단계 ────────────────────────────────────────
  // 팀매치 status(matched/cancelled)와는 **다른 축**이라 어드민 표에서 별도 열로 쓴다.
  // 키에 result_ 접두를 붙인 이유: 'draft'·'submitted' 는 이미 다른 도메인(대회 공고·
  // 신청서)이 쓰고 있어서, 같은 단어를 재사용하면 라벨이 조용히 서로 바뀐다.
  result_not_entered: {
    label: '결과 미입력',
    tone: 'amber',
    icon: <AlertCircle size={12} aria-hidden="true" />,
  },
  result_draft: {
    label: '작성 중',
    tone: 'gray',
    icon: <FileText size={12} aria-hidden="true" />,
  },
  result_awaiting_approval: {
    label: '승인 대기',
    tone: 'amber',
    icon: <Clock size={12} aria-hidden="true" />,
  },
  result_change_requested: {
    label: '정정 요청',
    tone: 'red',
    icon: <AlertCircle size={12} aria-hidden="true" />,
  },
  result_official: {
    label: '확정',
    tone: 'green',
    icon: <CheckCircle2 size={12} aria-hidden="true" />,
  },
  result_voided: {
    label: '무효',
    tone: 'gray',
    icon: <XCircle size={12} aria-hidden="true" />,
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
