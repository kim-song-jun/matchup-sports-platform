import { CheckCircle2, CircleDot, Clock, FileText, Hourglass, PauseCircle, XCircle, type LucideIcon } from 'lucide-react';
import type { StatusChipIcon, StatusChipModel } from '@/lib/competition-status';

const ICONS: Record<StatusChipIcon, LucideIcon> = {
  clock: Clock,
  hourglass: Hourglass,
  live: CircleDot,
  pause: PauseCircle,
  check: CheckCircle2,
  cancel: XCircle,
  draft: FileText,
};

/**
 * 리그·경기·명단 상태 칩 — `lib/competition-status.ts` 가 계산한 모델을 그대로 그린다.
 * 문구·톤·아이콘을 화면에서 고르지 않는다(같은 사실은 모든 화면에서 같은 칩).
 */
export function StatusChip({ chip, size = 'sm' }: { chip: StatusChipModel; size?: 'sm' | 'md' }) {
  const Icon = chip.icon === null ? null : ICONS[chip.icon];
  return (
    <span
      className={`tm-badge ${size === 'sm' ? 'tm-badge-sm ' : ''}tm-badge-${chip.tone}`}
      style={Icon === null ? undefined : { gap: 4 }}
    >
      {Icon === null ? null : <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
      {chip.label}
    </span>
  );
}
