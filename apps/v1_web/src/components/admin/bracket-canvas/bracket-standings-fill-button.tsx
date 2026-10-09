'use client';

import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';
import { BracketStandingsFillDialog } from './bracket-standings-fill-dialog';

export function BracketStandingsFillButton({
  tournamentId,
  slots,
  teamNames,
  canWrite,
  onFilled,
  onError,
}: {
  tournamentId: string;
  slots: ReadonlyArray<{ kind: string }>;
  teamNames: ReadonlyMap<string, string>;
  canWrite: boolean;
  onFilled?: (result: V1FillSlotsFromStandingsResult) => void;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite || !slots.some((slot) => slot.kind === 'GROUP_RANK')) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-[length:var(--font-size-body)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
      >
        <ListOrdered size={16} aria-hidden="true" />
        순위대로 채우기
      </button>
      <BracketStandingsFillDialog
        open={open}
        tournamentId={tournamentId}
        teamNames={teamNames}
        onClose={() => setOpen(false)}
        onFilled={onFilled}
        onError={onError}
      />
    </>
  );
}
