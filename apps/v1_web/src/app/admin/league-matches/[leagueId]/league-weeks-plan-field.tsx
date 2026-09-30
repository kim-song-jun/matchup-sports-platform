'use client';

import {
  plannedGameCount,
  suggestedWeeks,
  weeksPlanLabel,
  type WeeksPlan,
} from '@/lib/league-round-robin-plan';

/**
 * 대진 만들기·재생성 폼의 "주차 수" — 팀 수로 계산한 제안 칩(단일/홈앤어웨이)과 계획 요약 한 줄(F40).
 * 부모의 flex-wrap 행 안에서 fragment 자식이 그대로 flex 아이템이 된다(요약은 w-full 로 한 줄을 차지).
 */
export function LeagueWeeksPlanField({
  inputId,
  inputClassName,
  teamCount,
  gamesPerTeamPerDay,
  plan,
  weeksCount,
  onPlanChange,
}: {
  inputId: string;
  inputClassName: string;
  teamCount: number;
  gamesPerTeamPerDay: number;
  plan: WeeksPlan;
  weeksCount: number;
  onPlanChange: (plan: WeeksPlan) => void;
}) {
  const singleWeeks = suggestedWeeks(teamCount, 1, gamesPerTeamPerDay);
  const doubleWeeks = suggestedWeeks(teamCount, 2, gamesPerTeamPerDay);
  const games = plannedGameCount(teamCount, weeksCount, gamesPerTeamPerDay);
  const chips = [
    { kind: 'single' as const, label: `단일 ${singleWeeks}주` },
    { kind: 'double' as const, label: `홈앤어웨이 ${doubleWeeks}주` },
  ];

  return (
    <>
      <div className="w-full">
        <p className="rounded-lg bg-[var(--surface-soft)] p-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
          <span className="font-semibold">
            {teamCount}팀 · {weeksPlanLabel(plan)}
          </span>{' '}
          → {weeksCount}주차 · {games}경기가 만들어져요
          {plan.kind === 'custom' ? null : (
            <span className="tm-badge tm-badge-sm tm-badge-blue ml-2">
              팀 수로 자동 계산
            </span>
          )}
        </p>
        <div role="group" aria-label="대진 방식" className="mt-2 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.kind}
              type="button"
              className={`tm-chip ${plan.kind === chip.kind ? 'tm-chip-active' : ''}`}
              aria-pressed={plan.kind === chip.kind}
              onClick={() => onPlanChange({ kind: chip.kind })}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={inputId} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
          주차 수
        </label>
        <input
          id={inputId}
          type="number"
          min={1}
          max={52}
          value={weeksCount}
          onChange={(event) => {
            const weeks = Number(event.target.value);
            // 제안값과 같은 수를 치면 그 칩이 다시 켜진다 — 칩과 칸이 다른 말을 하지 않게.
            onPlanChange(
              weeks === singleWeeks ? { kind: 'single' } : weeks === doubleWeeks ? { kind: 'double' } : { kind: 'custom', weeks },
            );
          }}
          className={`${inputClassName} w-24`}
        />
      </div>
    </>
  );
}
