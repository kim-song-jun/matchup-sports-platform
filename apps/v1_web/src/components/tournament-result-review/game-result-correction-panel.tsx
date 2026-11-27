'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useCorrectOfficialEventTime,
  useCreateResultCorrection,
  useGameResultRevisions,
  useOfficializeResultRevision,
  useTournamentGame,
  useVoidResultRevision,
} from '@/hooks/use-tournament-result-review';
import { useV1GameLineups } from '@/hooks/use-v1-api';
import { useV1GameEventsBackfill } from '@/hooks/use-v1-game-operations';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { Button } from '@/components/v1-ui/button';
import { formatGameResultScoreWithPenalties, readGameResultScore } from '@/lib/game-result-score';
import { deriveEditableGoalEvents } from '@/lib/result-goal-events';
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
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { EventTimeCorrectionSheet, RecordedEventList, eventTimeSummary, eventTypeLabel, periodLabel as periodNameOf, regularPeriodCountOf } from '@/shared/game-operations';
import { collectEventTimeCorrections, eventTimeCorrectionErrorMessage } from '@/lib/event-time-correction';
import { SECOND_YELLOW_RED_LABEL } from '@/lib/second-yellow-red';
import type { GameEventRecord } from '@/types/game-operations';
import { josa } from '@/lib/korean';

type DirectorGateStatus = 'unknown' | 'enabled' | 'disabled';
type CorrectionSnapshot = {
  expectedVersion: number;
  baseRevisionId: string;
  eventsHash: string;
};

type PrefillRevision = NonNullable<ReturnType<typeof useGameResultRevisions>['data']>[number];

/**
 * Form seed for editing the pointer revision. A VOID revision carries no participants, so an official void is seeded
 * from the OFFICIAL revision it voided. A VOID that replaced anything else (an unconfirmed result discarded by a
 * team change) is result-less on purpose: its predecessor belongs to the replaced team, so the pointer itself seeds
 * an empty form.
 */
function resolveEditPrefill(
  currentOfficial: PrefillRevision | null,
  voidPointer: PrefillRevision | null,
  revisions: PrefillRevision[],
): PrefillRevision | null {
  if (currentOfficial !== null) return currentOfficial;
  if (voidPointer === null) return null;
  const voided = revisions.find((revision) => revision.id === voidPointer.supersedesId);
  return voided !== undefined && voided.state === 'OFFICIAL' ? voided : voidPointer;
}

/**
 * GameResultCorrectionPanel -- the results screen's per-game surface for an
 * already-confirmed result (fix, re-enter after void, void). Drives `POST /games/:gameId/corrections` (create),
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
  inline = false,
  autoOpen = false,
  isRegularLeague = false,
  onSaved,
}: {
  gameId: string;
  tournamentId?: string;
  inline?: boolean;
  autoOpen?: boolean;
  isRegularLeague?: boolean;
  onSaved?: () => void;
}) {
  const gameQuery = useTournamentGame(gameId);
  const revisionsQuery = useGameResultRevisions(gameId);
  // 정정 폼의 참가자 실명 표시용 -- 로딩 중/실패 시 빈 배열로 두면 모달이 기존
  // 폴백(사이드 + id 뒷자리)으로 얌전히 물러난다(아래 lineups prop 참고).
  const lineupsQuery = useV1GameLineups(gameId);
  const eventsQuery = useV1GameEventsBackfill(gameId, 0);
  const createCorrection = useCreateResultCorrection(gameId, tournamentId);
  const officialize = useOfficializeResultRevision(gameId, tournamentId);
  const voidRevision = useVoidResultRevision(gameId, tournamentId);
  const correctEventTime = useCorrectOfficialEventTime(gameId, tournamentId);
  // MD-QA #187: 확정된 결과의 사건 시각 정정 시트 대상.
  const [timeTarget, setTimeTarget] = useState<GameEventRecord | null>(null);
  // 경고 누적 퇴장 합친 줄의 정정이면 `timeTarget` 은 레드이고 여기에 함께 옮길 두 번째 옐로가 들어 있다(아니면 빈 배열).
  const [timeLinked, setTimeLinked] = useState<readonly GameEventRecord[]>([]);
  const { confirm, ConfirmModal: officializeConfirmModal } = useConfirm();

  const [correctionFormOpen, setCorrectionFormOpen] = useState(autoOpen);
  const [correctionSnapshot, setCorrectionSnapshot] = useState<CorrectionSnapshot | null>(null);
  const [voidRequested, setVoidRequested] = useState(false);
  const [directorGateStatus, setDirectorGateStatus] = useState<DirectorGateStatus>('unknown');
  const startCorrectionButtonRef = useRef<HTMLButtonElement>(null);
  const confirmCorrectionButtonRef = useRef<HTMLButtonElement>(null);
  const inlinePanelTitleRef = useRef<HTMLHeadingElement>(null);
  const restoreInlineFocusRef = useRef(false);
  const inlineFocusTargetRef = useRef<'start' | 'confirm' | 'title'>('start');
  const [inlineFocusRestoreNonce, setInlineFocusRestoreNonce] = useState(0);

  useEffect(() => {
    if (!inline || correctionFormOpen || !restoreInlineFocusRef.current) return;
    restoreInlineFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const target = inlineFocusTargetRef.current === 'title'
        ? inlinePanelTitleRef.current
        : inlineFocusTargetRef.current === 'confirm'
          ? confirmCorrectionButtonRef.current ?? inlinePanelTitleRef.current
          : startCorrectionButtonRef.current ?? inlinePanelTitleRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [correctionFormOpen, inline, inlineFocusRestoreNonce]);

  useEffect(() => {
    if (!correctionFormOpen || correctionSnapshot !== null) return;
    const game = gameQuery.data;
    const revisions = revisionsQuery.data;
    if (!game || revisions === undefined) return;
    const currentPointerRevision =
      revisions.find((revision) => revision.id === game.currentOfficialRevisionId) ?? null;
    const currentOfficial =
      currentPointerRevision && currentPointerRevision.state === 'OFFICIAL' ? currentPointerRevision : null;
    const isVoided = currentPointerRevision?.state === 'VOID';
    const draftBase = currentOfficial ?? (isVoided ? currentPointerRevision : null);
    const editPrefill = resolveEditPrefill(currentOfficial, isVoided ? currentPointerRevision : null, revisions);
    if (!draftBase || !editPrefill) return;
    setCorrectionSnapshot({
      expectedVersion: game.version,
      baseRevisionId: draftBase.id,
      eventsHash: editPrefill.eventsHash,
    });
  }, [correctionFormOpen, correctionSnapshot, gameQuery.data, revisionsQuery.data]);

  if (gameQuery.isPending || revisionsQuery.isPending) {
    // 텍스트 한 줄이면 로드가 끝나는 순간 레이아웃이 통째로 튀어나온다 — 같은 화면의
    // 다른 패널과 같이 스켈레톤으로 자리를 먼저 잡는다.
    return <AdminListSkeleton rows={4} />;
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
  const editPrefill = resolveEditPrefill(currentOfficial, isVoided ? currentPointerRevision : null, revisions);
  const pendingCorrection =
    draftBase
      ? revisions.find(
          (revision) => revision.state === 'DRAFT' && revision.supersedesId === draftBase.id,
        ) ?? null
      : null;
  const pendingScore = pendingCorrection === null ? null : readGameResultScore(pendingCorrection.score);
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
        submitHint: '제출한 뒤 결과 확정을 눌러야 순위표에 반영돼요.',
        reasonLabel: '재입력 사유',
      }
    : {
        cardTitle: '공식 결과를 고쳐요',
        startCta: '결과 고치기',
        pendingTitle: '고친 결과가 확정을 기다려요',
        confirmCta: pendingScore === null ? '결과 확정' : `${josa(`${pendingScore.home} : ${pendingScore.away}`, ['으로', '로'])} 결과 확정`,
        confirmTitle: '고친 결과를 확정할까요?',
        confirmMessage: '확정 전 이유와 바뀐 내용을 다시 살펴봐 주세요.',
        modalTitle: '결과를 고칠까요?',
        modalMessage:
          '변경할 점수·참가자 기록과 사유를 입력해 주세요. 확정 전까지는 기존 공식 결과가 그대로 유지돼요.',
        modalConfirmLabel: '고친 내용 저장',
        submitHint: '저장한 뒤 결과 확정을 눌러야 순위표에 반영돼요.',
        reasonLabel: '고친 이유',
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
      message: `${josa(formatGameResultScoreWithPenalties(pendingCorrection.score), ['으로', '로'])} 공식 결과를 확정해요. ${entryCopy.confirmMessage}`,
      confirmLabel: '결과 확정',
    });
    if (!ok) return;
    officialize.mutate(
      {
        revisionId: pendingCorrection.id,
        expectedVersion: game.version,
        score: pendingCorrection.score,
        goalEvents: pendingCorrection.goalEvents,
        eventsHash: pendingCorrection.eventsHash,
        mvpParticipantId: pendingCorrection.mvpParticipantId,
      },
      {
        onSuccess: () => {
          if (inline) {
            // Confirmation refreshes the revision list and removes the pending CTA. Bump a
            // separate focus effect key so that refresh cannot leave focus on document.body.
            restoreInlineFocusRef.current = true;
            inlineFocusTargetRef.current = 'title';
            setInlineFocusRestoreNonce((value) => value + 1);
          }
          setDirectorGateStatus('enabled');
          onSaved?.();
        },
        onError: (error) => {
          if (isDirectorOfficializeDisabledError(error)) setDirectorGateStatus('disabled');
        },
      },
    );
  }

  const renderCorrectionEditor = () => {
    if (!correctionFormOpen || !draftBase || !editPrefill) return null;
    // The editor seeds once: opening before the log arrives would erase existing card times on save.
    if (eventsQuery.isPending) return <p role="status" className="tm-text-caption">기존 경기 기록을 불러오고 있어요.</p>;
    if (eventsQuery.isError) return <ErrorState title="경기 기록을 불러오지 못했어요" message={describeResultReviewError(eventsQuery.error)} onRetry={() => void eventsQuery.refetch()} />;
    const baseGoalEvents = deriveEditableGoalEvents(editPrefill.goalEvents, eventsQuery.data?.events ?? []);
    return (
      <ResultEditModal
        open
        title={entryCopy.modalTitle}
        message={entryCopy.modalMessage}
        confirmLabel={entryCopy.modalConfirmLabel}
        submitHint={entryCopy.submitHint}
        reasonLabel={entryCopy.reasonLabel}
        base={{
          score: editPrefill.score,
          goalEvents: baseGoalEvents,
          participants: editPrefill.resultParticipants,
          mvpParticipantId: editPrefill.mvpParticipantId,
        }}
        sides={game.sides}
        lineups={lineupsQuery.data ?? []}
        events={eventsQuery.data?.events ?? []}
        periods={game.periods}
        periodCount={regularPeriodCountOf(game.periods.length, game.periodDurations)}
        isKnockoutFixture={game.isKnockoutFixture}
        presentation={inline ? 'inline' : 'modal'}
        submitting={createCorrection.isPending}
        errorMessage={createCorrection.isError ? describeResultReviewError(createCorrection.error) : null}
        onCancel={() => {
          setCorrectionFormOpen(false);
          setCorrectionSnapshot(null);
          createCorrection.reset();
        }}
        onConfirm={(input: ResultEditSubmitInput) => {
          if (correctionSnapshot === null) return;
          createCorrection.mutate(
            {
              expectedVersion: correctionSnapshot.expectedVersion,
              baseRevisionId: correctionSnapshot.baseRevisionId,
              reason: input.reason,
              changes: {
                score: input.score,
                // 점수만 있는 결과는 모달이 goalEvents 를 생략한다(서버가 기존 상태 유지, MD-QA #94·#95).
                goalEvents: input.goalEvents,
                actualParticipants: input.actualParticipants,
                eventsHash: correctionSnapshot.eventsHash,
                mvpParticipantId: input.mvpParticipantId,
              },
            },
            { onSuccess: () => {
                if (inline) {
                  // The parent refreshes the revisions immediately after this callback. The
                  // pending CTA can therefore mount, receive focus, and unmount in the same
                  // update. Focus the persistent panel title so the successful submission
                  // retains a stable, meaningful target across that refresh.
                  restoreInlineFocusRef.current = true;
                  inlineFocusTargetRef.current = 'title';
                }
                setCorrectionFormOpen(false);
                setCorrectionSnapshot(null);
                onSaved?.();
              } },
          );
        }}
      />
    );
  };

  return (
    <div
      className="[--button-fill-primary:var(--static-blue)] [--button-fill-primary-hover:color-mix(in_srgb,var(--static-blue)_88%,var(--static-black))]"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {inline ? (
        <h2
          ref={inlinePanelTitleRef}
          tabIndex={-1}
          className="sr-only"
          style={{ outline: 'none' }}
        >
          경기 결과 고치기
        </h2>
      ) : null}
      <GameSummaryHeader game={game} currentRevision={currentPointerRevision} />

      {readOnly ? (
        <AlertBanner tone="info" message="이 화면에서는 결과를 볼 수만 있어요. 결과를 고치거나 무효로 만들 권한이 없어요." />
      ) : null}

      {!currentPointerRevision ? (
        <AlertBanner tone="info" message="확정된 결과가 없어서 고칠 수 없어요." />
      ) : null}

      {isVoided ? (
        <AlertBanner
          tone="warning"
          message="공식 결과가 무효 처리됐어요. 아래에서 결과를 다시 입력하면 새 공식 결과로 확정할 수 있어요."
        />
      ) : null}

      {inline && correctionFormOpen && !readOnly ? renderCorrectionEditor() : null}

      {(!inline || !correctionFormOpen) && draftBase && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  <Button
                    ref={confirmCorrectionButtonRef}
                    variant="primary"
                    size="md"
                    className="self-start"
                    loading={officialize.isPending}
                    onClick={() => void handleOfficializeCorrection()}
                  >
                    {entryCopy.confirmCta}
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="tm-text-label" style={{ fontWeight: 600 }}>{entryCopy.cardTitle}</p>
              <Button
                ref={startCorrectionButtonRef}
                variant="primary"
                size="md"
                className="self-start"
                onClick={() => {
                  if (draftBase === null || editPrefill === null) return;
                  if (inline) {
                    restoreInlineFocusRef.current = true;
                    inlineFocusTargetRef.current = 'start';
                  }
                  setCorrectionSnapshot({
                    expectedVersion: game.version,
                    baseRevisionId: draftBase.id,
                    eventsHash: editPrefill.eventsHash,
                  });
                  setCorrectionFormOpen(true);
                }}
              >
                {entryCopy.startCta}
              </Button>
            </>
          )}
          {!officializeAlwaysVisible && directorGateStatus === 'disabled' ? (
            <>
              <AlertBanner tone="warning" message="결과 확정·무효화 기능이 아직 활성화되지 않았어요. 플랫폼 운영팀에 문의해 주세요." />
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

      {(!inline || !correctionFormOpen) && currentOfficial && !readOnly ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="tm-text-label" style={{ fontWeight: 600, color: 'var(--red700)' }}>
            공식 결과 무효화
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            {isRegularLeague
              ? '무효화하면 이 경기의 공식 점수·기록이 취소되고 리그 순위·전적 집계에서 빠져요.'
              : '무효화하면 이 경기의 공식 점수·기록이 모두 취소되고, 다음 라운드 진행에도 영향을 줄 수 있어요.'}
          </p>
          {showGatedCta ? (
            <Button
              variant="outline"
              size="md"
              className="self-start"
              style={{ color: 'var(--red700)' }}
              onClick={() => setVoidRequested(true)}
            >
              무효화
            </Button>
          ) : null}
        </div>
      ) : null}

      {currentOfficial && game.actorRole === 'platform_ops' && !(inline && correctionFormOpen) ? (
        <div className="tm-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="tm-text-label" style={{ fontWeight: 600 }}>기록 시각 고치기</p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            골·카드·파울·교체가 기록된 시각만 고쳐요. 점수와 카드 수는 바뀌지 않아요. 골·카드는 공개 화면과 결과 변경 이력에도 남아요.
          </p>
          {eventsQuery.isPending ? (
            <AdminListSkeleton rows={2} />
          ) : eventsQuery.isError ? (
            <ErrorState
              title="경기 기록을 불러오지 못했어요"
              message={describeResultReviewError(eventsQuery.error)}
              onRetry={() => void eventsQuery.refetch()}
            />
          ) : (
            <RecordedEventList
              events={eventsQuery.data?.events ?? []}
              sides={game.sides}
              lineups={lineupsQuery.data ?? []}
              periodCount={regularPeriodCountOf(game.periods.length, game.periodDurations)}
              onEditEvent={(event, linkedEvents) => {
                correctEventTime.reset();
                setTimeTarget(event);
                setTimeLinked(linkedEvents ?? []);
              }}
            />
          )}
        </div>
      ) : null}

      <div>
        <p className="tm-text-label" style={{ fontWeight: 600, marginBottom: 8 }}>처리 이력</p>
        <RevisionTimeline revisions={revisions} />
      </div>

      {officializeConfirmModal}

      {timeTarget !== null ? (
        <EventTimeCorrectionSheet
          open
          mode="admin"
          title="기록 시각 고치기"
          summary={[timeLinked.length > 0 ? SECOND_YELLOW_RED_LABEL : eventTypeLabel(timeTarget), eventTimeSummary(timeTarget, game.sides, lineupsQuery.data ?? [], '')].filter((part) => part.length > 0).join(' · ')}
          linkedNotice={timeLinked.length > 0 ? '옐로카드와 레드카드가 함께 옮겨져요.' : undefined}
          periodLabel={periodNameOf(timeTarget.period, regularPeriodCountOf(game.periods.length, game.periodDurations))}
          currentClockMs={
            collectEventTimeCorrections(eventsQuery.data?.events ?? []).get(timeTarget.id)?.currentClockMs ??
            timeTarget.clockMs
          }
          // 확정된 경기의 피리어드 상세에는 실제 경과 시간이 없어 상한을 클라이언트가 단정하지 않는다.
          // 추가 시간에 기록된 사건이 설정 길이 밖일 수 있어서다 — 범위 판정은 서버가 한다(EVENT_CLOCK_OUT_OF_RANGE).
          maxClockMs={null}
          onSubmit={async ({ clockMs, reason }) => {
            if (timeLinked.length === 0) {
              await correctEventTime.mutateAsync({
                eventId: timeTarget.id,
                expectedVersion: game.version,
                clockMs,
                reason,
              });
              onSaved?.();
              return;
            }
            // 합친 줄은 옐로, 이어서 레드를 같은 시각·같은 사유로 옮긴다(저장은 이벤트마다 따로라 두 번 부른다). 정정마다
            // 경기 버전이 올라가므로 두 번째는 첫 호출이 돌려준 버전을 쓴다. 이미 그 시각인 기록은 건너뛴다 — 앞 호출만
            // 성공하고 멈춘 뒤 다시 정정해도 레드만 옮겨지도록.
            const corrections = collectEventTimeCorrections(eventsQuery.data?.events ?? []);
            const targets = [...timeLinked, timeTarget].filter(
              (event) => (corrections.get(event.id)?.currentClockMs ?? event.clockMs) !== clockMs,
            );
            let version = game.version;
            for (const [index, event] of targets.entries()) {
              try {
                const result = await correctEventTime.mutateAsync({ eventId: event.id, expectedVersion: version, clockMs, reason });
                version = result.version;
              } catch (err) {
                // 부모의 저장 완료 알림(`onSaved`)은 둘 다 성공했을 때만 보낸다 — 여기서 부르면 오류를 읽기 전에 닫힐 수 있다.
                // 옐로 정정은 이미 저장됐고, 화면 데이터는 mutation 의 onSuccess 가 다시 읽는다.
                if (index === 0) throw err;
                throw new Error(
                  `옐로카드 시각은 옮겼지만 레드카드 시각은 못 옮겼어요. ${eventTimeCorrectionErrorMessage(err)} 다시 고치면 레드카드만 옮겨요.`,
                );
              }
            }
            onSaved?.();
          }}
          onClose={() => {
            setTimeTarget(null);
            setTimeLinked([]);
          }}
        />
      ) : null}

      {!inline && correctionFormOpen && !readOnly ? renderCorrectionEditor() : null}

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
                onSaved?.();
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
