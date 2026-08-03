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
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
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
    const ok = await confirm({
      title: '결과를 확정할까요?',
      message: `${revision.score.home}:${revision.score.away} 결과를 공식 결과로 확정해요. 확정 후에는 정정 절차로만 바꿀 수 있어요.`,
      confirmLabel: '확정',
    });
    if (!ok) return;
    officialize.mutate(
      {
        revisionId: revision.id,
        expectedVersion: game.version,
        score: revision.score,
        eventsHash: revision.eventsHash,
        mvpParticipantId: revision.mvpParticipantId,
      },
      {
        onSuccess: () => setDirectorGateStatus('enabled'),
        onError: (error) => {
          if (isDirectorOfficializeDisabledError(error)) setDirectorGateStatus('disabled');
        },
      },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GameSummaryHeader
        game={game}
        currentScoreLabel={
          currentOfficial ? `${currentOfficial.score.home}:${currentOfficial.score.away}` : null
        }
      />

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
