'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
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
  const tournament = useV1Tournament(tournamentId);
  const boardQuery = useTournamentEndedFixtures(tournamentId);
  const searchParams = useSearchParams();
  const deepLinkFixtureId = searchParams.get('fixtureId');
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(() => deepLinkFixtureId);
  const [deepLinkNotFound, setDeepLinkNotFound] = useState(false);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  /* 보드 API 응답에는 팀 이름이 없어서 목록이 "group · 1경기"로만 보였다 —
     어느 경기를 검토하는지 알 수 없다. 운영 보드와 같은 소스에서 이름을 채운다. */
  const teamNamesByFixtureId = useMemo(() => {
    // 참가팀 공개 정책 통일(fix/v1-publish) — useV1Tournament는 공개 상세 응답을
    // 그대로 쓰므로 타입상 null일 수 있다. 이 화면에 접근하는 스태프는 대회 전체
    // 단위로 인가되어 항상 실명을 받으므로(operations-board-client.tsx와 동일 근거)
    // 실질적으로 null은 나타나지 않지만, 방어적으로 '미정'을 fallback한다.
    const map = new Map<string, { home: string; away: string }>();
    for (const fixture of tournament.data?.fixtures ?? []) {
      map.set(fixture.id, { home: fixture.homeTeamName ?? '미정', away: fixture.awayTeamName ?? '미정' });
    }
    return map;
  }, [tournament.data?.fixtures]);

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

  // T6-1: 딥링크로 들어왔는데 목록이 로드된 뒤에도 해당 fixture가 없으면(아직
  // 종료 전이거나 이미 처리됨) 조용히 미선택 상태로 두지 않고 안내한다.
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
        {/* 소비자용 대회 화면(대회 상세·순위/브래킷)과 이질감이 있다는 지적(2026-08-05)을
            반영해, 그 화면들이 이미 쓰는 eyebrow(파란 대회명)+제목 톤을 맞췄다. */}
        <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] tracking-normal">
          {tournament.data?.title ?? '대회 운영'}
        </p>
        <h1 className="tm-text-heading">결과 검토</h1>

        {deepLinkNotFound ? (
          <p className="tm-text-caption" role="status" style={{ color: 'var(--text-muted)' }}>
            전달받은 경기는 지금 검토 목록에 없어요. 아직 종료되지 않았거나 이미 처리됐을 수 있어요.
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
          {/* 검토 대기가 0건이어도 "이 대회 얘기"라는 감각이 남게 진행 요약을 항상 보여준다.
              전에는 범용 EmptyState만 떠 있어서, 대기가 0건인 게 대회가 순조로운 건지
              화면이 아예 로딩이 덜 된 건지 구분이 안 됐다. */}
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            종료 {boardQuery.data.items.length}경기 · 검토 대기{' '}
            <strong style={{ color: needsReview.length > 0 ? 'var(--blue500)' : 'var(--text-muted)' }}>
              {needsReview.length}건
            </strong>
          </p>
          <div className="tm-result-review-grid">
            <FixturePickerList
              items={needsReview}
              teamNamesByFixtureId={teamNamesByFixtureId}
              selectedFixtureId={selectedFixtureId}
              onSelect={(item) => {
                setSelectedFixtureId(item.fixtureId);
                setTimeout(() => panelHeadingRef.current?.focus(), 0);
              }}
              emptyTitle="검토할 결과가 없어요"
              emptySub={
                boardQuery.data.items.length > 0
                  ? '종료된 경기는 있지만 승인이 필요한 항목은 없어요.'
                  : '아직 종료된 경기가 없어요.'
              }
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
