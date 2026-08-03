'use client';

import { useMemo, useRef, useState } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useTournamentEndedFixtures, type TournamentOperationsBoardItem } from '@/hooks/use-tournament-result-review';
import { FixturePickerList } from '@/components/tournament-result-review/fixture-picker-list';
import { GameResultReviewPanel } from '@/components/tournament-result-review/game-result-review-panel';
import { describeResultReviewError } from '@/components/tournament-result-review/result-review-copy';
import { ResultReviewGridStyles } from '@/components/tournament-result-review/result-review-grid-styles';

/**
 * Screen A-03 (review half) -- `/tournament-ops/tournaments/:tournamentId/
 * result-review`. Task 19's shared tournament-ops shell
 * (`apps/v1_web/src/app/tournament-ops/layout.tsx`) has not landed in this
 * worktree, so this page wraps itself in the existing generic `RequireAuth`
 * rather than a staff-aware shell -- true authorization is still enforced
 * server-side by `TournamentStaffAccessService`/`TournamentResultReviewService`
 * regardless. See this lane's implementation report for the follow-up this
 * implies once Task 19 ships.
 */
export function ResultReviewPageClient({ tournamentId }: { tournamentId: string }) {
  const boardQuery = useTournamentEndedFixtures(tournamentId);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  const needsReview = useMemo(
    () =>
      (boardQuery.data?.items ?? []).filter(
        (item): item is TournamentOperationsBoardItem & { gameId: string } =>
          item.gameId !== null && (item.revisionId === null || item.warnings.includes('RESULT_REVIEW_OVERDUE')),
      ),
    [boardQuery.data],
  );

  const selectedItem = needsReview.find((item) => item.fixtureId === selectedFixtureId) ?? null;
  const correctionsHref = `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/records/corrections`;

  return (
    <RequireAuth>
      <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960, margin: '0 auto' }}>
        <AppBackLink className="tm-text-label" fallbackHref={`/tournaments/${encodeURIComponent(tournamentId)}`}>
          ← 대회로
        </AppBackLink>
        <h1 className="tm-text-heading">결과 검토</h1>

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
              items={needsReview}
              selectedFixtureId={selectedFixtureId}
              onSelect={(item) => {
                setSelectedFixtureId(item.fixtureId);
                setTimeout(() => panelHeadingRef.current?.focus(), 0);
              }}
              emptyTitle="검토할 결과가 없어요"
              emptySub="종료된 경기 중 결과 승인이 필요한 항목이 없어요."
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
                <GameResultReviewPanel
                  key={selectedItem.gameId}
                  gameId={selectedItem.gameId}
                  tournamentId={tournamentId}
                  correctionsHref={correctionsHref}
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
