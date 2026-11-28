'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { GameResultCorrectionPanel } from '@/components/tournament-result-review/game-result-correction-panel';
import { GameResultReviewPanel } from '@/components/tournament-result-review/game-result-review-panel';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useGameResultRevisions } from '@/hooks/use-tournament-result-review';
import { extractErrorMessage } from '@/lib/error-message';

interface ResultPanelProps {
  gameId: string;
  tournamentId: string;
  isRegularLeague: boolean;
  /** 딥링크로 열린 확정된 경기만 true — 결과 고치기 폼을 바로 연다. */
  autoOpenFix: boolean;
  onSaved: () => void;
  onOfficialized?: () => void;
}

/** 경기 하나의 결과 처리. 제출된 결과가 기다리면 확정 패널, 아니면 고치기 패널이다. */
export function ResultPanel({ gameId, tournamentId, isRegularLeague, autoOpenFix, onSaved, onOfficialized }: ResultPanelProps) {
  const revisions = useGameResultRevisions(gameId);
  const [mode, setMode] = useState<'review' | 'correction' | null>(null);
  const [autoOpenAllowed, setAutoOpenAllowed] = useState(autoOpenFix);
  const latest = revisions.data?.[0];

  const handleSaved = useCallback(() => {
    // 저장 뒤에 패널이 바뀌어도 고치기 폼이 저절로 열리지 않게 한다.
    setAutoOpenAllowed(false);
    void revisions.refetch().then((result) => {
      if (result.isSuccess && result.data) {
        setMode(result.data[0]?.state === 'SUBMITTED' ? 'review' : 'correction');
      }
      onSaved();
    });
  }, [onSaved, revisions.refetch]);

  useEffect(() => {
    if (mode !== null || revisions.isPending || revisions.isError) return;
    setMode(latest?.state === 'SUBMITTED' ? 'review' : 'correction');
  }, [latest?.state, mode, revisions.isError, revisions.isPending]);

  if (revisions.isPending) return <AdminListSkeleton rows={4} />;
  if (revisions.isError) {
    return <ErrorState message={extractErrorMessage(revisions.error, '결과 정보를 불러오지 못했어요.')} onRetry={() => void revisions.refetch()} />;
  }
  if (mode === null) return <AdminListSkeleton rows={4} />;
  return mode === 'review' ? (
    <GameResultReviewPanel gameId={gameId} tournamentId={tournamentId} inline onSaved={handleSaved} onOfficialized={onOfficialized} />
  ) : (
    <GameResultCorrectionPanel
      gameId={gameId}
      tournamentId={tournamentId}
      isRegularLeague={isRegularLeague}
      inline
      autoOpen={autoOpenAllowed && latest?.state === 'OFFICIAL'}
      onSaved={handleSaved}
    />
  );
}
