'use client';

import { useMemo, useRef, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { useTournamentEndedFixtures, type TournamentOperationsBoardItem } from '@/hooks/use-tournament-result-review';
import { FixturePickerList } from '@/components/tournament-result-review/fixture-picker-list';
import { GameResultCorrectionPanel } from '@/components/tournament-result-review/game-result-correction-panel';
import { describeResultReviewError } from '@/components/tournament-result-review/result-review-copy';
import { ResultReviewGridStyles } from '@/components/tournament-result-review/result-review-grid-styles';

/**
 * Screen A-04 -- `/tournament-ops/tournaments/:tournamentId/records/
 * corrections`. Same worktree gap as `result-review-page-client.tsx`: Task
 * 19's shared shell has not landed, so this page self-wraps in `RequireAuth`
 * and relies on the server (`TournamentResultReviewService`) for true
 * authorization.
 */
export function CorrectionsPageClient({ tournamentId }: { tournamentId: string }) {
  const tournament = useV1Tournament(tournamentId);
  const boardQuery = useTournamentEndedFixtures(tournamentId);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  const hasOfficialResult = useMemo(
    () =>
      (boardQuery.data?.items ?? []).filter(
        (item): item is TournamentOperationsBoardItem & { gameId: string } =>
          item.gameId !== null && item.revisionId !== null,
      ),
    [boardQuery.data],
  );

  const selectedItem = hasOfficialResult.find((item) => item.fixtureId === selectedFixtureId) ?? null;

  return (
    <RequireAuth>
      <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960, margin: '0 auto' }}>
        <AppBackLink className="tm-text-label" fallbackHref={`/tournaments/${encodeURIComponent(tournamentId)}`}>
          ← 대회로
        </AppBackLink>
        {/* 소비자용 대회 화면과 이질감이 있다는 지적(2026-08-05)을 반영해 그 화면들이
            이미 쓰는 eyebrow(파란 대회명)+제목 톤을 맞췄다. */}
        <p className="text-[11px] md:text-[12px] font-semibold text-blue-500 tracking-normal">
          {tournament.data?.title ?? '대회 운영'}
        </p>
        <h1 className="tm-text-heading">결과 정정</h1>

        {boardQuery.isPending ? <p className="tm-text-label">불러오는 중…</p> : null}
        {boardQuery.isError ? (
          <ErrorState
            message={describeResultReviewError(boardQuery.error)}
            onRetry={() => void boardQuery.refetch()}
          />
        ) : null}

        {boardQuery.isSuccess ? (
          <>
          <ResultReviewGridStyles />
          <div className="tm-result-review-grid">
            <FixturePickerList
              items={hasOfficialResult}
              selectedFixtureId={selectedFixtureId}
              onSelect={(item) => {
                setSelectedFixtureId(item.fixtureId);
                setTimeout(() => panelHeadingRef.current?.focus(), 0);
              }}
              emptyTitle="정정할 결과가 없어요"
              emptySub="공식 확정된 결과가 있는 경기가 없어요."
            />

            {selectedItem && selectedItem.gameId ? (
              <div>
                <h2
                  ref={panelHeadingRef}
                  tabIndex={-1}
                  className="tm-text-body-lg"
                  style={{ marginBottom: 12, outline: 'none' }}
                >
                  {selectedItem.round} · {selectedItem.fixtureNumber}경기
                </h2>
                <GameResultCorrectionPanel
                  key={selectedItem.gameId}
                  gameId={selectedItem.gameId}
                  tournamentId={tournamentId}
                />
              </div>
            ) : null}
          </div>
          </>
        ) : null}
      </main>
    </RequireAuth>
  );
}
