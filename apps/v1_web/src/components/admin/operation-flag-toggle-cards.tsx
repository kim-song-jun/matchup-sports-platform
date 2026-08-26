'use client';

import { useState } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { useV1OperationFlag, useV1SimplifiedToggleOperationFlag } from '@/hooks/use-v1-api';
import { GateConfirmModal } from './operation-flag-gate-confirm-modal';
import { friendlyGateErrorMessage } from './operation-flag-gate-errors';
import type { V1GameOperationFlag, V1GameOperationFlagKey } from '@/types/api';

/**
 * 운영 토글 2종 — Task 10 GAME_WRITE/GAME_READ 컷오버가 끝나면서 예전 5단계 스테퍼
 * (operation-flag-gate-stepper.tsx, 제거됨)를 대체한다. 두 플래그는 서로 독립적인 on/off
 * 킬스위치라 순서·잠김·되돌릴 수 없음 개념이 전부 없다 — 카드 2개를 나란히 보여줄 뿐이다.
 */
interface ToggleDef {
  key: V1GameOperationFlagKey;
  label: string;
  /** 켜졌을 때 무엇이 바뀌는지. */
  onEffect: string;
  /** 껐을 때 무엇이 바뀌는지 — 운영자가 끄기 전에 반드시 알아야 하는 정보. */
  offEffect: string;
  techNote: string;
}

const TOGGLES: readonly ToggleDef[] = [
  {
    key: 'PUBLIC_LIVE',
    label: '실시간 점수 공개',
    onEffect: '관전자 화면(비로그인 포함)에 진행 중인 경기의 점수와 경기 시계를 그대로 보여줘요.',
    offEffect: '끄면 공개 화면의 실시간 점수가 상태만 보이는 status_only로 강등돼요 — 점수·경기 시계는 더 이상 공개되지 않아요.',
    techNote: 'PUBLIC_LIVE',
  },
  {
    key: 'DIRECTOR_OFFICIALIZE',
    label: '결과 확정 권한',
    onEffect: '대회 진행 요원(디렉터)이 경기 결과를 공식 기록으로 확정할 수 있게 해요.',
    offEffect: '끄면 디렉터의 결과 확정 요청이 거부돼요 — 이미 확정된 결과는 유지되지만 새로 확정할 수는 없어요.',
    techNote: 'DIRECTOR_OFFICIALIZE',
  },
] as const;

function confirmDescription(toggle: ToggleDef, turningOn: boolean): string {
  return turningOn ? toggle.onEffect : toggle.offEffect;
}

interface ToggleCardProps {
  toggle: ToggleDef;
  gateEnabled: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

function ToggleCard({ toggle, gateEnabled, showToast }: ToggleCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const flagQuery = useV1OperationFlag(toggle.key);
  const mutation = useV1SimplifiedToggleOperationFlag(toggle.key);
  const flag = flagQuery.data as V1GameOperationFlag | undefined;

  const isOn = flag?.value === 'on';
  const nextValue = isOn ? 'off' : 'on';
  const ctaLabel = isOn ? '끄기' : '켜기';
  const disabled = !gateEnabled || !flag || flagQuery.isPending || mutation.isPending;

  function submit(reason: string) {
    if (!flag) return;
    mutation.mutate(
      { expectedVersion: flag.version, value: nextValue, reason },
      {
        onSuccess: () => {
          showToast(`${toggle.label}을(를) ${isOn ? '껐어요' : '켰어요'}.`, 'success');
          setConfirmOpen(false);
        },
        onError: (err) => {
          showToast(friendlyGateErrorMessage(err), 'error');
          setConfirmOpen(false);
        },
      },
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[16px] font-bold text-[var(--text-strong)]">{toggle.label}</h3>
            {!flagQuery.isPending && !flagQuery.isError && (
              <span
                className={[
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0',
                  isOn ? 'bg-[var(--blue50)] text-[var(--blue700)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
                ].join(' ')}
              >
                {isOn ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
                {isOn ? '켜짐' : '꺼짐'}
              </span>
            )}
          </div>
          <p className="text-[13px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
            {isOn ? toggle.onEffect : toggle.offEffect}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5 font-mono">{toggle.techNote}</p>
        </div>

        {flagQuery.isError ? (
          <span className="shrink-0 text-[12px] text-[var(--red700)]">불러오지 못함</span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={disabled}
            aria-label={`${toggle.label} ${ctaLabel}`}
            className={[
              'shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-[13px] font-semibold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed',
              isOn ? 'bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--grey300)]' : 'bg-blue-500 text-white hover:bg-blue-600',
            ].join(' ')}
          >
            {ctaLabel}
          </button>
        )}
      </div>

      {flag && (
        <dl className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-[var(--border)] text-[12px]">
          <div>
            <dt className="text-[var(--text-muted)]">버전</dt>
            <dd className="text-[var(--text-body)] font-medium tabular-nums">v{flag.version}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">마지막 변경자</dt>
            <dd className="text-[var(--text-body)] font-medium truncate">{flag.updatedByUserId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">마지막 변경 시각</dt>
            <dd className="text-[var(--text-body)] font-medium">
              {new Date(flag.updatedAt).toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </div>
        </dl>
      )}

      {flag && (
        <GateConfirmModal
          open={confirmOpen}
          pending={mutation.isPending}
          title={`${toggle.label} ${ctaLabel}`}
          description={confirmDescription(toggle, !isOn)}
          confirmLabel={ctaLabel}
          tone="blue"
          onConfirm={submit}
          onClose={() => {
            if (!mutation.isPending) setConfirmOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface OperationFlagToggleCardsProps {
  gateEnabled: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

export function OperationFlagToggleCards({ gateEnabled, showToast }: OperationFlagToggleCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      {!gateEnabled && (
        <p className="text-[13px] text-[var(--text-muted)]">간소 전환 모드가 꺼져 있어 토글을 실행할 수 없어요.</p>
      )}
      {TOGGLES.map((toggle) => (
        <ToggleCard key={toggle.key} toggle={toggle} gateEnabled={gateEnabled} showToast={showToast} />
      ))}
    </div>
  );
}
