'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { formatMatchClock } from '@/lib/game-operations-clock';
import type { FrozenEventCapture } from '@/lib/game-operations-clock';
import type { SentOffRedCard } from '@/lib/on-pitch-state';
import { recordNounOf } from './confirm-copy';
import { LineupGrid, rosterForSide } from './lineup-grid';
import { participantIdentityName } from './participant-identity';
import { periodPrefix } from './period-label';
import { SentOffConfirmPanel } from './sent-off-confirm-panel';
import { FOCUSABLE_SELECTOR, useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import type {
  GameCardColor,
  GameEventType,
  GameLineup,
  GameLineupParticipant,
  GameSide,
  GameSubstitutionPolicy,
} from '@/types/game-operations';
import type { V1LineupConfigPosition } from '@/types/api';

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
  readonly actionLabel: string;
  readonly actionType: GameEventType;
  readonly cardColor?: GameCardColor;
  /** 액션 버튼을 탭한 그 순간 부모가 얼린 시각 — 이 컴포넌트는 다시 얼리지
   * 않는다(선수를 고르는 동안 기록 시각이 밀리면 안 된다는 게 이 리오더의
   * 요건이다). SUBSTITUTION의 2단계(나갈 선수→들어올 선수)를 거치는 동안도
   * 동일하게 고정된 채 유지된다. */
  readonly frozen: FrozenEventCapture;
  /** 정규 피리어드 수. 1이면 시각 앞에 "전반"을 붙이지 않는다. */
  readonly periodCount?: number | null;
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  /** 팀 칸 끝의 「선수 모름」 경로. GOAL/OWN_GOAL은 `payload.anonymous=true`를 함께
   * 보내 일부러 선수 없이 남긴 기록과 실수로 빠뜨린 득점자를 구분한다. */
  readonly allowTeamOnly: boolean;
  /** SUBSTITUTION 전용 — 지금 피치 위에 있는 참가자 id 집합(`on-pitch-state.
   * ts`가 `started` + 확정 이벤트 로그를 접어 만든 파생값). 1단계("나갈
   * 선수")는 이 집합만, 2단계("들어올 선수")는 이 집합에 없는 같은 팀
   * 선수만 보여준다 — 서버가 최종 검증을 하지만, 애초에 무효한 대상을
   * 보여주지 않는 게 오조작을 줄이는 첫 번째 방어선이다. */
  readonly onPitchParticipantIds?: ReadonlySet<string>;
  /** LIMITED substitution only — participants already used as an active OUT
   * target cannot re-enter. A reversed substitution is omitted by the parent,
   * so its former OUT participant becomes eligible again. */
  readonly substitutionOutParticipantIds?: ReadonlySet<string>;
  /** SUBSTITUTION 전용 — "남은 횟수" 표시용(요건: `substitutions === 'limited'`
   * 종목은 남은 교체 횟수를 UI에 보여준다). `null`이면 대회 config를 아직
   * 못 읽은 것이라 표시를 생략한다. */
  readonly substitutionPolicy?: GameSubstitutionPolicy | null;
  /** sideId → 지금까지 확정된(되돌리지 않은) 교체 횟수. */
  readonly substitutionUsedBySideId?: Readonly<Record<string, number>>;
  /** 레드카드가 기록된 선수 id — 선수 목록에서 "퇴장" 칩으로 가르고, 이 선수를 골랐을 때(교체 제외)
   * 기록하기 전에 한 번 더 확인한다. */
  readonly sentOffParticipantIds?: ReadonlySet<string>;
  /** 퇴장한 선수가 레드카드를 받은 시각 — 확인 문구에 "후반 8:12에 퇴장"을 보여 준다. 없으면 시각 없이 묻는다. */
  readonly sentOffRedCards?: ReadonlyMap<string, SentOffRedCard>;
  readonly lineupPositions?: readonly V1LineupConfigPosition[];
  readonly onCommit: (input: EventCaptureCommitInput) => void;
  readonly onCancel: () => void;
}

const TARGET_QUESTION: Partial<Record<GameEventType, string>> = {
  GOAL: '누가 넣었나요?',
  OWN_GOAL: '누구의 자책골인가요?',
  CARD: '누가 받았나요?',
  FOUL: '누가 했나요?',
};

/**
 * 액션 우선 흐름(선수 우선 → 액션 우선 리오더)의 대상 선택 화면: 이미 골/카드/
 * 파울/교체 중 하나가 정해진 상태에서 "누구에게"를 고른다.
 *
 * 팀 구분: 골·카드·파울은 `LineupGrid` 의 `columns` 배치로 두 팀을 나란히 놓아(팀 제목 + 칸 경계)
 * 팀 고르기 단계 없이 한 번에 고른다. 교체는 기존 탭 배치 그대로다.
 *
 * SUBSTITUTION만 내부에 2단계를 더 갖는다: "나갈 선수"(피치 위)를 고르면
 * 팀이 정해지고, 그다음 "들어올 선수"(같은 팀 후보)를 고르면 커밋한다. 시각은
 * 액션을 탭한 순간에 이미 고정돼 있고 두 단계 내내 다시 얼지 않는다.
 */
export function ActionTargetPicker({
  open,
  actionLabel,
  actionType,
  cardColor,
  frozen,
  periodCount,
  sides,
  lineups,
  allowTeamOnly,
  onPitchParticipantIds,
  substitutionOutParticipantIds,
  substitutionPolicy,
  substitutionUsedBySideId,
  sentOffParticipantIds,
  sentOffRedCards,
  lineupPositions,
  onCommit,
  onCancel,
}: ActionTargetPickerProps) {
  const [substitutionOut, setSubstitutionOut] = useState<{
    readonly sideId: string;
    readonly participant: GameLineupParticipant;
  } | null>(null);
  // 퇴장한 선수를 골랐을 때 "그래도 기록할까요?"를 기다리는 선택. 이 동안 목록 자리에 확인 패널이 뜬다.
  const [sentOffPending, setSentOffPending] = useState<{
    readonly sideId: string;
    readonly participant: GameLineupParticipant;
  } | null>(null);

  // 부모(operate-console)는 pendingAction이 null이 아닌 동안 이 컴포넌트를
  // 계속 마운트해 둔 채 새 액션으로 교체할 수 있다(모달이 열린 채로 다른
  // 액션 버튼을 다시 누르는 경우) — 그때 이전 SUBSTITUTION 1단계 선택이
  // 새 액션에 새어 들어가면 안 되므로 actionType/시각이 바뀔 때마다 초기화한다.
  // 퇴장 확인 대기 중인 선택도 같은 이유로 새 액션에 넘어가면 안 된다.
  useEffect(() => {
    setSubstitutionOut(null);
    setSentOffPending(null);
  }, [actionType, frozen.occurredAt]);

  // focus 저장/복원 · ESC 닫기 · Tab focus trap · 스크롤 잠금 · backdrop 클릭 닫기를
  // 공용 훅에 위임. 렌더 게이트는 기존과 동일하게 `if (!open) return null`이라
  // 퇴장 애니메이션(mounted/closing)은 쓰지 않는다.
  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({
    open,
    onClose: onCancel,
  });

  // 교체 단계가 바뀌면 다이얼로그 안 첫 focusable 로 포커스를 **재고정**한다.
  //
  // 1단계는 <LineupGrid>, 2단계는 <div> 를 같은 자리에 렌더한다 — element type 이
  // 달라 React 가 서브트리를 언마운트하므로 방금 누른 선수 버튼이 사라지고
  // document.activeElement 가 body 로 떨어진다. 훅의 focus trap 은 activeElement 가
  // first/last 일 때만 되감으므로 body 상태에서는 아무 개입도 하지 않고, 그 순간 Tab 이
  // 다이얼로그 밖 배경 문서로 샌다(WCAG 2.1.2). '뒤로'로 1단계에 돌아올 때도 같다.
  //
  // 훅의 초기 포커스는 deps 가 [open] 뿐이고 `dialog.contains(activeElement)` 가드까지
  // 있어 이 전환을 커버하지 못한다. 재고정 트리거를 훅에 넣으면 소비처 19곳이 함께
  // 영향을 받으므로, 이 화면만 갖는 2단계 문제는 이 파일에서 국소로 해결한다.
  // 이전 값을 ref 로 추적해 **바뀔 때만** 옮기므로 초기 마운트(open 시)에는
  // 훅의 초기 포커스와 경합하지 않는다.
  //
  // 퇴장 확인 패널도 같은 문제를 갖는다 — 선수 버튼이 사라지고, '다른 선수 고르기'로 목록에 돌아올 때
  // 포커스가 body 로 떨어진다. 패널이 떠 있는 동안은 패널이 스스로 첫 버튼에 포커스를 잡으므로
  // 여기서는 건너뛰고, 패널이 닫혀 목록으로 돌아올 때만 첫 focusable 로 옮긴다.
  const lastFocusKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const currentKey = sentOffPending?.participant.id ?? substitutionOut?.participant.id ?? null;
    if (lastFocusKeyRef.current === currentKey) return;
    lastFocusKeyRef.current = currentKey;
    if (!open || sentOffPending !== null) return;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
  }, [open, substitutionOut, sentOffPending, dialogRef]);

  if (!open) return null;

  const payload: Record<string, unknown> = actionType === 'CARD' ? { card: cardColor } : {};

  // 자책골에서 고르는 대상은 "득점한 팀"이 아니라 자책골을 넣은 선수/팀이다.
  // 선수 선택과 익명 팀 선택이 같은 의미를 갖도록 두 경로 모두 상대 팀에 점수를 귀속한다.
  const creditedSideIdForTarget = (targetSideId: string) =>
    actionType === 'OWN_GOAL'
      ? (sides.find((side) => side.id !== targetSideId)?.id ?? targetSideId)
      : targetSideId;

  const commitPlayer = (input: { sideId: string; participant: GameLineupParticipant }) => {
    onCommit({
      type: actionType,
      participantId: input.participant.id,
      sideId: creditedSideIdForTarget(input.sideId),
      period: frozen.period,
      clockMs: frozen.clockMs,
      occurredAt: frozen.occurredAt,
      payload,
    });
  };

  // 퇴장한 선수(레드카드가 기록된 선수)를 골랐으면 바로 기록하지 않고 확인 패널을 먼저 띄운다.
  // 교체는 이 경로를 타지 않는다 — 1·2단계 선택은 `setSubstitutionOut`·`commitSubstitution`이 따로 받는다.
  const selectPlayer = (input: { sideId: string; participant: GameLineupParticipant }) => {
    if (sentOffParticipantIds?.has(input.participant.id)) {
      setSentOffPending(input);
      return;
    }
    commitPlayer(input);
  };

  const commitTeamOnly = (targetSideId: string) => {
    onCommit({
      type: actionType,
      sideId: creditedSideIdForTarget(targetSideId),
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

  const sentOffRed = sentOffPending === null ? undefined : sentOffRedCards?.get(sentOffPending.participant.id);
  const sentOffWhen =
    sentOffRed === undefined ? null : `${periodPrefix(sentOffRed.period, periodCount)}${formatMatchClock(sentOffRed.clockMs)}`;

  let titleText = `${actionLabel} · ${TARGET_QUESTION[actionType] ?? '누구인가요?'}`;
  if (isSubstitution) {
    titleText = substitutionOut === null ? `${actionLabel} · 나가는 선수` : `${actionLabel} · 들어오는 선수`;
  }
  // 이 단계에서 선수를 누르면 곧바로 저장되는가 — 교체 1단계와 퇴장 확인 중에는 아니다.
  const tapSaves = sentOffPending === null && (!isSubstitution || substitutionOut !== null);

  const unknownPlayerButton = (side: GameSide) => {
    const creditedSide = sides.find((candidate) => candidate.id !== side.id);
    const ownGoalNote = `${creditedSide?.displayNameSnapshot ?? '상대 팀'} 득점으로 기록`;
    return (
      <button
        type="button"
        onClick={() => commitTeamOnly(side.id)}
        aria-label={
          actionType === 'OWN_GOAL'
            ? `${side.displayNameSnapshot} 자책골 · ${ownGoalNote} (선수 모름)`
            : `${side.displayNameSnapshot} · 선수 모름`
        }
        className="flex min-h-12 w-full flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] px-2 py-1 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        선수 모름
        {actionType === 'OWN_GOAL' ? (
          <span className="break-keep text-center text-[length:var(--font-size-caption)] font-normal">{ownGoalNote}</span>
        ) : null}
      </button>
    );
  };

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
        className="flex max-h-[calc(100dvh-48px)] w-full max-w-[560px] flex-col rounded-t-2xl bg-[var(--card-surface)] pb-[var(--v1-shell-safe-bottom,0px)] shadow-[0_8px_32px_rgba(20,28,45,0.2)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="action-target-picker-title" className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
              {titleText}
            </h2>
            {isSubstitution && substitutionOut !== null ? (
              <p className="mt-0.5 text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">
                {participantIdentityName(substitutionOut.participant)} 선수와 교체
              </p>
            ) : null}
            {/* 액션 탭 시점을 얼린 값 — 선수를 고르는 동안 흘러가지 않는다. */}
            <p className="mt-0.5 text-[length:var(--font-size-caption)] font-medium tabular-nums text-[var(--blue700)]" aria-live="polite">
              {periodPrefix(frozen.period, periodCount)}{formatMatchClock(frozen.clockMs)}로 기록돼요{tapSaves ? ' · 누르면 바로 저장돼요' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="기록 그만두기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {sentOffPending !== null ? (
            <SentOffConfirmPanel
              playerName={participantIdentityName(sentOffPending.participant)}
              sentOffWhen={sentOffWhen}
              noun={recordNounOf({ type: actionType, payload })}
              onBack={() => setSentOffPending(null)}
              onContinue={() => {
                const chosen = sentOffPending;
                setSentOffPending(null);
                commitPlayer(chosen);
              }}
            />
          ) : isSubstitution ? (
            substitutionOut === null ? (
              <LineupGrid
                sides={sides}
                lineups={lineups}
                onSelectPlayer={setSubstitutionOut}
                sentOffParticipantIds={sentOffParticipantIds}
                lineupPositions={lineupPositions}
                filterParticipantIds={onPitchParticipantIds}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {remainingSubstitutionsLabel(substitutionOut.sideId) ? (
                  <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">
                    {remainingSubstitutionsLabel(substitutionOut.sideId)}
                  </p>
                ) : null}
                <LineupGrid
                  sides={sides}
                  lineups={lineups}
                  onSelectPlayer={commitSubstitution}
                  sentOffParticipantIds={sentOffParticipantIds}
                  lineupPositions={lineupPositions}
                  restrictSideId={substitutionOut.sideId}
                  filterParticipantIds={
                    onPitchParticipantIds &&
                      new Set(
                        rosterForSide(lineups, substitutionOut.sideId)
                          .filter((participant) => !onPitchParticipantIds.has(participant.id))
                          .filter((participant) => !substitutionOutParticipantIds?.has(participant.id))
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
            <LineupGrid
              layout="columns"
              sides={sides}
              lineups={lineups}
              onSelectPlayer={selectPlayer}
              sentOffParticipantIds={sentOffParticipantIds}
              lineupPositions={lineupPositions}
              renderSideFooter={allowTeamOnly ? unknownPlayerButton : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
