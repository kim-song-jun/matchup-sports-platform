'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const deepLinkFixtureId = searchParams.get('fixtureId');
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(() => deepLinkFixtureId);
  const [deepLinkNotFound, setDeepLinkNotFound] = useState(false);
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

  // T6-2: 딥링크로 들어왔는데 목록이 로드된 뒤에도 해당 fixture가 없으면(아직 공식
  // 결과가 확정되지 않은 경우) 조용히 미선택 상태로 두지 않고 안내한다.
  // Fix round 1 — `useTournamentEndedFixtures`는 staleTime: 15_000(창 포커스 등으로
  // 백그라운드 refetch됨)이라, 안내를 띄운 뒤 refetch로 그 fixture가 목록에
  // 들어오면 selectedItem이 truthy가 되는데 deepLinkNotFound는 계속 true로
  // 남아 배너와 패널이 동시에 보이는 버그가 있었다. selectedItem이 다시
  // truthy가 되면 배너를 명시적으로 내린다.
  useEffect(() => {
    if (!boardQuery.isSuccess || !deepLinkFixtureId) return;
    if (selectedItem) {
      setDeepLinkNotFound(false);
      setTimeout(() => panelHeadingRef.current?.focus(), 0);
      return;
    }
    setDeepLinkNotFound(true);
  }, [boardQuery.isSuccess, deepLinkFixtureId, selectedItem]);

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

        {deepLinkNotFound ? (
          <p className="tm-text-caption" role="status" style={{ color: 'var(--text-muted)' }}>
            전달받은 경기는 지금 정정 목록에 없어요. 아직 공식 결과가 확정되지 않았을 수 있어요.
          </p>
        ) : null}

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
