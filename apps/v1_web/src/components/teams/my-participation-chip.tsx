import { Check } from 'lucide-react';

/** "내 출전" 칩. 출전하는 경기에만 그린다 — 빠진 경기에는 아무 칩도 두지 않는다(빠졌다고 알리지 않는 결정). */
export function MyParticipationChip() {
  return (
    <span className="tm-badge tm-badge-green" style={{ gap: 4 }}>
      <Check size={12} strokeWidth={2.6} aria-hidden="true" />
      내 출전
    </span>
  );
}
