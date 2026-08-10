'use client';

import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { useV1OperationFlag, useV1SimplifiedToggleOperationFlag } from '@/hooks/use-v1-api';
import { GateConfirmModal } from './operation-flag-gate-confirm-modal';
import { friendlyGateErrorMessage } from './operation-flag-gate-errors';
import type { V1GameOperationFlag, V1GameOperationFlagKey, V1GameOperationFlagValue } from '@/types/api';

// ── Domain: 고정 전환 순서 ────────────────────────────────────────────────
// 서버의 assertFrozenForwardOrder가 강제하는 순서를 그대로 반영한다(단일 출처: 이 배열 순서를
// 바꾸면 화면 표시만 바뀌고 서버 검증은 그대로라 잠김 판정이 어긋난다 — 바꾸지 말 것).
type StepId = 1 | 2 | 3 | 4 | 5;
type StepStatus = 'done' | 'current' | 'locked';
type FlagValueMap = Partial<Record<V1GameOperationFlagKey, V1GameOperationFlagValue>>;

interface StepDef {
  id: StepId;
  key: V1GameOperationFlagKey;
  /** bidirectional=false 인 단계에서 실행 버튼이 향하는 값(항상 이 값 하나로 전환). */
  to: V1GameOperationFlagValue;
  label: string;
  description: string;
  techNote: string;
  revertHint: string;
  /** true면 2단계(GAME_WRITE)처럼 사실상 되돌릴 수 없음 — 타이핑 확인을 추가로 요구한다. */
  irreversible: boolean;
  /** true면 4·5단계처럼 on/off를 양방향으로 계속 오갈 수 있음(완료 후에도 CTA 유지). */
  bidirectional: boolean;
  prereq: (values: FlagValueMap) => boolean;
  isDone: (values: FlagValueMap) => boolean;
  lockedReason: string;
}

const STEPS: readonly StepDef[] = [
  {
    id: 1,
    key: 'GAME_READ',
    to: 'compare',
    label: '새 시스템 기록 대조 시작',
    description:
      '기존 기록과 새 시스템 기록을 나란히 비교하기 시작해요. 화면에 보이는 값은 아직 기존 시스템 그대로예요.',
    techNote: 'GAME_READ · legacy → compare',
    revertHint: '별도 절차로 되돌려요',
    irreversible: false,
    bidirectional: false,
    prereq: () => true,
    isDone: (v) => v.GAME_READ !== undefined && v.GAME_READ !== 'legacy',
    lockedReason: '',
  },
  {
    id: 2,
    key: 'GAME_WRITE',
    to: 'new',
    label: '새 시스템으로 기록 전환',
    description:
      '지금부터 경기 기록을 새 시스템에만 저장해요. 전환을 시작하면 기존 시스템 기록은 더 이상 갱신되지 않아요.',
    techNote: 'GAME_WRITE · legacy → new',
    revertHint: '되돌릴 수 없어요',
    irreversible: true,
    bidirectional: false,
    prereq: (v) => v.GAME_READ === 'compare' || v.GAME_READ === 'new',
    isDone: (v) => v.GAME_WRITE === 'new',
    lockedReason: '1단계가 끝나야 열려요',
  },
  {
    id: 3,
    key: 'GAME_READ',
    to: 'new',
    label: '새 시스템으로 조회 전환',
    description: '이제부터 화면에는 새 시스템 기록만 보여줘요. 대조는 끝나고 새 시스템이 유일한 정답이 돼요.',
    techNote: 'GAME_READ · compare → new',
    revertHint: '별도 절차로 되돌려요',
    irreversible: false,
    bidirectional: false,
    prereq: (v) => v.GAME_WRITE === 'new',
    isDone: (v) => v.GAME_READ === 'new',
    lockedReason: '2단계가 끝나야 열려요',
  },
  {
    id: 4,
    key: 'PUBLIC_LIVE',
    to: 'on',
    label: '관전자 실시간 점수 공개',
    description: '관전자 화면(비로그인 포함)에 진행 중인 경기의 점수와 경기 시계를 그대로 보여줘요.',
    techNote: 'PUBLIC_LIVE · off ↔ on',
    revertHint: '언제든 끌 수 있어요',
    irreversible: false,
    bidirectional: true,
    prereq: (v) => v.GAME_WRITE === 'new' && v.GAME_READ === 'new',
    isDone: (v) => v.PUBLIC_LIVE === 'on',
    lockedReason: '3단계가 끝나야 열려요',
  },
  {
    id: 5,
    key: 'DIRECTOR_OFFICIALIZE',
    to: 'on',
    label: '심판 결과 공식화',
    description: '대회 진행 요원이 경기 결과를 공식 기록으로 확정할 수 있게 해요.',
    techNote: 'DIRECTOR_OFFICIALIZE · off ↔ on',
    revertHint: '언제든 끌 수 있어요',
    irreversible: false,
    bidirectional: true,
    prereq: (v) => v.GAME_WRITE === 'new' && v.GAME_READ === 'new',
    isDone: (v) => v.DIRECTOR_OFFICIALIZE === 'on',
    lockedReason: '3단계가 끝나야 열려요',
  },
] as const;

function computeStatus(step: StepDef, values: FlagValueMap): StepStatus {
  if (!step.prereq(values)) return 'locked';
  if (step.isDone(values)) return 'done';
  return 'current';
}

function statusLabel(status: StepStatus): string {
  if (status === 'done') return '완료';
  if (status === 'current') return '지금 할 차례';
  return '잠김';
}

function confirmDescription(step: StepDef, isOn: boolean): string {
  if (step.bidirectional) {
    return isOn
      ? `지금 끄면 "${step.label}" 기능이 즉시 비공개로 전환돼요. 언제든 다시 켤 수 있어요.`
      : `지금 켜면 "${step.label}" 기능이 즉시 적용돼요. 언제든 다시 끌 수 있어요.`;
  }
  if (step.irreversible) {
    return `${step.description} 이 전환은 사실상 되돌릴 수 없어요 — 새 시스템에 첫 기록이 저장되는 순간 잠겨요.`;
  }
  return `${step.description} 되돌리려면 별도 절차(tuple-transition)가 필요해요.`;
}

// ── 단계 카드 노드(레일의 원형 마커) ────────────────────────────────────────
function StepNode({ status, number }: { status: StepStatus; number: number }) {
  const base = 'flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-[13px] font-bold';
  if (status === 'done') {
    return (
      <span className={`${base} bg-blue-500 text-white`} aria-hidden="true">
        <Check size={16} />
      </span>
    );
  }
  if (status === 'current') {
    return (
      <span className={`${base} border-2 border-blue-500 bg-[var(--card-surface)] text-[var(--blue700)]`} aria-hidden="true">
        {number}
      </span>
    );
  }
  return (
    <span className={`${base} border-2 border-[var(--border)] bg-[var(--grey100)] text-[var(--text-caption)]`} aria-hidden="true">
      {number}
    </span>
  );
}

// ── 단계 행(노드 + 연결선 + 카드) ───────────────────────────────────────────
interface StepRowProps {
  step: StepDef;
  status: StepStatus;
  isLast: boolean;
  gateEnabled: boolean;
  flagQuery: ReturnType<typeof useV1OperationFlag>;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

function StepRow({ step, status, isLast, gateEnabled, flagQuery, showToast }: StepRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mutation = useV1SimplifiedToggleOperationFlag(step.key);
  const flag = flagQuery.data as V1GameOperationFlag | undefined;

  const isOn = step.bidirectional ? flag?.value === 'on' : false;
  const nextValue: V1GameOperationFlagValue = step.bidirectional ? (isOn ? 'off' : 'on') : step.to;
  // 잠긴 단계도 버튼 자체는 렌더링하고 disabled 로 막는다(자물쇠 아이콘 병행) — 완전히
  // 숨기면 "버튼이 비활성인지"를 테스트로 검증할 수 없고, 사용자에게도 "이 단계가 존재한다"는
  // 정보 자체가 사라진다. 완료된 단방향 단계(1·3단계)만 더는 액션이 없어 버튼을 숨긴다.
  const buttonVisible = !flagQuery.isPending && !flagQuery.isError && !!flag && (step.bidirectional || status !== 'done');
  const isLocked = status === 'locked';
  const disabled = isLocked || !gateEnabled || mutation.isPending;
  const ctaLabel = step.bidirectional ? (isOn ? '끄기' : '켜기') : '실행';

  function submit(reason: string) {
    if (!flag) return;
    mutation.mutate(
      { expectedVersion: flag.version, value: nextValue, reason },
      {
        onSuccess: () => {
          showToast(`${step.label} 완료했어요.`, 'success');
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
    <li className="relative flex gap-3.5">
      <div className="flex flex-col items-center">
        <StepNode status={status} number={step.id} />
        {!isLast && (
          <div
            aria-hidden="true"
            className={
              status === 'done'
                ? 'w-0.5 flex-1 min-h-[24px] my-1 rounded-full bg-blue-500'
                : 'w-0 flex-1 min-h-[24px] my-1 border-l-2 border-dashed border-[var(--border)]'
            }
          />
        )}
      </div>

      <div className="flex-1 min-w-0 pb-6">
        <div
          className={[
            'rounded-2xl border p-5 transition-colors',
            status === 'locked'
              ? 'bg-[var(--surface-soft)] border-[var(--border)] opacity-70'
              : status === 'current'
                ? 'bg-[var(--card-surface)] border-[var(--tint-blue-border)] ring-1 ring-blue-100'
                : 'bg-[var(--card-surface)] border-[var(--border)]',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[16px] font-bold text-[var(--text-strong)]">
                  {step.label}
                  <span className="sr-only"> — {statusLabel(status)}</span>
                </h3>
                <span
                  className={[
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold shrink-0',
                    step.irreversible
                      ? 'bg-[var(--tint-orange)] text-[var(--orange700)]'
                      : status === 'locked'
                        ? 'bg-[var(--card-surface)] text-[var(--text-muted)]'
                        : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
                  ].join(' ')}
                >
                  {step.revertHint}
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">{step.description}</p>
              <p className="text-[11px] text-gray-400 mt-1.5 font-mono">{step.techNote}</p>
            </div>

            {buttonVisible && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={disabled}
                aria-label={`${step.label} ${ctaLabel}`}
                className={[
                  'shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] px-4 rounded-xl text-[13px] font-semibold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed',
                  step.bidirectional && isOn
                    ? 'bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--grey300)]'
                    : 'bg-blue-500 text-white hover:bg-blue-600',
                ].join(' ')}
              >
                {isLocked && <Lock size={13} aria-hidden="true" />}
                {ctaLabel}
              </button>
            )}
          </div>

          {status === 'locked' && (
            <p className="text-[12px] text-gray-400 mt-2.5 flex items-center gap-1">
              <Lock size={12} aria-hidden="true" />
              {step.lockedReason}
            </p>
          )}

          {flag && status === 'done' && (
            <dl className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-[var(--border)] text-[12px]">
              <div>
                <dt className="text-gray-400">버전</dt>
                <dd className="text-[var(--text-body)] font-medium tabular-nums">v{flag.version}</dd>
              </div>
              <div>
                <dt className="text-gray-400">마지막 변경자</dt>
                <dd className="text-[var(--text-body)] font-medium truncate">{flag.updatedByUserId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">마지막 변경 시각</dt>
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
        </div>

        {flag && (
          <GateConfirmModal
            open={confirmOpen}
            pending={mutation.isPending}
            title={`${step.label} ${ctaLabel}`}
            description={confirmDescription(step, isOn)}
            confirmLabel={ctaLabel}
            tone={step.irreversible ? 'amber' : 'blue'}
            typedChallenge={step.irreversible ? '전환' : undefined}
            onConfirm={submit}
            onClose={() => {
              if (!mutation.isPending) setConfirmOpen(false);
            }}
          />
        )}
      </div>
    </li>
  );
}

// ── 5단계 레일 ───────────────────────────────────────────────────────────
interface OperationFlagGateStepperProps {
  gateEnabled: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

export function OperationFlagGateStepper({ gateEnabled, showToast }: OperationFlagGateStepperProps) {
  const read = useV1OperationFlag('GAME_READ');
  const write = useV1OperationFlag('GAME_WRITE');
  const publicLive = useV1OperationFlag('PUBLIC_LIVE');
  const officialize = useV1OperationFlag('DIRECTOR_OFFICIALIZE');

  const flagQueries: Record<V1GameOperationFlagKey, ReturnType<typeof useV1OperationFlag>> = {
    GAME_READ: read,
    GAME_WRITE: write,
    PUBLIC_LIVE: publicLive,
    DIRECTOR_OFFICIALIZE: officialize,
  };

  const values: FlagValueMap = {
    GAME_READ: read.data?.value,
    GAME_WRITE: write.data?.value,
    PUBLIC_LIVE: publicLive.data?.value,
    DIRECTOR_OFFICIALIZE: officialize.data?.value,
  };

  const anyError = read.isError || write.isError || publicLive.isError || officialize.isError;
  const doneCount = STEPS.filter((step) => computeStatus(step, values) === 'done').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[13px] font-semibold text-[var(--text-body)]">
            5단계 중 {doneCount}단계 완료
          </p>
          {!gateEnabled && (
            <span className="inline-flex items-center gap-1 text-[12px] text-gray-400">
              <Lock size={12} aria-hidden="true" />
              간소 전환 모드가 꺼져 있어 실행할 수 없어요
            </span>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--surface-soft)] overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-[width] duration-150"
            style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {anyError && (
        <p className="text-[13px] text-[var(--red700)] bg-[var(--red50)] border border-[var(--tint-red-border)] rounded-xl px-3.5 py-3">
          일부 단계 상태를 불러오지 못했어요. 새로고침해 주세요.
        </p>
      )}

      <ol className={['flex flex-col', !gateEnabled ? 'opacity-60' : ''].join(' ')}>
        {STEPS.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            status={computeStatus(step, values)}
            isLast={index === STEPS.length - 1}
            gateEnabled={gateEnabled}
            flagQuery={flagQueries[step.key]}
            showToast={showToast}
          />
        ))}
      </ol>
    </div>
  );
}
