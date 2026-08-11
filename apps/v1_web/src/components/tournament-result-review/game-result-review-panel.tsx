'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useGameResultRevisions,
  useOfficializeResultRevision,
  useReviewResultDecision,
  useSupersedeAndSubmitResult,
  useTournamentGame,
  type GameResultRevision,
} from '@/hooks/use-tournament-result-review';
import { useV1GameLineups } from '@/hooks/use-v1-api';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { countMissingAssists } from '@/lib/result-review-warnings';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { Button } from '@/components/v1-ui/button';
import { RevisionTimeline } from './revision-timeline';
import { GameSummaryHeader } from './game-summary-header';
import { ReasonModal } from './reason-modal';
import { ResultEditModal, type ResultEditSubmitInput } from './result-edit-modal';
import {
  canActOnResultReview,
  describeResultReviewError,
  isDirectorOfficializeDisabledError,
  officializeAlwaysAllowed,
} from './result-review-copy';

type ReasonAction = 'reject' | 'request_supplement';

type DirectorGateStatus = 'unknown' | 'enabled' | 'disabled';

/**
 * GameResultReviewPanel -- the result-review screen's per-game surface
 * (screen A-03's review half). Given a `gameId`, drives exactly the Task 22
 * REST endpoints named in `tournament-result-review.controller.ts`: review-
 * decision (reject/request_supplement), supersede-and-submit (resubmit), and
 * officialize (approve). Correction/void live in
 * `game-result-correction-panel.tsx` -- a result-review reviewer approves or
 * sends a revision back, a corrections operator fixes an already-official
 * result.
 */
export function GameResultReviewPanel({
  gameId,
  tournamentId,
  correctionsHref,
}: {
  gameId: string;
  tournamentId?: string;
  correctionsHref?: string;
}) {
  const gameQuery = useTournamentGame(gameId);
  const revisionsQuery = useGameResultRevisions(gameId);
  // 재제출 폼의 참가자 실명 표시용 -- 로딩 중/실패 시 빈 배열로 두면 모달이 기존
  // 폴백(사이드 + id 뒷자리)으로 얌전히 물러난다(아래 lineups prop 참고).
  const lineupsQuery = useV1GameLineups(gameId);
  const reviewDecision = useReviewResultDecision(gameId, tournamentId);
  const supersedeAndSubmit = useSupersedeAndSubmitResult(gameId, tournamentId);
  const officialize = useOfficializeResultRevision(gameId, tournamentId);
  const { confirm, ConfirmModal: officializeConfirmModal } = useConfirm();

  const [reasonAction, setReasonAction] = useState<{
    type: ReasonAction;
    revision: GameResultRevision;
  } | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<GameResultRevision | null>(null);
  const [directorGateStatus, setDirectorGateStatus] = useState<DirectorGateStatus>('unknown');

  if (gameQuery.isPending || revisionsQuery.isPending) {
    return <p className="tm-text-label">불러오는 중…</p>;
  }
  if (gameQuery.isError) {
    return (
      <ErrorState
        message={describeResultReviewError(gameQuery.error)}
        onRetry={() => void gameQuery.refetch()}
      />
    );
  }
  if (revisionsQuery.isError) {
    return (
      <ErrorState
        message={describeResultReviewError(revisionsQuery.error)}
        onRetry={() => void revisionsQuery.refetch()}
      />
    );
  }

  const game = gameQuery.data;
  const revisions = revisionsQuery.data ?? [];
  const latest = revisions[0] ?? null;
  const currentOfficial = revisions.find((revision) => revision.id === game.currentOfficialRevisionId);
  const readOnly = !canActOnResultReview(game.actorRole);
  const officializeAlwaysVisible = officializeAlwaysAllowed(game.actorRole);
  const showOfficializeCta = officializeAlwaysVisible || directorGateStatus !== 'disabled';

  async function handleOfficialize(revision: GameResultRevision) {
    // alpha 실사고(2026-08): 실제 점수는 2:1인데 이 확인 모달이 "1:1 결과를
    // 확정할까요?"로 떴다 — 되돌릴 수 없는 확정 직전에 틀린 숫자를 보여준
    // 것. 원인은 `revision`이 이 렌더를 만든 `useGameResultRevisions` 쿼리의
    // 캐시값이고, 전역 QueryClient 기본값(`staleTime: 30_000`, providers.tsx)
    // 때문에 최근 30초 내 한 번이라도 불러온 적이 있으면 리마운트 없이는
    // 자동 재요청되지 않는다는 점이다 — 마지막 골 기록 이후 이 화면을
    // 먼저 열어 뒀던 세션이라면 그 사이 발생한 변경을 놓친 채 굳어 있을 수
    // 있다. 확정은 무를 수 없으므로 캐시를 신뢰하지 않고, 다이얼로그를
    // 띄우기 직전 강제로 다시 불러와 그 응답을 확인 문구와 실제 제출
    // payload 양쪽에 그대로 쓴다(화면엔 새 숫자를 보여주고 서버엔 옛 숫자를
    // 보내는 불일치를 막기 위함).
    // Use the Promise's OWN resolved value, not `revisionsQuery.data`/
    // `gameQuery.data` read afterwards — those still point at the object
    // this render's closure captured; react-query only produces a new one
    // on the NEXT render, which this async continuation never triggers.
    // `?.` on the refetch RESULT itself, not just `.data`: react-query's own
    // `refetch()` never resolves to a non-object (an error still resolves
    // with `{ data: undefined, error, ... }`, it doesn't reject by default),
    // but guarding the outer value too costs nothing and keeps this from
    // throwing if either query is ever driven through a test double that
    // doesn't fully shape the resolved value.
    const [freshRevisions, freshGameResult] = await Promise.all([
      revisionsQuery.refetch(),
      gameQuery.refetch(),
    ]);
    const freshRevision =
      freshRevisions?.data?.find((candidate) => candidate.id === revision.id) ??
      freshRevisions?.data?.[0] ??
      revision;
    const freshGame = freshGameResult?.data ?? game;
    const ok = await confirm({
      title: '결과를 확정할까요?',
      message: `${freshRevision.score.home}:${freshRevision.score.away} 결과를 공식 결과로 확정해요. 확정 후에는 정정 절차로만 바꿀 수 있어요.`,
      confirmLabel: '확정',
    });
    if (!ok) return;
    officialize.mutate(
      {
        revisionId: freshRevision.id,
        expectedVersion: freshGame.version,
        score: freshRevision.score,
        eventsHash: freshRevision.eventsHash,
        mvpParticipantId: freshRevision.mvpParticipantId,
      },
      {
        onSuccess: () => setDirectorGateStatus('enabled'),
        onError: (error) => {
          if (isDirectorOfficializeDisabledError(error)) setDirectorGateStatus('disabled');
        },
      },
    );
  }

  const missingAssists = latest ? countMissingAssists(latest.resultParticipants) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GameSummaryHeader game={game} currentRevision={currentOfficial ?? null} />

      {missingAssists > 0 ? (
        <AlertBanner tone="info" message={`어시스트 미기입 ${missingAssists}건 — 확정에는 영향 없어요.`} />
      ) : null}

      {readOnly ? (
        <AlertBanner tone="info" message="이 화면에서는 결과를 볼 수만 있어요. 검토·확정 권한이 없어요." />
      ) : null}

      {latest && latest.state === 'SUBMITTED' && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="tm-text-label" style={{ fontWeight: 600 }}>이 결과를 검토해 주세요</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {showOfficializeCta ? (
              <Button
                variant="primary"
                size="md"
                loading={officialize.isPending}
                onClick={() => void handleOfficialize(latest)}
              >
                결과 승인(확정)
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="md"
              onClick={() => setReasonAction({ type: 'request_supplement', revision: latest })}
            >
              보완 요청
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => setReasonAction({ type: 'reject', revision: latest })}
            >
              반려
            </Button>
          </div>
          {!officializeAlwaysVisible && directorGateStatus === 'disabled' ? (
            <AlertBanner
              tone="warning"
              message="결과 확정 기능이 아직 활성화되지 않았어요. 플랫폼 운영팀에 문의해 주세요."
            />
          ) : null}
          {!officializeAlwaysVisible && directorGateStatus === 'disabled' ? (
            <Button variant="ghost" size="sm" onClick={() => setDirectorGateStatus('unknown')}>
              다시 확인
            </Button>
          ) : null}
          {officialize.isError && !isDirectorOfficializeDisabledError(officialize.error) ? (
            <AlertBanner tone="error" message={`${describeResultReviewError(officialize.error)} 다시 시도해 주세요.`} />
          ) : null}
        </div>
      ) : null}

      {latest && (latest.state === 'REJECTED' || latest.state === 'SUPPLEMENT_REQUESTED') && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="tm-text-label" style={{ fontWeight: 600 }}>
            {latest.state === 'REJECTED' ? '반려된 결과예요' : '보완이 필요한 결과예요'}
          </p>
          <Button variant="primary" size="md" onClick={() => setResubmitTarget(latest)}>
            다시 제출
          </Button>
        </div>
      ) : null}

      {latest && latest.state === 'OFFICIAL' ? (
        <AlertBanner
          tone="info"
          message={
            correctionsHref
              ? '이미 확정된 결과예요. 정정이 필요하면 정정 화면에서 진행해 주세요.'
              : '이미 확정된 결과예요.'
          }
        />
      ) : null}
      {latest && latest.state === 'OFFICIAL' && correctionsHref ? (
        <Link href={correctionsHref} className="tm-section-action">
          정정 화면으로 이동
        </Link>
      ) : null}

      {latest && latest.state === 'VOID' ? (
        <AlertBanner tone="error" message="무효 처리된 결과예요." />
      ) : null}

      <div>
        <p className="tm-text-label" style={{ fontWeight: 600, marginBottom: 8 }}>처리 이력</p>
        <RevisionTimeline revisions={revisions} />
      </div>

      {officializeConfirmModal}

      <ReasonModal
        open={reasonAction !== null}
        title={reasonAction?.type === 'reject' ? '결과를 반려할까요?' : '보완을 요청할까요?'}
        message={
          reasonAction?.type === 'reject'
            ? '반려하면 이 결과는 종료 처리되고, 담당자가 다시 제출해야 해요.'
            : '보완 요청하면 이 결과는 종료 처리되고, 담당자가 보완 후 다시 제출해야 해요.'
        }
        reasonLabel="반려/보완 사유"
        confirmLabel={reasonAction?.type === 'reject' ? '반려' : '보완 요청'}
        tone={reasonAction?.type === 'reject' ? 'danger' : 'default'}
        submitting={reviewDecision.isPending}
        errorMessage={reviewDecision.isError ? describeResultReviewError(reviewDecision.error) : null}
        onCancel={() => {
          setReasonAction(null);
          reviewDecision.reset();
        }}
        onConfirm={(reason) => {
          if (!reasonAction) return;
          reviewDecision.mutate(
            {
              revisionId: reasonAction.revision.id,
              expectedVersion: game.version,
              decision: reasonAction.type,
              reason,
            },
            { onSuccess: () => setReasonAction(null) },
          );
        }}
      />

      {resubmitTarget ? (
        <ResultEditModal
          open
          title="결과를 다시 제출할까요?"
          message="점수와 참가자 기록을 확인하고 다시 제출해 주세요. 새로운 검토 절차가 시작돼요."
          confirmLabel="다시 제출"
          reasonLabel="재제출 사유"
          base={{
            score: resubmitTarget.score,
            participants: resubmitTarget.resultParticipants,
            mvpParticipantId: resubmitTarget.mvpParticipantId,
          }}
          sides={game.sides}
          lineups={lineupsQuery.data ?? []}
          submitting={supersedeAndSubmit.isPending}
          errorMessage={
            supersedeAndSubmit.isError ? describeResultReviewError(supersedeAndSubmit.error) : null
          }
          onCancel={() => {
            setResubmitTarget(null);
            supersedeAndSubmit.reset();
          }}
          onConfirm={(input: ResultEditSubmitInput) => {
            supersedeAndSubmit.mutate(
              {
                revisionId: resubmitTarget.id,
                expectedVersion: game.version,
                score: input.score,
                actualParticipants: input.actualParticipants,
                eventsHash: resubmitTarget.eventsHash,
                mvpParticipantId: input.mvpParticipantId,
                reason: input.reason,
              },
              { onSuccess: () => setResubmitTarget(null) },
            );
          }}
        />
      ) : null}
    </div>
  );
}
