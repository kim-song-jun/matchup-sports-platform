'use client';

import { useState } from 'react';
import {
  useCreateResultCorrection,
  useGameResultRevisions,
  useOfficializeResultRevision,
  useTournamentGame,
  useVoidResultRevision,
} from '@/hooks/use-tournament-result-review';
import { useV1GameLineups } from '@/hooks/use-v1-api';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { Button } from '@/components/v1-ui/button';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';
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
 * repoints the current pointer at it. `VOID` 는 '현재 유효한 공식 결과가
 * 없음'이지 경기의 끝이 아니에요: 권한자는 그 VOID 리비전을 base 로 같은
 * `POST /games/:gameId/corrections` 를 호출해 재입력 DRAFT 를 만들고
 * (`assertRevisionSupersession` 의 `VOID_REENTRY` purpose), 이어서
 * `.../officialize` 로 새 공식 결과를 확정할 수 있어요. 그래서 무효 이후
 * 이 패널은 '결과 다시 입력' CTA 를 제공하고, 무효화 CTA 만 숨겨요
 * (`voidResultRevision` 은 여전히 `revision.state === OFFICIAL` 만 받아요).
 * VOID 리비전에는 참가자 기록이 복사되지 않으므로, 재입력 폼의 초기값은
 * 무효화 직전 공식 리비전에서 가져와요.
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
  // 정정 폼의 참가자 실명 표시용 -- 로딩 중/실패 시 빈 배열로 두면 모달이 기존
  // 폴백(사이드 + id 뒷자리)으로 얌전히 물러난다(아래 lineups prop 참고).
  const lineupsQuery = useV1GameLineups(gameId);
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
  // 무효 처리 뒤에도 결과를 다시 입력할 수 있어요: 서버는 현재 포인터가 가리키는
  // VOID 리비전을 base 로 재입력 DRAFT 를 받고(VOID_REENTRY), 그 초안을
  // officialize 하면 새 공식 결과가 돼요.
  const draftBase = currentOfficial ?? (isVoided ? currentPointerRevision : null);
  // VOID 리비전에는 참가자 기록이 복사되지 않으므로, 폼 초기값은 무효화 직전
  // 공식 리비전에서 가져와요.
  const editPrefill =
    currentOfficial ??
    (isVoided && currentPointerRevision
      ? revisions.find((revision) => revision.id === currentPointerRevision.supersedesId) ??
        currentPointerRevision
      : null);
  const pendingCorrection =
    draftBase
      ? revisions.find(
          (revision) => revision.state === 'DRAFT' && revision.supersedesId === draftBase.id,
        ) ?? null
      : null;
  const entryCopy = isVoided
    ? {
        cardTitle: '무효 처리된 경기의 결과를 다시 입력해요',
        startCta: '결과 다시 입력',
        pendingTitle: '다시 입력한 결과가 대기 중이에요',
        confirmCta: '결과 확정',
        confirmTitle: '다시 입력한 결과를 확정할까요?',
        confirmMessage: '확정 전 사유와 입력 내용을 다시 확인해 주세요.',
        modalTitle: '결과를 다시 입력할까요?',
        modalMessage:
          '새로 확정할 점수·참가자 기록과 사유를 입력해 주세요. 확정 전까지는 무효 상태가 그대로 유지돼요.',
        modalConfirmLabel: '결과 제출',
        reasonLabel: '재입력 사유',
      }
    : {
        cardTitle: '공식 결과를 정정해요',
        startCta: '정정 시작',
        pendingTitle: '정정 초안이 대기 중이에요',
        confirmCta: '정정 확정',
        confirmTitle: '정정 내용을 확정할까요?',
        confirmMessage: '확정 전 사유와 변경 내용을 다시 확인해 주세요.',
        modalTitle: '결과를 정정할까요?',
        modalMessage:
          '변경할 점수·참가자 기록과 사유를 입력해 주세요. 확정 전까지는 기존 공식 결과가 그대로 유지돼요.',
        modalConfirmLabel: '정정 제출',
        reasonLabel: '정정 사유',
      };
  const readOnly = !canActOnResultReview(game.actorRole);
  const officializeAlwaysVisible = officializeAlwaysAllowed(game.actorRole);
  const showGatedCta = officializeAlwaysVisible || directorGateStatus !== 'disabled';

  async function handleOfficializeCorrection() {
    if (!pendingCorrection) return;
    const ok = await confirm({
      title: entryCopy.confirmTitle,
      // `.home`/`.away` 를 직접 읽으면 백필된 경기(중첩 `{regulation:{…}}` 형태)에서
      // "undefined:undefined로 공식 결과를 확정해요"가 뜬다 — 되돌릴 수 없는 확정
      // 직전에 틀린 문구를 보여준 것과 같은 계열의 사고. lib/game-result-score 참조.
      // 승부차기까지 넣어 읽어준다 — 결선 무승부를 확정하는 자리에서 정규 점수만
      // 보여주면 정작 승자를 가른 값이 확인 문구에서 빠진다.
      message: `${formatGameResultScoreWithPenalties(pendingCorrection.score)}로 공식 결과를 확정해요. ${entryCopy.confirmMessage}`,
      confirmLabel: entryCopy.confirmCta,
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
          tone="warning"
          message="공식 결과가 무효 처리됐어요. 아래에서 결과를 다시 입력하면 새 공식 결과로 확정할 수 있어요."
        />
      ) : null}

      {draftBase && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pendingCorrection ? (
            <>
              <p className="tm-text-label" style={{ fontWeight: 600 }}>
                {entryCopy.pendingTitle}
              </p>
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                {pendingCorrection.reason ? `사유: ${pendingCorrection.reason}` : null}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {showGatedCta ? (
                  <Button variant="primary" size="md" loading={officialize.isPending} onClick={() => void handleOfficializeCorrection()}>
                    {entryCopy.confirmCta}
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="tm-text-label" style={{ fontWeight: 600 }}>{entryCopy.cardTitle}</p>
              <Button variant="primary" size="md" onClick={() => setCorrectionFormOpen(true)}>
                {entryCopy.startCta}
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
          <p className="tm-text-label" style={{ fontWeight: 600, color: 'var(--red700)' }}>
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

      {correctionFormOpen && draftBase && editPrefill ? (
        <ResultEditModal
          open
          title={entryCopy.modalTitle}
          message={entryCopy.modalMessage}
          confirmLabel={entryCopy.modalConfirmLabel}
          reasonLabel={entryCopy.reasonLabel}
          base={{
            score: editPrefill.score,
            participants: editPrefill.resultParticipants,
            mvpParticipantId: editPrefill.mvpParticipantId,
          }}
          sides={game.sides}
          lineups={lineupsQuery.data ?? []}
          // 서버 `applyPenalties` 는 승부차기를 **결선 픽스처 + 정규시간 무승부**에서만
          // 받는다. 폼은 이 값으로 (a) 기존 승부차기 점수를 이어서 보낼지 판정하고
          // (b) 무승부인데 승부차기가 없거나 반대로 승부차기가 남아 못 보내는 상태를
          // 저장 전에 알린다. 내려주지 않으면 결선 경기의 승부차기 결과가 조용히
          // 사라지므로 이 prop 은 필수(기본값 없음)다.
          isKnockoutFixture={game.isKnockoutFixture}
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
                baseRevisionId: draftBase.id,
                reason: input.reason,
                changes: {
                  score: input.score,
                  actualParticipants: input.actualParticipants,
                  eventsHash: editPrefill.eventsHash,
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
