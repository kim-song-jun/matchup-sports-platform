'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ReasonModal } from '@/components/tournament-result-review/reason-modal';
import { REVISION_STATE_LABELS } from '@/components/tournament-result-review/result-review-copy';
import {
  useCreateResultCorrection,
  useGameResultRevisions,
  useOfficializeResultRevision,
  useVoidResultRevision,
} from '@/hooks/use-tournament-result-review';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { mergeCorrectionScore, toCorrectionParticipants } from '@/lib/bracket-quick-score';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';
import type { V1AdminBracketFixtureGame, V1QuickResultScore } from '@/types/api';
import { BracketQuickResultForm } from './bracket-quick-result-form';

export type BracketResultActionsProps = {
  tournamentId: string;
  fixtureId: string;
  game: V1AdminBracketFixtureGame;
  isKnockout: boolean;
  homeLabel: string;
  awayLabel: string;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

type Step = 'idle' | 'form' | 'reason' | 'void';

export function BracketResultActions({
  tournamentId,
  fixtureId,
  game,
  isKnockout,
  homeLabel,
  awayLabel,
  canWrite,
  showToast,
}: BracketResultActionsProps) {
  const revisionsQuery = useGameResultRevisions(game.id);
  const createCorrection = useCreateResultCorrection(game.id, tournamentId);
  const officialize = useOfficializeResultRevision(game.id, tournamentId);
  const voidRevision = useVoidResultRevision(game.id, tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [step, setStep] = useState<Step>('idle');
  const [draftScore, setDraftScore] = useState<V1QuickResultScore | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = game.latestRevision;
  if (latest === null) return null;

  const correctionsHref = `/admin/live/${encodeURIComponent(tournamentId)}/records/corrections?fixtureId=${encodeURIComponent(fixtureId)}`;
  const isOfficial = latest.state === 'OFFICIAL';
  const summary = `${REVISION_STATE_LABELS[latest.state]} · ${formatGameResultScoreWithPenalties(latest.score)}`;

  const runCorrection = async (score: V1QuickResultScore, reason: string) => {
    const base = revisionsQuery.data?.find((candidate) => candidate.id === latest.id);
    if (base === undefined) {
      setModalError('결과 정보를 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    setBusy(true);
    setModalError(null);
    let created: Awaited<ReturnType<typeof createCorrection.mutateAsync>>;
    try {
      created = await createCorrection.mutateAsync({
        expectedVersion: game.version,
        baseRevisionId: base.id,
        reason,
        changes: {
          score: mergeCorrectionScore(base.score, score),
          actualParticipants: toCorrectionParticipants(base.resultParticipants),
          eventsHash: base.eventsHash,
          ...(base.mvpParticipantId === null ? {} : { mvpParticipantId: base.mvpParticipantId }),
        },
      });
    } catch (error) {
      setModalError(describeBracketCanvasError(error, '점수를 고치지 못했어요.'));
      setBusy(false);
      return;
    }
    try {
      // 확정 해시는 서버가 저장한 초안 그대로여야 한다 — 방금 입력한 값이 아니라 다시 읽은 값을 쓴다.
      const fresh = await revisionsQuery.refetch();
      const draft = fresh.data?.find((candidate) => candidate.id === created.revisionId);
      if (draft === undefined) throw new Error('draft revision missing');
      await officialize.mutateAsync({
        revisionId: draft.id,
        expectedVersion: created.version,
        score: draft.score,
        goalEvents: draft.goalEvents,
        eventsHash: draft.eventsHash,
        mvpParticipantId: draft.mvpParticipantId,
      });
      setStep('idle');
      showToast('점수를 고쳤어요.', 'success');
    } catch (error) {
      setModalError(`${describeBracketCanvasError(error, '정정을 확정하지 못했어요.')} 정정 초안은 남아 있어요. 칸의 "결과 확정"이나 결과 정정 화면에서 이어서 처리해 주세요.`);
    } finally {
      setBusy(false);
    }
  };

  const runVoid = async (reason: string) => {
    setBusy(true);
    setModalError(null);
    try {
      await voidRevision.mutateAsync({ revisionId: latest.id, expectedVersion: game.version, reason });
      setStep('idle');
      showToast('결과를 무효로 처리했어요.', 'success');
    } catch (error) {
      setModalError(describeBracketCanvasError(error, '결과를 무효로 처리하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    // 되돌릴 수 없는 확정이라 캐시를 믿지 않고 다시 읽은 값을 확인 문구와 요청에 함께 쓴다.
    const fresh = await revisionsQuery.refetch();
    const revision = fresh.data?.find((candidate) => candidate.id === latest.id);
    if (revision === undefined) {
      showToast('결과 정보를 찾지 못했어요. 화면을 새로고침해 주세요.', 'error');
      return;
    }
    const ok = await confirm({
      title: '결과를 확정할까요?',
      message: `${formatGameResultScoreWithPenalties(revision.score)} 결과를 공식 결과로 확정해요. 확정 후에는 정정 절차로만 바꿀 수 있어요.`,
      confirmLabel: '확정',
    });
    if (!ok) return;
    try {
      await officialize.mutateAsync({
        revisionId: revision.id,
        expectedVersion: game.version,
        score: revision.score,
        goalEvents: revision.goalEvents,
        eventsHash: revision.eventsHash,
        mvpParticipantId: revision.mvpParticipantId,
      });
      showToast('결과를 확정했어요.', 'success');
    } catch (error) {
      showToast(describeBracketCanvasError(error, '결과를 확정하지 못했어요.'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
        {summary}
      </p>

      {game.hasLiveRecords ? (
        <>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            라이브로 득점이 기록된 경기예요. 결과 정정 화면에서 고쳐 주세요.
          </p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline self-start">
            결과 정정 화면 열기
          </Link>
        </>
      ) : null}

      {!game.hasLiveRecords && canWrite && step === 'idle' ? (
        isOfficial ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="md" disabled={revisionsQuery.isPending} onClick={() => setStep('form')}>
              점수 고치기
            </Button>
            <Button variant="outline" size="md" style={{ color: 'var(--red700)' }} onClick={() => { setModalError(null); setStep('void'); }}>
              결과 무효
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Button variant="primary" size="md" loading={officialize.isPending} onClick={() => void confirmPending()}>
              결과 확정
            </Button>
            <Link href={correctionsHref} className="tm-text-caption underline" style={{ color: 'var(--text-muted)' }}>
              결과 정정 화면에서 정리하기
            </Link>
          </div>
        )
      ) : null}

      {canWrite && (step === 'form' || step === 'reason') ? (
        <BracketQuickResultForm
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          isKnockout={isKnockout}
          initial={latest.score ?? undefined}
          submitLabel="고칠 점수 확인"
          pending={false}
          onSubmit={(score) => {
            setDraftScore(score);
            setModalError(null);
            setStep('reason');
          }}
          onCancel={() => setStep('idle')}
        />
      ) : null}

      <ReasonModal
        open={step === 'reason'}
        title="점수를 고칠까요?"
        message={`${draftScore === null ? '' : formatGameResultScoreWithPenalties(draftScore)}로 고쳐요. 사유를 남겨 주세요.`}
        reasonLabel="정정 사유"
        confirmLabel="정정 확정"
        submitting={busy}
        errorMessage={modalError}
        onCancel={() => setStep('form')}
        onConfirm={(reason) => draftScore !== null && void runCorrection(draftScore, reason)}
      />
      <ReasonModal
        open={step === 'void'}
        title="결과를 무효로 처리할까요?"
        message="무효로 처리하면 이 경기의 공식 점수와 기록이 취소돼요. 사유를 남겨 주세요."
        reasonLabel="무효 사유"
        confirmLabel="무효로 처리"
        tone="danger"
        submitting={busy}
        errorMessage={modalError}
        onCancel={() => setStep('idle')}
        onConfirm={(reason) => void runVoid(reason)}
      />
      {ConfirmModal}
    </div>
  );
}
