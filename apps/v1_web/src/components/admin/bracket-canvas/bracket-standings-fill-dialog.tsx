'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1FillSlotsFromStandings, useV1SlotStandingsPreview } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import type { V1FillSlotsFromStandingsResult, V1SlotStandingsPreviewRow } from '@/types/bracket-standings-fill';

const BADGE = 'inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)]';

function StateBadge({ state }: { state: V1SlotStandingsPreviewRow['state'] }) {
  if (state === 'ready') return <span className={BADGE}><Check size={12} aria-hidden="true" />순위 확정</span>;
  if (state === 'tied') return <span className={BADGE}><AlertTriangle size={12} aria-hidden="true" />동률</span>;
  return <span className={BADGE}><Clock size={12} aria-hidden="true" />경기 진행 중</span>;
}

export function BracketStandingsFillDialog({
  open,
  tournamentId,
  teamNames,
  onClose,
  onFilled,
  onError,
}: {
  open: boolean;
  tournamentId: string;
  teamNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onFilled?: (result: V1FillSlotsFromStandingsResult) => void;
  onError?: (message: string) => void;
}) {
  const titleId = useId();
  const preview = useV1SlotStandingsPreview(tournamentId, open);
  const fill = useV1FillSlotsFromStandings(tournamentId);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = fill.isPending;
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending });

  useEffect(() => {
    if (open) {
      setPicks({});
      setError(null);
    }
  }, [open]);

  const rows = useMemo(() => preview.data?.slots ?? [], [preview.data]);
  const tiedRows = rows.filter((r) => r.state === 'tied');
  const targetOf = (r: V1SlotStandingsPreviewRow) => picks[r.slotId] ?? (r.state === 'ready' ? r.candidateRegistrationId : null);
  const hasFillable = rows.some((r) => r.state !== 'group_incomplete');
  const unresolvedTied = tiedRows.some((r) => !picks[r.slotId]);
  const changes = rows.filter((r) => {
    const target = targetOf(r);
    return target !== null && target !== r.currentRegistrationId;
  });
  const nameOf = (registrationId: string) => teamNames.get(registrationId) ?? '이름을 알 수 없는 팀';

  let blockedReason: string | null = null;
  if (preview.isSuccess) {
    if (rows.length === 0) blockedReason = '채울 순위 자리가 없어요.';
    else if (!hasFillable) blockedReason = '아직 채울 수 있는 자리가 없어요. 조별 경기가 모두 끝나야 해요.';
    else if (unresolvedTied) blockedReason = '동률인 자리는 팀을 골라야 채울 수 있어요.';
    else if (changes.length === 0) blockedReason = '바꿀 자리가 없어요. 이미 순위대로 채워져 있어요.';
  }
  const canSubmit = preview.isSuccess && blockedReason === null && !pending;

  async function handleSubmit() {
    const overrides = tiedRows.map((r) => ({ slotId: r.slotId, registrationId: picks[r.slotId] }));
    try {
      const result = await fill.mutateAsync(overrides.length > 0 ? { overrides } : {});
      onFilled?.(result);
      onClose();
    } catch (err) {
      const message = describeBracketCanvasError(err, '순위대로 채우지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      setError(message);
      onError?.(message);
    }
  }

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-[var(--card-surface)] tm-modal-panel${closing ? ' is-closing' : ''}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">순위대로 채우기</h2>
          <button
            type="button"
            aria-label="닫기"
            disabled={pending}
            onClick={onClose}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {preview.isPending ? (
            <p role="status" className="text-[length:var(--font-size-body)] text-[var(--text-muted)]">순위를 불러오고 있어요…</p>
          ) : preview.isError ? (
            <ErrorState message="순위를 불러오지 못했어요." onRetry={() => void preview.refetch()} />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const selectId = `${titleId}-${r.slotId}`;
                const currentName = r.currentRegistrationId ? nameOf(r.currentRegistrationId) : null;
                return (
                  <li key={r.slotId} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">{r.label}</span>
                      <StateBadge state={r.state} />
                    </div>
                    {r.state === 'ready' ? (
                      <>
                        <p className="text-[length:var(--font-size-body)] text-[var(--text-strong)]">{r.candidateTeamName ?? (r.candidateRegistrationId ? nameOf(r.candidateRegistrationId) : '')}</p>
                        {r.currentRegistrationId === r.candidateRegistrationId ? (
                          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">이미 들어 있어요</p>
                        ) : currentName ? (
                          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">지금은 {currentName}이(가) 들어 있어요. 채우면 바뀌어요.</p>
                        ) : null}
                      </>
                    ) : null}
                    {r.state === 'tied' ? (
                      <div className="flex flex-col gap-2">
                        <label htmlFor={selectId} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{r.label} 직접 고르기</label>
                        <select
                          id={selectId}
                          value={picks[r.slotId] ?? ''}
                          disabled={pending}
                          onChange={(e) => setPicks((prev) => {
                            const next = { ...prev };
                            if (e.target.value === '') delete next[r.slotId];
                            else next[r.slotId] = e.target.value;
                            return next;
                          })}
                          className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body)] text-[var(--text-strong)] transition-colors focus:border-[var(--blue500)] focus:outline-none disabled:opacity-50"
                        >
                          <option value="">팀 선택</option>
                          {r.tiedRegistrationIds.map((id) => (
                            <option key={id} value={id} disabled={Object.entries(picks).some(([slotId, picked]) => slotId !== r.slotId && picked === id)}>
                              {nameOf(id)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {r.state === 'group_incomplete' ? (
                      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">조별 경기가 아직 안 끝났어요. 모두 끝나면 채울 수 있어요.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] px-5 py-4">
          {error ? (
            <p role="alert" className="rounded-xl bg-[var(--red50)] px-3 py-3 text-[length:var(--font-size-caption)] text-[var(--red700)]">{error}</p>
          ) : null}
          {blockedReason ? <p aria-live="polite" className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{blockedReason}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="h-[48px] flex-1 rounded-xl bg-[var(--surface-soft)] text-[length:var(--font-size-body)] font-semibold text-[var(--text-muted)] transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className={`h-[48px] flex-1 rounded-xl text-[length:var(--font-size-body)] font-semibold transition-colors ${
                canSubmit ? 'bg-blue-500 text-white hover:bg-blue-600' : 'cursor-not-allowed bg-[var(--grey100)] text-[var(--text-caption)]'
              }`}
            >
              {pending ? '채우는 중…' : '순위대로 채우기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
