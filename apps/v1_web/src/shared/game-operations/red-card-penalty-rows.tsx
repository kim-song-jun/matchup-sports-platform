import { Timer } from 'lucide-react';
import { formatPenaltyRemaining } from '@/lib/red-card-penalty';

export interface PenaltyRowView {
  readonly key: string;
  readonly remainingMs: number;
  /** 퇴장한 팀·선수 문구("수용5팀 · 수용5팀장 퇴장"). */
  readonly label: string;
  /** 시계가 멈춘 이유("일시 중지 중"·"하프타임") — 없으면 시계가 흐르는 중이다. */
  readonly stoppedNote?: string | null;
}

/**
 * 퇴장 패널티 줄 목록의 모양 — 운영 콘솔(`RedCardPenaltyBanner`)과 공개 경기 화면(`PublicRedCardPenalty`)이 같이 쓴다.
 * 계산은 하지 않고 받은 줄만 그린다(`lib/red-card-penalty.ts`가 계산).
 */
export function RedCardPenaltyRows({ rows }: { readonly rows: readonly PenaltyRowView[] }) {
  if (rows.length === 0) return null;
  return (
    <ul aria-label="퇴장 패널티" className="flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex items-center gap-2 rounded-lg border border-[var(--tint-red-border)] bg-[var(--tint-red)] px-3 py-2 text-left"
        >
          <Timer size={16} aria-hidden="true" className="shrink-0 text-[var(--red700)]" />
          {/* role=timer 는 암묵적으로 aria-live=off 라 매초 바뀌는 숫자를 스크린리더가 계속 읽지 않는다. */}
          <span
            role="timer"
            className="shrink-0 text-[length:var(--font-size-body-sm)] font-bold tabular-nums text-[var(--red700)]"
          >
            패널티 {formatPenaltyRemaining(row.remainingMs)}
          </span>
          <span className="min-w-0 break-keep text-[length:var(--font-size-label)] text-[var(--text-body)]">
            {row.label}
            {/* 좁은 폭에서 "일시 중지 / 중"처럼 한 글자가 홀로 떨어지지 않게 안내 문구는 한 덩어리로 내려간다. */}
            {row.stoppedNote ? <span className="whitespace-nowrap"> · {row.stoppedNote}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
