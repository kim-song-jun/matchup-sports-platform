'use client';

import { useState } from 'react';
import {
  useCreateResultCorrection,
  useGameResultRevisions,
  useOfficializeResultRevision,
  useTournamentGame,
  useVoidResultRevision,
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

type DirectorGateStatus = 'unknown' | 'enabled' | 'disabled';

/**
 * GameResultCorrectionPanel -- the records/corrections screen's per-game
 * surface (screen A-04, and the correction half of A-03's officialize/void
 * authority). Drives `POST /games/:gameId/corrections` (create),
 * `.../officialize` (confirm a correction draft), and `.../void`
 * (retract the current official result) -- all named in
 * `tournament-result-review.controller.ts`.
 *
 * A correction only ever targets the game's CURRENT official revision
 * (enforced server-side with `409 REVISION_MUST_BE_SUPERSEDED` otherwise);
 * this panel only ever offers "start a correction" when a current official
 * revision exists and no correction draft is already pending against it.
 *
 * `game.currentOfficialRevisionId` can point at a revision whose `state` is
 * `VOID`, not just `OFFICIAL` -- `voidResultRevision`
 * (`tournament-result-review.service.ts`) appends a new `VOID` revision and
 * repoints the current pointer at it. Per
 * `docs/api/domains/tournament-operations.md`'s void contract ("official
 * correction is `official→superseding correction draft→official|void`"),
 * `VOID` is a TERMINAL state with no further transition defined anywhere in
 * that contract -- `supersedeAndSubmit` (the only "submit a new result"
 * route this domain has) explicitly requires a `REJECTED`/
 * `SUPPLEMENT_REQUESTED` base (`409 RESULT_RESUBMISSION_NOT_ALLOWED`
 * otherwise) and never accepts `VOID`. So after a void, this panel offers
 * NO correction/void CTA at all -- both would be guaranteed rejected
 * server-side (`createResultCorrection`'s `assertRevisionSupersession`
 * requires `baseState === OFFICIAL`; `voidResultRevision` requires
 * `revision.state === OFFICIAL`) -- and instead shows an explicit "voided"
 * banner so the operator never fills out a doomed form.
 */
export function GameResultCorrectionPanel({
  gameId,
  tournamentId,
}: {
  gameId: string;
  tournamentId?: string;
}) {
  const gameQuery = useTournamentGame(gameId);
  const revisionsQuery = useGameResultRevisions(gameId);
  const createCorrection = useCreateResultCorrection(gameId, tournamentId);
  const officialize = useOfficializeResultRevision(gameId, tournamentId);
  const voidRevision = useVoidResultRevision(gameId, tournamentId);
  const { confirm, ConfirmModal: officializeConfirmModal } = useConfirm();

  const [correctionFormOpen, setCorrectionFormOpen] = useState(false);
  const [voidRequested, setVoidRequested] = useState(false);
  const [directorGateStatus, setDirectorGateStatus] = useState<DirectorGateStatus>('unknown');

  if (gameQuery.isPending || revisionsQuery.isPending) {
    return <p className="tm-text-label">불러오는 중…</p>;
  }
  if (gameQuery.isError) {
    return (
      <ErrorState message={describeResultReviewError(gameQuery.error)} onRetry={() => void gameQuery.refetch()} />
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
  const currentPointerRevision =
    revisions.find((revision) => revision.id === game.currentOfficialRevisionId) ?? null;
  const currentOfficial =
    currentPointerRevision && currentPointerRevision.state === 'OFFICIAL' ? currentPointerRevision : null;
  const isVoided = currentPointerRevision?.state === 'VOID';
  const pendingCorrection =
    currentOfficial
      ? revisions.find(
          (revision) => revision.state === 'DRAFT' && revision.supersedesId === currentOfficial.id,
        ) ?? null
      : null;
  const readOnly = !canActOnResultReview(game.actorRole);
  const officializeAlwaysVisible = officializeAlwaysAllowed(game.actorRole);
  const showGatedCta = officializeAlwaysVisible || directorGateStatus !== 'disabled';

  async function handleOfficializeCorrection() {
    if (!pendingCorrection) return;
    const ok = await confirm({
      title: '정정 내용을 확정할까요?',
      message: `${pendingCorrection.score.home}:${pendingCorrection.score.away}로 공식 결과를 정정해요. 확정 전 사유와 변경 내용을 다시 확인해 주세요.`,
      confirmLabel: '정정 확정',
    });
    if (!ok) return;
    officialize.mutate(
      {
        revisionId: pendingCorrection.id,
        expectedVersion: game.version,
        score: pendingCorrection.score,
        eventsHash: pendingCorrection.eventsHash,
        mvpParticipantId: pendingCorrection.mvpParticipantId,
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
      <GameSummaryHeader game={game} currentRevision={currentPointerRevision} />

      {readOnly ? (
        <AlertBanner tone="info" message="이 화면에서는 결과를 볼 수만 있어요. 정정·무효화 권한이 없어요." />
      ) : null}

      {!currentPointerRevision ? (
        <AlertBanner tone="info" message="공식 확정된 결과가 없어서 정정할 수 없어요." />
      ) : null}

      {isVoided ? (
        <AlertBanner
          tone="error"
          message="공식 결과가 무효 처리됐어요. 무효화는 되돌릴 수 없고, 이 결과는 더 이상 정정하거나 다시 무효화할 수 없어요."
        />
      ) : null}

      {currentOfficial && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendingCorrection ? (
            <>
              <p className="tm-text-label" style={{ fontWeight: 600 }}>
                정정 초안이 대기 중이에요
              </p>
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                {pendingCorrection.reason ? `사유: ${pendingCorrection.reason}` : null}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {showGatedCta ? (
                  <Button variant="primary" size="md" loading={officialize.isPending} onClick={() => void handleOfficializeCorrection()}>
                    정정 확정
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="tm-text-label" style={{ fontWeight: 600 }}>공식 결과를 정정해요</p>
              <Button variant="primary" size="md" onClick={() => setCorrectionFormOpen(true)}>
                정정 시작
              </Button>
            </>
          )}
          {!officializeAlwaysVisible && directorGateStatus === 'disabled' ? (
            <>
              <AlertBanner tone="warning" message="정정 확정/무효화 기능이 아직 활성화되지 않았어요. 플랫폼 운영팀에 문의해 주세요." />
              <Button variant="ghost" size="sm" onClick={() => setDirectorGateStatus('unknown')}>
                다시 확인
              </Button>
            </>
          ) : null}
          {officialize.isError && !isDirectorOfficializeDisabledError(officialize.error) ? (
            <AlertBanner tone="error" message={`${describeResultReviewError(officialize.error)} 다시 시도해 주세요.`} />
          ) : null}
        </div>
      ) : null}

      {currentOfficial && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="tm-text-label" style={{ fontWeight: 600, color: 'var(--red500)' }}>
            공식 결과 무효화
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            무효화하면 이 경기의 공식 점수·기록이 모두 취소되고, 다음 라운드 진행에도 영향을 줄 수 있어요.
          </p>
          {showGatedCta ? (
            <Button variant="danger" size="md" onClick={() => setVoidRequested(true)}>
              무효화
            </Button>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="tm-text-label" style={{ fontWeight: 600, marginBottom: 8 }}>처리 이력</p>
        <RevisionTimeline revisions={revisions} />
      </div>

      {officializeConfirmModal}

      {correctionFormOpen && currentOfficial ? (
        <ResultEditModal
          open
          title="결과를 정정할까요?"
          message="변경할 점수·참가자 기록과 사유를 입력해 주세요. 확정 전까지는 기존 공식 결과가 그대로 유지돼요."
          confirmLabel="정정 제출"
          reasonLabel="정정 사유"
          base={{
            score: currentOfficial.score,
            participants: currentOfficial.resultParticipants,
            mvpParticipantId: currentOfficial.mvpParticipantId,
          }}
          sides={game.sides}
          submitting={createCorrection.isPending}
          errorMessage={createCorrection.isError ? describeResultReviewError(createCorrection.error) : null}
          onCancel={() => {
            setCorrectionFormOpen(false);
            createCorrection.reset();
          }}
          onConfirm={(input: ResultEditSubmitInput) => {
            createCorrection.mutate(
              {
                expectedVersion: game.version,
                baseRevisionId: currentOfficial.id,
                reason: input.reason,
                changes: {
                  score: input.score,
                  actualParticipants: input.actualParticipants,
                  eventsHash: currentOfficial.eventsHash,
                  mvpParticipantId: input.mvpParticipantId,
                },
              },
              { onSuccess: () => setCorrectionFormOpen(false) },
            );
          }}
        />
      ) : null}

      <ReasonModal
        open={voidRequested}
        title="결과를 무효화할까요?"
        message="무효화는 되돌릴 수 없어요. 사유를 남겨 주세요."
        reasonLabel="무효화 사유"
        confirmLabel="무효화"
        tone="danger"
        submitting={voidRevision.isPending}
        errorMessage={voidRevision.isError ? describeResultReviewError(voidRevision.error) : null}
        onCancel={() => {
          setVoidRequested(false);
          voidRevision.reset();
        }}
        onConfirm={(reason) => {
          if (!currentOfficial) return;
          voidRevision.mutate(
            { revisionId: currentOfficial.id, expectedVersion: game.version, reason },
            {
              onSuccess: () => {
                setVoidRequested(false);
                setDirectorGateStatus('enabled');
              },
              onError: (error) => {
                if (isDirectorOfficializeDisabledError(error)) setDirectorGateStatus('disabled');
              },
            },
          );
        }}
      />
    </div>
  );
}
