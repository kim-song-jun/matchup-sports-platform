'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { formatMatchClock } from '@/lib/game-operations-clock';
import type { FrozenEventCapture } from '@/lib/game-operations-clock';
import { LineupGrid } from './lineup-grid';
import { periodLabel } from './period-label';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import type {
  GameCardColor,
  GameEventType,
  GameLineup,
  GameLineupParticipant,
  GameSide,
  GameSubstitutionPolicy,
} from '@/types/game-operations';

export interface EventCaptureCommitInput {
  readonly type: GameEventType;
  /** 선수 없이 기록하는 팀 파울 경로에서는 없다 — `sideId` 만으로도 유효한
   * FOUL 이벤트다(백엔드 `assertEventReferences` 는 `participantId` 가
   * `undefined` 면 그 검증 자체를 건너뛴다). SUBSTITUTION에서는 항상
   * 들어오는(IN) 선수의 id다 — 나가는(OUT) 선수는 payload.outParticipantId다. */
  readonly participantId?: string;
  readonly sideId: string;
  readonly period: number;
  readonly clockMs: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface ActionTargetPickerProps {
  readonly open: boolean;
  /** UX 감사 item 2 — `LineupGrid`로 그대로 전달해, 라인업이 없는 사이드의
   * 빈 상태에 "라인업 제출하러 가기" 링크를 띄운다. 생략하면(예: 기존 테스트)
   * `LineupGrid`가 링크 없이 문구만 보여준다. */
  readonly tournamentId?: string;
  readonly fixtureId?: string;
  readonly actionLabel: string;
  readonly actionType: GameEventType;
  readonly cardColor?: GameCardColor;
  /** 액션 버튼을 탭한 그 순간 부모가 얼린 시각 — 이 컴포넌트는 다시 얼리지
   * 않는다(선수를 고르는 동안 기록 시각이 밀리면 안 된다는 게 이 리오더의
   * 요건이다). SUBSTITUTION의 2단계(나갈 선수→들어올 선수)를 거치는 동안도
   * 동일하게 고정된 채 유지된다. */
  readonly frozen: FrozenEventCapture;
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  /** 팀 단위 기록 경로. GOAL/OWN_GOAL은 `payload.anonymous=true`를 함께
   * 보내 의도적인 익명 기록과 실수로 누락된 득점자를 구분한다. */
  readonly allowTeamOnly: boolean;
  /** SUBSTITUTION 전용 — 지금 피치 위에 있는 참가자 id 집합(`on-pitch-state.
   * ts`가 `started` + 확정 이벤트 로그를 접어 만든 파생값). 1단계("나갈
   * 선수")는 이 집합만, 2단계("들어올 선수")는 이 집합에 없는 같은 팀
   * 선수만 보여준다 — 서버가 최종 검증을 하지만, 애초에 무효한 대상을
   * 보여주지 않는 게 오조작을 줄이는 첫 번째 방어선이다. */
  readonly onPitchParticipantIds?: ReadonlySet<string>;
  /** SUBSTITUTION 전용 — "남은 횟수" 표시용(요건: `substitutions === 'limited'`
   * 종목은 남은 교체 횟수를 UI에 보여준다). `null`이면 대회 config를 아직
   * 못 읽은 것이라 표시를 생략한다. */
  readonly substitutionPolicy?: GameSubstitutionPolicy | null;
  /** sideId → 지금까지 확정된(되돌리지 않은) 교체 횟수. */
  readonly substitutionUsedBySideId?: Readonly<Record<string, number>>;
  readonly onCommit: (input: EventCaptureCommitInput) => void;
  readonly onCancel: () => void;
}

/**
 * 액션 우선 흐름(선수 우선 → 액션 우선 리오더)의 대상 선택 화면: 이미 골/카드/
 * 파울/교체 중 하나가 정해진 상태에서 "누구에게"를 고른다.
 *
 * 팀 구분: 예전 흐름은 선수를 먼저 골라서 팀이 자명했다. 뒤집으면 그 정보가
 * 사라져 "액션 후 양 팀 선수가 다 뜨면 헷갈린다"는 문제가 생긴다 — 이 화면은
 * `LineupGrid`를 그대로 재사용해서 푼다: 그 컴포넌트는 이미 홈/원정을 별도
 * 카드 + 팀명 헤더로 좌우 분리해서 보여주고 있었으므로(옆 팀과 섞이지 않는
 * 시각적 경계가 이미 있다), 별도의 팀 선택 스텝을 추가하지 않고 그 경계를
 * 그대로 물려받는다.
 *
 * SUBSTITUTION만 내부에 2단계를 더 갖는다: "나갈 선수"(피치 위)를 고르면
 * 팀이 정해지고, 그다음 "들어올 선수"(같은 팀 후보)를 고르면 커밋한다. 시각은
 * 액션을 탭한 순간에 이미 고정돼 있고 두 단계 내내 다시 얼지 않는다.
 */
export function ActionTargetPicker({
  open,
  tournamentId,
  fixtureId,
  actionLabel,
  actionType,
  cardColor,
  frozen,
  sides,
  lineups,
  allowTeamOnly,
  onPitchParticipantIds,
  substitutionPolicy,
  substitutionUsedBySideId,
  onCommit,
  onCancel,
}: ActionTargetPickerProps) {
  const [substitutionOut, setSubstitutionOut] = useState<{
    readonly sideId: string;
    readonly participant: GameLineupParticipant;
  } | null>(null);

  // 부모(operate-console)는 pendingAction이 null이 아닌 동안 이 컴포넌트를
  // 계속 마운트해 둔 채 새 액션으로 교체할 수 있다(모달이 열린 채로 다른
  // 액션 버튼을 다시 누르는 경우) — 그때 이전 SUBSTITUTION 1단계 선택이
  // 새 액션에 새어 들어가면 안 되므로 actionType/시각이 바뀔 때마다 초기화한다.
  useEffect(() => {
    setSubstitutionOut(null);
  }, [actionType, frozen.occurredAt]);

  // focus 저장/복원 · ESC 닫기 · Tab focus trap · 스크롤 잠금 · backdrop 클릭 닫기를
  // 공용 훅에 위임. 렌더 게이트는 기존과 동일하게 `if (!open) return null`이라
  // 퇴장 애니메이션(mounted/closing)은 쓰지 않는다.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open,
    onClose: onCancel,
  });

  if (!open) return null;

  const payload: Record<string, unknown> = actionType === 'CARD' ? { card: cardColor } : {};

  const commitPlayer = (input: { sideId: string; participant: GameLineupParticipant }) => {
    const scoringSideId =
      actionType === 'OWN_GOAL'
        ? (sides.find((side) => side.id !== input.sideId)?.id ?? input.sideId)
        : input.sideId;
    onCommit({
      type: actionType,
      participantId: input.participant.id,
      sideId: scoringSideId,
      period: frozen.period,
      clockMs: frozen.clockMs,
      occurredAt: frozen.occurredAt,
      payload,
    });
  };

  const commitTeamOnly = (sideId: string) => {
    onCommit({
      type: actionType,
      sideId,
      period: frozen.period,
      clockMs: frozen.clockMs,
      occurredAt: frozen.occurredAt,
      payload:
        actionType === 'GOAL' || actionType === 'OWN_GOAL'
          ? { ...payload, anonymous: true }
          : payload,
    });
  };

  const commitSubstitution = (input: { sideId: string; participant: GameLineupParticipant }) => {
    if (substitutionOut === null) return;
    onCommit({
      type: 'SUBSTITUTION',
      participantId: input.participant.id,
      sideId: substitutionOut.sideId,
      period: frozen.period,
      clockMs: frozen.clockMs,
      occurredAt: frozen.occurredAt,
      payload: { outParticipantId: substitutionOut.participant.id },
    });
  };

  const remainingSubstitutionsLabel = (sideId: string): string | null => {
    if (!substitutionPolicy || substitutionPolicy.mode !== 'limited' || substitutionPolicy.maxSubstitutions === null) {
      return null;
    }
    const used = substitutionUsedBySideId?.[sideId] ?? 0;
    const remaining = Math.max(0, substitutionPolicy.maxSubstitutions - used);
    return `남은 교체 ${remaining}회 (${used}/${substitutionPolicy.maxSubstitutions} 사용)`;
  };

  const isSubstitution = actionType === 'SUBSTITUTION';

  let titleText = `${actionLabel} · 누구인가요?`;
  if (isSubstitution) {
    titleText = substitutionOut === null ? `${actionLabel} · 나가는 선수` : `${actionLabel} · 들어오는 선수`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-target-picker-title"
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-t-2xl bg-[var(--card-surface)] shadow-[0_8px_32px_rgba(20,28,45,0.2)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="action-target-picker-title" className="text-base font-bold text-[var(--text-strong)]">
              {titleText}
            </h2>
            {isSubstitution && substitutionOut !== null ? (
              <p className="mt-0.5 text-xs font-medium text-[var(--text-muted)]">
                {substitutionOut.participant.displayNameSnapshot} 선수와 교체
              </p>
            ) : null}
            {/* 액션 탭 시점을 얼린 값 — 선수를 고르는 동안 흘러가지 않는다. */}
            <p className="mt-0.5 text-xs font-medium tabular-nums text-[var(--blue700)]" aria-live="polite">
              {periodLabel(frozen.period)} · {formatMatchClock(frozen.clockMs)} 시점 기록 (고정됨)
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="이벤트 기록 취소"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isSubstitution ? (
            substitutionOut === null ? (
              <LineupGrid
                tournamentId={tournamentId}
                fixtureId={fixtureId}
                sides={sides}
                lineups={lineups}
                onSelectPlayer={setSubstitutionOut}
                filterParticipantIds={onPitchParticipantIds}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {remainingSubstitutionsLabel(substitutionOut.sideId) ? (
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    {remainingSubstitutionsLabel(substitutionOut.sideId)}
                  </p>
                ) : null}
                <LineupGrid
                  tournamentId={tournamentId}
                  fixtureId={fixtureId}
                  sides={sides}
                  lineups={lineups}
                  onSelectPlayer={commitSubstitution}
                  restrictSideId={substitutionOut.sideId}
                  filterParticipantIds={
                    onPitchParticipantIds &&
                    new Set(
                      (lineups.find((lineup) => lineup.sideId === substitutionOut.sideId)?.participants ?? [])
                        .filter((participant) => !onPitchParticipantIds.has(participant.id))
                        .map((participant) => participant.id),
                    )
                  }
                />
                <Button size="md" variant="outline" onClick={() => setSubstitutionOut(null)}>
                  뒤로
                </Button>
              </div>
            )
          ) : (
            <LineupGrid tournamentId={tournamentId} fixtureId={fixtureId} sides={sides} lineups={lineups} onSelectPlayer={commitPlayer} />
          )}

          {allowTeamOnly ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sides.map((side) => (
                <button
                  key={side.id}
                  type="button"
                  onClick={() => commitTeamOnly(side.id)}
                  className="min-h-[44px] rounded-lg border border-dashed border-[var(--border)] px-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  {actionType === 'OWN_GOAL'
                    ? `${side.displayNameSnapshot} 득점 · OG로 기록`
                    : actionType === 'GOAL'
                      ? `${side.displayNameSnapshot} · 익명 골로 기록`
                      : `${side.displayNameSnapshot} · 선수 지정 없이 기록`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
