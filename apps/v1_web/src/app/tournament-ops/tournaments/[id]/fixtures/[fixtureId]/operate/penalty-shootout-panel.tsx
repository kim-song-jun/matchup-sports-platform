'use client';

import { useEffect, useId, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import type { GameSide } from '@/types/game-operations';
import {
  nextPenaltyKicker,
  penaltyScoreBySideId,
  penaltyFinishAvailability,
  type PenaltyKick,
  type PenaltyKickResult,
  type PenaltyShootoutPolicy,
} from '@/lib/penalty-shootout';

export interface PenaltyShootoutPanelProps {
  readonly sides: readonly GameSide[];
  readonly kicks: readonly PenaltyKick[];
  /** 선축(먼저 차는 팀). 아직 안 정했으면 `null` — 그 동안은 성공/실패 버튼이 잠긴다. */
  readonly firstKickSideId: string | null;
  readonly onSelectFirstKicker: (sideId: string) => void;
  readonly onRecordKick: (sideId: string, result: PenaltyKickResult) => void;
  readonly onUndoLastKick: () => void;
  /** 종료 요청. `override`는 "규칙상 아직 안 끝났지만 운영자가 책임지고 닫는다"는 뜻 —
   * 호출부가 확인 문구를 갈라 쓰는 근거이자, 잘못 눌린 자동 종료가 override 경로로
   * 흘러드는 것을 막는 표식이다. */
  readonly onFinish: (options: { readonly override: boolean }) => void;
  readonly onCancel: () => void;
  /** 이 대회의 종료 판정 정책(`GameDetail.penaltyShootoutPolicy`). */
  readonly policy: PenaltyShootoutPolicy;
  /** "승부차기 종료" 명령이 서버 왕복 중일 때 — 다른 명령 버튼과 동일하게
   * `commandPending`을 그대로 물려받는다(별도 로딩 상태를 만들지 않는다). */
  readonly finishing: boolean;
}

/**
 * "승부차기 종료"가 아직 잠겨 있는 **이유**. 예전에는 어떤 상태든 "두 팀의 점수가 같으면
 * 종료할 수 없어요." 한 문구만 떴는데, 이제 잠기는 이유가 여러 갈래(상대 팀 미정 · 선축
 * 미선택 · 한쪽이 아직 안 참 · 킥 수가 다름 · 동점 · 아직 뒤집힐 수 있음)라 한 문구로는
 * 운영자가 무엇을 해야 하는지 알 수 없다. 각 갈래는 서로 배타적이라 항상 한 문구만 나온다.
 *
 * `policy`를 받지 않는다: 마지막 갈래("아직 뒤집힐 수 있다")는 **`earlyStop` 정책에서만**
 * 도달한다. 끝까지 차는 정책은 "같은 횟수 + 점수 갈림"이면 그 자리에서 결판이라
 * (`penaltyShootoutOutcome`) 이 함수까지 오지 못한다 — 정책별로 문구를 갈라 두면 그
 * false 분기가 영원히 죽은 코드가 된다.
 */
function undecidedReason(
  sides: readonly GameSide[],
  kicks: readonly PenaltyKick[],
  firstKickSideId: string | null,
): string {
  // 사이드가 2개가 아니면(상대가 아직 안 정해진 브래킷 픽스처 등) 선축을 골라도 승부차기를
  // 기록할 수 없다. 이 갈래를 선축 미선택과 합치면, 운영자가 라디오를 골랐는데도 "먼저 차는
  // 팀을 골라주세요."가 계속 떠서 시키는 대로 해도 문구가 안 바뀌는 막다른 길이 된다.
  if (sides.length !== 2) return '상대 팀이 정해지지 않아 승부차기를 기록할 수 없어요.';
  // `penaltyShootoutOutcome`과 **같은 방식**으로 선축/후축을 뽑는다(인덱스 접근이 아니라
  // find) — 그래야 선축이 아직 없는 상태에서 이 함수도 술어와 같은 결론에 도달하고, 둘이
  // 어긋나 빈 문구가 뜨는 일이 없다.
  const first = sides.find((side) => side.id === firstKickSideId);
  const second = sides.find((side) => side.id !== firstKickSideId);
  if (first === undefined || second === undefined) return '먼저 차는 팀을 골라주세요.';
  const takenFirst = kicks.filter((kick) => kick.sideId === first.id).length;
  const takenSecond = kicks.filter((kick) => kick.sideId === second.id).length;
  if (takenFirst === 0 || takenSecond === 0) {
    const waiting = takenFirst === 0 ? first : second;
    return `${waiting.displayNameSnapshot}이(가) 아직 한 번도 차지 않았어요.`;
  }
  if (takenFirst !== takenSecond) {
    const waiting = takenFirst < takenSecond ? first : second;
    return `${waiting.displayNameSnapshot}의 응답 킥이 남아 있어요.`;
  }
  const score = penaltyScoreBySideId(kicks);
  if ((score.get(first.id) ?? 0) === (score.get(second.id) ?? 0)) return '점수가 같으면 끝낼 수 없어요.';
  return '아직 남은 킥으로 뒤집힐 수 있어요.';
}

/**
 * 다이얼로그 안에서 포커스를 받을 수 있는 요소들. `input`/`select`/`textarea`가 빠져 있으면
 * **선축 라디오가 트랩에서 보이지 않는다** — 패널을 처음 열면 성공·실패·되돌리기·종료가 모두
 * disabled라 트랩이 잡는 요소가 닫기 버튼 하나뿐이 되고, Tab·Shift+Tab 양쪽 되감기가 전부
 * 그 버튼으로 되돌려 라디오에 **영원히 도달할 수 없었다**. 선축을 고르기 전에는 킥도 기록할 수
 * 없으므로, 키보드만 쓰는 운영자는 승부차기를 한 킥도 입력하지 못했다(WCAG 2.1.2).
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 실제로 Tab이 멈추는 요소만 추린다.
 *
 * 라디오 그룹은 DOM에 여러 개가 있어도 tab stop은 **하나뿐**이다 — 체크된 것이 있으면 그것,
 * 없으면 그룹의 첫 번째. 이 규칙을 반영하지 않고 `querySelectorAll` 결과를 그대로 쓰면 트랩의
 * `last`가 영원히 포커스를 받지 못하는 라디오가 되어 되감기가 발동하지 않고, Tab이 다이얼로그
 * 밖으로 새어 나간다(트랩을 고치려다 다른 방향으로 뚫는 셈).
 */
function tabbableElements(dialog: HTMLElement): HTMLElement[] {
  const all = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const radiosByGroup = new Map<string, HTMLInputElement[]>();
  for (const el of all) {
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const group = radiosByGroup.get(el.name) ?? [];
      group.push(el);
      radiosByGroup.set(el.name, group);
    }
  }
  return all.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio') return true;
    const group = radiosByGroup.get(el.name) ?? [];
    return el === (group.find((radio) => radio.checked) ?? group[0]);
  });
}

/**
 * 승부차기 킥 단위 입력 패널.
 *
 * 저장 방식(Option B — 자세한 근거는 `@/lib/penalty-shootout.ts` doc 참고):
 * 킥별 성공/실패는 이 컴포넌트가 들고 있는 로컬 상태(`kicks` prop, 부모
 * `operate-console.tsx`가 소유)일 뿐 어떤 이벤트로도 서버에 남지 않는다.
 * "승부차기 종료"를 눌러야만 집계된 최종 점수 두 개(`home`/`away`)가
 * `end` 커맨드의 `payload.penalties`에 실려 나간다. 즉 이 패널을 취소하거나
 * 새로고침하면 진행 중이던 킥 기록은 복구할 수 없다 — 그래서 "승부차기
 * 종료" 확인 문구가 최종 점수를 보여주고(요구사항 2), danger 톤을 쓴다.
 *
 * 접근성: `ActionTargetPicker`와 같은 모달 셸(role=dialog, ESC로 취소,
 * 포커스 트랩, backdrop 클릭 취소)을 그대로 따른다 — 이 화면에 이미 있는
 * 모달 관례를 새로 발명하지 않는다.
 */
export function PenaltyShootoutPanel({
  sides,
  kicks,
  firstKickSideId,
  onSelectFirstKicker,
  onRecordKick,
  onUndoLastKick,
  onFinish,
  onCancel,
  policy,
  finishing,
}: PenaltyShootoutPanelProps) {
  const firstKickGroupId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = tabbableElements(dialog);
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
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
    };
  }, []);

  const score = penaltyScoreBySideId(kicks);
  const nextSideId = nextPenaltyKicker(kicks, sides, firstKickSideId);
  // 세 갈래(`READY`/`OVERRIDABLE`/`BLOCKED`)를 그대로 화면에 옮긴다 — 예전에는 "결판났나"
  // 하나뿐이라, 규칙상 안 끝났지만 현장에서는 끝난 경우(기권·중단)에 운영자가 경기를 닫을
  // 방법이 아예 없었다.
  const availability = penaltyFinishAvailability(kicks, sides, firstKickSideId, policy);
  const decisive = availability === 'READY';
  // 선축은 첫 킥 전에만 고를 수 있다 — 킥이 하나라도 기록된 뒤에 바꾸면 이미 기록된
  // 킥들의 순서 해석이 통째로 달라진다. 되돌리기로 킥을 전부 지우면 다시 고를 수 있다.
  const firstKickLocked = kicks.length > 0;

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
        aria-labelledby="penalty-shootout-title"
        className="flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-[var(--card-surface)] shadow-[0_8px_32px_rgba(20,28,45,0.2)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id="penalty-shootout-title" className="text-base font-bold text-[var(--text-strong)]">
            승부차기
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="승부차기 입력 닫기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* 선축(동전 던지기 결과). 승부차기 규칙에서 "누가 먼저 차는가"는 점수와 함께
              결과의 일부이고, 두 숫자로는 복원할 수 없다 — 예전 패널은 이 선택 자체가
              없어 항상 홈이 먼저 차는 것으로 굳어 있었다(사용자 보고 결함). 선택 전에는
              성공/실패 버튼이 잠기므로, 선축을 모르는 채로 킥이 기록되는 상태는 없다. */}
          <fieldset className="mb-4 rounded-2xl border border-[var(--border)] p-3">
            <legend className="px-1 text-sm font-semibold text-[var(--text-strong)]">
              누가 먼저 차나요?
            </legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {sides.map((side) => {
                const inputId = `${firstKickGroupId}-${side.id}`;
                return (
                  <label
                    key={side.id}
                    htmlFor={inputId}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                      firstKickSideId === side.id
                        ? 'border-[var(--blue500)] bg-[var(--blue50)] dark:bg-blue-500/10'
                        : 'border-[var(--border)] hover:bg-[var(--surface-soft)]'
                    } ${firstKickLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      id={inputId}
                      type="radio"
                      name={firstKickGroupId}
                      className="h-4 w-4 accent-[var(--blue500)]"
                      checked={firstKickSideId === side.id}
                      disabled={firstKickLocked}
                      onChange={() => onSelectFirstKicker(side.id)}
                    />
                    <span className="truncate text-sm font-semibold text-[var(--text-strong)]">
                      {side.displayNameSnapshot}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 tm-text-caption text-[var(--text-muted)]">
              {firstKickLocked
                ? '킥을 기록한 뒤에는 바꿀 수 없어요. 되돌리기로 킥을 모두 지우면 다시 고를 수 있어요.'
                : '동전 던지기 결과를 골라주세요. 고르기 전에는 킥을 기록할 수 없어요.'}
            </p>
          </fieldset>

          <div className="flex flex-col gap-3">
            {sides.map((side) => {
              const sideKicks = kicks.filter((kick) => kick.sideId === side.id);
              const isTurn = nextSideId === side.id;
              return (
                <div
                  key={side.id}
                  className={`rounded-2xl border p-3 ${
                    isTurn ? 'border-[var(--blue500)] bg-[var(--blue50)] dark:bg-blue-500/10' : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text-strong)]">
                      {side.displayNameSnapshot}
                      {isTurn ? <span className="ml-1.5 text-xs font-semibold text-[var(--blue700)]">다음 순서</span> : null}
                    </p>
                    <p className="text-xl font-bold tabular-nums text-[var(--text-strong)]">{score.get(side.id) ?? 0}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${side.displayNameSnapshot} 킥 기록`}>
                    {sideKicks.length === 0 ? (
                      <span className="tm-text-caption text-[var(--text-muted)]">아직 기록된 킥이 없어요</span>
                    ) : (
                      sideKicks.map((kick, index) =>
                        kick.result === 'SCORED' ? (
                          <span
                            key={index}
                            aria-label={`${index + 1}번째 킥 성공`}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--green500)] text-white"
                          >
                            <Check size={14} aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            key={index}
                            aria-label={`${index + 1}번째 킥 실패`}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--red500)] text-[var(--red500)]"
                          >
                            <X size={14} aria-hidden="true" />
                          </span>
                        ),
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="success"
              disabled={nextSideId === null}
              onClick={() => nextSideId !== null && onRecordKick(nextSideId, 'SCORED')}
            >
              <Check size={16} aria-hidden="true" />
              성공
            </Button>
            <Button
              size="lg"
              variant="danger"
              disabled={nextSideId === null}
              onClick={() => nextSideId !== null && onRecordKick(nextSideId, 'MISSED')}
            >
              <X size={16} aria-hidden="true" />
              실패
            </Button>
          </div>

          {/* 요구사항 3(과제 2) — 킥 오조작 복구. 이 되돌리기는 로컬 상태
              되감기일 뿐 서버 호출이 없다(아직 아무것도 안 보냈다) — 그래서
              사용자 결정("모든 액션에 확인")의 대상이 아니다. revert-period가
              확인 없이 즉시 실행되는 것과 같은 이유: 되돌리기 자체가 이미
              교정 행동이다. */}
          <Button size="md" variant="outline" block className="mt-2" disabled={kicks.length === 0} onClick={onUndoLastKick}>
            방금 킥 되돌리기
          </Button>
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          <Button
            size="lg"
            variant="primary"
            block
            disabled={!decisive}
            loading={finishing}
            onClick={() => onFinish({ override: false })}
          >
            승부차기 종료
          </Button>
          {!decisive ? (
            <p className="mt-2 text-center tm-text-caption text-[var(--text-muted)]">
              {undecidedReason(sides, kicks, firstKickSideId)}
            </p>
          ) : null}
          {/* 우회 종료는 `OVERRIDABLE`일 때만 — `BLOCKED`(사이드 미정 · 선축 미선택 · 동점)에서
              열어 주면 눌러도 서버가 되돌리거나 애초에 보낼 값이 없다. 자동 종료와 시각적으로
              분명히 갈라 두려고 primary가 아닌 outline이고, 위 사유 문구 바로 아래에 둬서
              "왜 막혔는지 → 그래도 닫는 길" 순서로 읽히게 한다. */}
          {availability === 'OVERRIDABLE' ? (
            <Button
              size="md"
              variant="outline"
              block
              className="mt-3"
              loading={finishing}
              onClick={() => onFinish({ override: true })}
            >
              그래도 종료
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
