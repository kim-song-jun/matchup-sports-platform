'use client';
import { useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import type { V1AdminBracketGroup } from '@/types/api';
import { FinalistAssignmentDialog } from './finalist-assignment-dialog';
export function FinalistAssignmentButton({ tournamentId, groups, showToast }: {
  tournamentId: string; groups: V1AdminBracketGroup[]; showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const [open, setOpen] = useState(false);
  if (!groups.some((group) => group.phase === 'group')) return null;
  const supportsRound12 = groups.filter((group) => group.phase === 'group').length === 5 && groups.some((group) => group.phase === 'round12');
  return <><Button variant="outline" size="md" onClick={() => setOpen(true)}>결선 진출팀 배정</Button>
    {open ? <FinalistAssignmentDialog tournamentId={tournamentId} supportsRound12={supportsRound12} onClose={() => setOpen(false)} showToast={showToast} /> : null}</>;
}
