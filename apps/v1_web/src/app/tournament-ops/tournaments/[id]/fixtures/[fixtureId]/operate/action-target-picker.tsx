'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatMatchClock } from '@/lib/game-operations-clock';
import type { FrozenEventCapture } from '@/lib/game-operations-clock';
import { LineupGrid } from './lineup-grid';
import type { GameCardColor, GameEventType, GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';

export interface EventCaptureCommitInput {
  readonly type: GameEventType;
  /** 선수 없이 기록하는 팀 파울 경로에서는 없다 — `sideId` 만으로도 유효한
   * FOUL 이벤트다(백엔드 `assertEventReferences` 는 `participantId` 가
   * `undefined` 면 그 검증 자체를 건너뛴다). */
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
   * 요건이다). */
  readonly frozen: FrozenEventCapture;
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  /** FOUL만 선수 없이 팀 단위로 기록하는 경로를 남겨둔다(백엔드가 이미
   * 지원하던 경로 — `games.service.ts`의 `assertEventReferences`는
   * `participantId`가 없는 FOUL/CARD를 그대로 허용한다. GOAL은 대회
   * 정책(`tournamentScorerPolicy`)에 따라 득점자가 강제될 수 있어 여기서
   * 임의로 선수 없이 보내면 안 된다). */
  readonly allowTeamOnly: boolean;
  readonly onCommit: (input: EventCaptureCommitInput) => void;
  readonly onCancel: () => void;
}

/**
 * 액션 우선 흐름(선수 우선 → 액션 우선 리오더)의 2단계: 이미 골/카드/파울 중
 * 하나가 정해진 상태에서 "누구에게"를 고르는 화면.
 *
 * 팀 구분: 예전 흐름은 선수를 먼저 골라서 팀이 자명했다. 뒤집으면 그 정보가
 * 사라져 "액션 후 양 팀 선수가 다 뜨면 헷갈린다"는 문제가 생긴다 — 이 화면은
 * `LineupGrid`를 그대로 재사용해서 푼다: 그 컴포넌트는 이미 홈/원정을 별도
 * 카드 + 팀명 헤더로 좌우 분리해서 보여주고 있었으므로(옆 팀과 섞이지 않는
 * 시각적 경계가 이미 있다), 별도의 팀 선택 스텝을 추가하지 않고 그 경계를
 * 그대로 물려받는다.
 */
export function ActionTargetPicker({
  open,
  actionLabel,
  actionType,
  cardColor,
  frozen,
  sides,
  lineups,
  allowTeamOnly,
  onCommit,
  onCancel,
}: ActionTargetPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    // 열릴 때 포커스를 다이얼로그 안으로 옮긴다. 아래 트랩은 activeElement 가 first/last 일 때만
    // 순환시키므로, 포커스가 오버레이 바깥에 남아 있으면 트랩이 아예 걸리지 않고 키보드 사용자는
    // 보이지 않는 배경 요소들을 훑게 된다.
    const initial = dialog.querySelector<HTMLElement>(focusableSelectors);
    initial?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  if (!open) return null;

  const payload: Record<string, unknown> = actionType === 'CARD' ? { card: cardColor } : {};

  const commitPlayer = (input: { sideId: string; participant: GameLineupParticipant }) => {
    onCommit({
      type: actionType,
      participantId: input.participant.id,
      sideId: input.sideId,
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
      payload,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-target-picker-title"
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-t-2xl bg-white shadow-[0_8px_32px_rgba(20,28,45,0.2)] sm:rounded-2xl dark:bg-gray-800"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 id="action-target-picker-title" className="text-base font-bold text-gray-900 dark:text-white">
              {actionLabel} · 누구인가요?
            </h2>
            {/* 액션 탭 시점을 얼린 값 — 선수를 고르는 동안 흘러가지 않는다. */}
            <p className="mt-0.5 text-2xs font-medium tabular-nums text-blue-600 dark:text-blue-400" aria-live="polite">
              {frozen.period}피리어드 · {formatMatchClock(frozen.clockMs)} 시점 기록 (고정됨)
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="이벤트 기록 취소"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-gray-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <LineupGrid sides={sides} lineups={lineups} onSelectPlayer={commitPlayer} />

          {allowTeamOnly ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sides.map((side) => (
                <button
                  key={side.id}
                  type="button"
                  onClick={() => commitTeamOnly(side.id)}
                  className="min-h-[44px] rounded-lg border border-dashed border-gray-300 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {side.displayNameSnapshot} · 선수 지정 없이 기록
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
