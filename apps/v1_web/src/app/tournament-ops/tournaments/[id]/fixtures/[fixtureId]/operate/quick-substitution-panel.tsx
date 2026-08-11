'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';

export interface QuickSubstitutionPanelProps {
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
  readonly onPitchParticipantIds: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onSubstitute: (input: {
    readonly sideId: string;
    readonly outParticipant: GameLineupParticipant;
    readonly inParticipant: GameLineupParticipant;
  }) => void;
}

/**
 * `lineup.substitutions === 'rolling'` 종목(예: 풋살) 전용 빠른 교체 모드.
 * 기본 `교체` 액션 버튼(액션 우선 2단계: 나갈 선수 → 들어올 선수)은 여전히
 * 항상 쓸 수 있다 — 이 패널은 롤링 교체가 경기 중 수십 번 반복될 때 매번
 * 2단계를 거치지 않도록 그 위에 얹는 추가 경로다.
 *
 * 오조작 방지 설계(PR 본문에 근거 기재):
 * 1) "나갈 선수 지정"과 "들어올 선수 탭"은 의미가 다른 두 번의 조작이다 —
 *    지정은 그 자체로 아무 이벤트도 만들지 않는 순수 선택이고, 실제로
 *    이벤트를 확정하는 destructive 액션은 오직 "지정된 상태에서 후보를
 *    탭"할 때뿐이다. 아무것도 지정하지 않은 상태에서 후보를 잘못 눌러도
 *    교체가 기록되지 않는다 — 한 번의 실수 탭이 곧바로 기록으로 이어지지
 *    않는다.
 * 2) 지정 상태는 항상 눈에 보인다(강조된 배너 + "나가는 중" 문구) — 지금
 *    누르면 무슨 일이 일어나는지 숨겨져 있지 않다.
 * 3) 교체가 확정되면 지정이 자동 해제된다 — 지정을 깜빡 잊고 다음 탭에서
 *    의도치 않은 교체가 또 기록되는 사고를 막는다.
 * 4) 지정 중에는 같은 팀의 후보(벤치)만 탭 가능하게 좁아진다 — 다른 팀
 *    선수를 잘못 짝짓는 실수 자체가 구조적으로 불가능하다.
 * 5) 시각은 실제 확정 탭(들어올 선수) 순간에 얼린다 — 지정 탭 시점이 아니다
 *    (호출부 `operate-console.tsx`가 `onSubstitute` 콜백 안에서 그 순간에
 *    `freezeCapture()`를 호출한다).
 * 6) 그래도 잘못 확정됐다면 확정 직후 뜨는 토스트의 "되돌리기" 버튼으로
 *    한 번에 취소할 수 있다(`GamesService.reverseEvent`의 기존 정정 경로를
 *    그대로 재사용 — 새 되돌리기 경로를 만들지 않는다).
 */
export function QuickSubstitutionPanel({
  sides,
  lineups,
  onPitchParticipantIds,
  disabled,
  onSubstitute,
}: QuickSubstitutionPanelProps) {
  const [armed, setArmed] = useState<{ readonly sideId: string; readonly participant: GameLineupParticipant } | null>(
    null,
  );

  // 지정된 선수가 다른 경로(예: 되돌리기, 다른 운영자의 조작)로 이미 피치를
  // 떠났다면 지정을 유지할 이유가 없다 — 방치하면 더는 유효하지 않은 지정을
  // 보고 있게 된다.
  useEffect(() => {
    if (armed !== null && !onPitchParticipantIds.has(armed.participant.id)) setArmed(null);
  }, [armed, onPitchParticipantIds]);

  const onPitchBySide = (sideId: string) =>
    (lineups.find((lineup) => lineup.sideId === sideId)?.participants ?? []).filter((participant) =>
      onPitchParticipantIds.has(participant.id),
    );
  const benchBySide = (sideId: string) =>
    (lineups.find((lineup) => lineup.sideId === sideId)?.participants ?? []).filter(
      (participant) => !onPitchParticipantIds.has(participant.id),
    );

  return (
    <div
      className="rounded-xl border border-[var(--tint-blue-border)] bg-[var(--blue50)] p-3"
      aria-label="빠른 교체 모드"
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--blue700)]">
        <ArrowLeftRight size={13} aria-hidden="true" />
        빠른 교체 모드
      </div>

      {armed !== null ? (
        <div
          className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white"
          aria-live="polite"
        >
          <span className="text-sm font-semibold">
            {armed.participant.displayNameSnapshot} 나가는 중 · 들어올 선수를 탭하세요
          </span>
          {/* 44px 최소 터치 타깃 — 이 콘솔은 경기장에서 한 손으로 급하게
              조작한다는 실사용 맥락이라, 지정을 취소하는 버튼이 작으면
              오탭으로 지정이 풀려 다시 처음부터 해야 하는 상황이 잦아진다
              (Copilot 리뷰 지적: 32px). */}
          <button
            type="button"
            onClick={() => setArmed(null)}
            aria-label="교체 지정 취소"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="mb-2 text-xs text-[var(--text-muted)]">나갈 선수를 먼저 지정하세요.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sides.map((side) => {
          const isArmedSide = armed?.sideId === side.id;
          const targets = armed === null ? onPitchBySide(side.id) : isArmedSide ? benchBySide(side.id) : [];
          const emptyLabel =
            armed === null
              ? '피치 위 선수가 없어요.'
              : isArmedSide
                ? '교체 가능한 후보가 없어요.'
                : '다른 팀 지정 중이에요.';
          return (
            <div key={side.id}>
              <p className="mb-1 text-xs font-semibold text-[var(--text-muted)]">{side.displayNameSnapshot}</p>
              {targets.length === 0 ? (
                <p className="py-2 text-xs text-[var(--text-muted)]">{emptyLabel}</p>
              ) : (
                // `<li>`로 리스트 구조를 실제 마크업에 담는다 — 인터랙티브 버튼에
                // `role="listitem"`을 직접 얹으면 버튼의 암묵적 button 역할이
                // 덮어써져 스크린리더/접근성 트리에서 더 이상 버튼으로 노출되지
                // 않는다(`LineupGrid`가 이미 쓰는 것과 같은 패턴).
                <ul className="flex flex-wrap gap-1.5" role="list">
                  {targets.map((participant) => (
                    <li key={participant.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (armed !== null && isArmedSide) {
                            onSubstitute({ sideId: side.id, outParticipant: armed.participant, inParticipant: participant });
                            setArmed(null);
                          } else if (armed === null) {
                            setArmed({ sideId: side.id, participant });
                          }
                        }}
                        className={[
                          // 44px 최소 터치 타깃 — 이 칩이 바로 "지정" 또는
                          // (지정 중일 때는) "즉시 확정" 액션이다. 확정 칩을
                          // 36px로 두면 경기장에서 급하게 조작하다 옆 선수를
                          // 잘못 눌러 엉뚱한 교체가 그대로 기록되는 사고로
                          // 이어진다(Copilot 리뷰 지적).
                          'flex min-h-[44px] items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                          disabled ? 'cursor-not-allowed opacity-50' : '',
                          // 전수검수: hover:bg-green-100(raw, dark: 짝 없음)이 다크에서
                          // text-strong(거의 흰색) 텍스트와 겹쳐 대비 1.0:1까지 붕괴 —
                          // 같은 요소의 dark:border-green-500/30과 동일 계열로 짝을 맞춘다.
                          armed !== null
                            ? 'border-green-300 bg-[var(--green50)] text-[var(--text-strong)] hover:bg-green-100 dark:border-green-500/30 dark:hover:bg-green-500/20'
                            : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:bg-[var(--surface-soft)]',
                        ].join(' ')}
                      >
                        <span className="tabular-nums text-gray-400">{participant.jerseyNumber ?? '-'}</span>
                        {participant.displayNameSnapshot}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
