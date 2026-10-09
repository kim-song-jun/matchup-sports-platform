'use client';

import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';
import { Button } from '@/components/v1-ui/button';
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
      <Button variant="outline" size="md" onClick={() => setOpen(true)}>
        <ListOrdered size={16} aria-hidden="true" />
        순위대로 채우기
      </Button>
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
