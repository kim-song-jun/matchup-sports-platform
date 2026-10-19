'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1ChangeLeagueState } from '@/hooks/use-v1-api';
import { leagueStateLabel } from '@/lib/v1-status-labels';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminLeagueDetail, V1LeagueStateValue } from '@/types/league-match';

// "지금은 ○○" 문장 — 라벨에 조사를 붙이면 '보류이에요'·'종료이에요'가 된다.
const STATE_NOW: Record<V1LeagueStateValue, string> = {
  draft: '모집완료 상태예요',
  active: '진행 중이에요',
  on_hold: '보류 중이에요',
  completed: '종료됐어요',
};

type StateOption = { state: V1LeagueStateValue; description: string; disabledReason: string | null };

/**
 * 상태마다 고를 수 있는 목표와 막히는 이유. 서버(`changeState`)와 같은 규칙이다 — 화면이 먼저 막아야
 * 눌러 보고 409 를 받는 일이 없다. 최종 판정은 서버가 한다.
 */
export function leagueStateOptions(series: Pick<V1AdminLeagueDetail, 'state' | 'heldFromState' | 'fixtures'>): StateOption[] {
  const { state } = series;
  const liveFixtures = series.fixtures.filter((fixture) => fixture.status !== 'cancelled' && fixture.resultStage !== 'voided');
  const pendingCount = liveFixtures.filter((fixture) => fixture.resultStage !== 'official').length;
  const startedGames = series.fixtures.some((fixture) => fixture.gameState === 'LIVE' || fixture.gameState === 'PAUSED' || fixture.gameState === 'ENDED');
  const holdRestore = series.heldFromState ?? 'draft';
  const reasonFor = (target: V1LeagueStateValue): string | null => {
    if (state === 'on_hold') {
      return target === holdRestore ? null : `보류 중에는 보류 전 상태(${leagueStateLabel(holdRestore)})로만 돌아갈 수 있어요.`;
    }
    switch (target) {
      case 'draft':
        if (state === 'completed') return '종료된 리그는 먼저 진행 중으로 돌린 뒤 바꿀 수 있어요.';
        return startedGames ? '이미 시작한 경기가 있어 시작을 취소할 수 없어요. 멈추려면 보류를 써 주세요.' : null;
      case 'active':
        return null;
      case 'on_hold':
        return state === 'completed' ? '끝난 리그는 보류할 수 없어요.' : null;
      case 'completed':
        if (state !== 'active') return '진행 중인 리그만 종료할 수 있어요.';
        if (liveFixtures.length === 0) return '아직 경기가 없어요.';
        return pendingCount > 0 ? `결과가 확정되지 않은 경기가 ${pendingCount}개 있어요. 확정하거나 취소·삭제한 뒤 종료해 주세요.` : null;
    }
  };
  const describe = (target: V1LeagueStateValue): string => {
    if (state === 'on_hold' && target === holdRestore) return '보류를 풀고 보류 전 상태와 공개 설정으로 돌아가요.';
    switch (target) {
      case 'draft':
        if (state === 'active') return '리그 시작을 취소하고 모집완료로 돌아가요. 대진·참가 팀은 그대로 남고, 참가 신청은 신청 마감 설정을 따라요.';
        // 시작 취소는 기존 신청 마감·정원 설정을 유지한다.
        return '모집완료로 돌아가요. 참가 신청은 별도 신청 마감 설정을 따라요.';
      case 'active':
        return state === 'completed' ? '종료를 풀고 다시 진행 중으로 돌려요. 남은 경기가 모두 확정되면(총 경기 수를 정했으면 그 수를 채우면) 다시 자동으로 종료돼요.' : '리그를 시작해요.';
      case 'on_hold':
        return '리그와 경기가 공개 화면에서 숨겨져요. 대진·결과·참가 팀은 그대로 남아요.';
      case 'completed':
        return '리그를 끝내요. 지금 순위표가 최종 순위가 되고, 필요하면 다시 진행 중으로 돌릴 수 있어요.';
    }
  };
  return (['draft', 'active', 'on_hold', 'completed'] as const)
    .filter((target) => target !== state)
    .map((target) => ({ state: target, description: describe(target), disabledReason: reasonFor(target) }));
}

/** 리그 상태를 한 곳에서 바꾼다 — 예전에는 보류 카드·되돌리기·종료 버튼이 상황마다 따로 나타났다. */
export function LeagueStateModal({
  leagueId,
  startOnly = false,
  series,
  onClose,
  showToast,
}: {
  leagueId: string;
  startOnly?: boolean;
  series: Pick<V1AdminLeagueDetail, 'state' | 'heldFromState' | 'fixtures' | 'lifecycleStatus'>;
  onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const reasonId = useId();
  const changeState = useV1ChangeLeagueState(leagueId);
  const options = leagueStateOptions(series).filter((option) => !startOnly || option.state === 'active');
  const [target, setTarget] = useState<V1LeagueStateValue | null>(options.find((option) => option.disabledReason === null)?.state ?? null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open: true, onClose, pending: changeState.isPending });
  const reasonRequired = target === 'on_hold';
  const targetLabel = leagueStateLabel;
  const canSubmit = target !== null && (!reasonRequired || reason.trim().length > 0);

  const submit = () => {
    if (!canSubmit || target === null) return;
    setError(null);
    changeState.mutate(
      { state: target, reason: reason.trim() || undefined },
      {
        onSuccess: (result) => {
          showToast(result.alreadyProcessed ? `이미 ${targetLabel(result.state)} 상태예요.` : `리그를 ${targetLabel(result.state)} 상태로 바꿨어요.`, 'success');
          onClose();
        },
        onError: (err) => setError(extractErrorMessage(err, '리그 상태를 바꾸지 못했어요.')),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4" onClick={onBackdropClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={startOnly ? '리그 시작하기' : '상태 변경'}
        className="flex max-h-[90vh] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-[var(--card-surface)] p-5 sm:rounded-2xl"
      >
        <div>
          <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{startOnly ? '리그를 시작할까요?' : '상태 변경'}</h2>
          <p className="mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">지금은 {STATE_NOW[series.state]}.</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">바꿀 상태</legend>
          {options.map((option) => {
            const disabled = option.disabledReason !== null;
            return (
              <label
                key={option.state}
                className={[
                  'flex min-h-[var(--size-touch-min)] items-start gap-3 rounded-xl border px-3 py-3',
                  target === option.state ? 'border-blue-500 bg-[var(--blue50)]' : 'border-[var(--border)]',
                  disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="league-state"
                  value={option.state}
                  checked={target === option.state}
                  disabled={disabled || changeState.isPending}
                  onChange={() => setTarget(option.state)}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <span className="min-w-0">
                  <span className="block text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                    {series.state === 'on_hold' && !disabled ? `보류 해제 → ${targetLabel(option.state)}` : option.state === 'draft' && series.state === 'active' ? `시작 취소 → ${targetLabel(option.state)}` : targetLabel(option.state)}
                  </span>
                  <span className="mt-0.5 block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                    {option.disabledReason ?? option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div>
          <label htmlFor={reasonId} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
            사유 {reasonRequired ? '(필수)' : '(선택)'}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
            disabled={changeState.isPending}
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 py-2 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        {error ? (
          <p role="alert" className="text-[length:var(--font-size-label)] font-medium text-[var(--red700)]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" block onClick={onClose} disabled={changeState.isPending}>
            취소
          </Button>
          <Button variant="primary" block onClick={submit} disabled={!canSubmit} loading={changeState.isPending}>
            {startOnly ? '리그 시작하기' : '바꾸기'}
          </Button>
        </div>
      </div>
    </div>
  );
}
