'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RequireAuth } from '@/components/auth/require-auth';
import { ErrorState } from '@/components/v1-ui/primitives';
import { OpsPageHeader } from '@/components/tournament-ops/ops-page-header';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkFixtureId = searchParams.get('fixtureId');
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(() => deepLinkFixtureId);
  const [deepLinkNotFound, setDeepLinkNotFound] = useState(false);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  /* 보드 API 응답에는 팀 이름이 없어서 목록이 "group · 1경기"로만 보였다 —
     어느 경기를 정정하는지 알 수 없다. 운영 보드와 같은 소스에서 이름을 채운다. */
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
      <div className="flex flex-col gap-4">
        <OpsPageHeader
          tournamentTitle={tournament.data?.title}
          title="결과 정정"
          description="이미 확정된 공식 결과를 사유와 함께 바로잡아요."
        />

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
              teamNamesByFixtureId={teamNamesByFixtureId}
              selectedFixtureId={selectedFixtureId}
              onSelect={(item) => {
                setSelectedFixtureId(item.fixtureId);
                setTimeout(() => panelHeadingRef.current?.focus(), 0);
              }}
              emptyTitle="정정할 결과가 없어요"
              emptySub="정정은 공식 확정된 결과가 있어야 할 수 있어요. 아직 확정한 경기가 없다면 결과 검토에서 먼저 확정해 주세요."
              emptyCta="결과 검토로 가기"
              onEmptyCta={() => router.push(`/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/result-review`)}
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
      </div>
    </RequireAuth>
  );
}
