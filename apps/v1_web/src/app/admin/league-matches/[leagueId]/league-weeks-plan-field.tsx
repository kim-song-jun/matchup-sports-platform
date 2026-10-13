'use client';

import {
  plannedGameCount,
  plannedRounds,
  suggestedWeeks,
  weeksPlanLabel,
  type WeeksPlan,
} from '@/lib/league-round-robin-plan';

/**
 * 대진 만들기·재생성 폼의 "주차 수" — 팀 수로 계산한 제안 칩(단일/홈앤어웨이)과 계획 요약 한 줄(F40).
 * 부모 grid 안에서 fragment 자식이 그대로 grid 아이템이 된다(요약은 col-span-full 로 한 줄을 차지).
 */
export function LeagueWeeksPlanField({
  inputId,
  inputClassName,
  teamCount,
  gamesPerTeamPerDay,
  plan,
  weeksCount,
  plannedFixtureCount,
  onPlanChange,
}: {
  inputId: string;
  inputClassName: string;
  teamCount: number;
  gamesPerTeamPerDay: number;
  plan: WeeksPlan;
  weeksCount: number;
  /** 리그를 만들 때 정한 총 경기 수. 있으면 '총 N경기' 칩이 생긴다. */
  plannedFixtureCount?: number | null;
  onPlanChange: (plan: WeeksPlan) => void;
}) {
  const singleWeeks = suggestedWeeks(teamCount, 1, gamesPerTeamPerDay);
  const doubleWeeks = suggestedWeeks(teamCount, 2, gamesPerTeamPerDay);
  const rounds = plannedRounds(plan, teamCount, weeksCount, gamesPerTeamPerDay);
  // 총 경기 수 방식은 마지막 라운드를 서버가 그 수에서 자른다.
  const games = plan.kind === 'fixtures' ? Math.min(plan.count, plannedGameCount(teamCount, rounds)) : plannedGameCount(teamCount, rounds);
  const lastDayRounds =
    plan.kind === 'custom' || weeksCount <= 1 ? 0 : rounds % Math.max(1, gamesPerTeamPerDay);
  const chips: Array<{ plan: WeeksPlan; label: string }> = [
    ...(plannedFixtureCount ? [{ plan: { kind: 'fixtures', count: plannedFixtureCount } as const, label: `총 ${plannedFixtureCount}경기` }] : []),
    { plan: { kind: 'single' }, label: `단일 ${singleWeeks}주` },
    { plan: { kind: 'double' }, label: `홈앤어웨이 ${doubleWeeks}주` },
  ];

  return (
    <>
      <div className="col-span-full">
        <p className="tm-on-tint rounded-lg bg-[var(--surface-soft)] p-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
          <span className="font-semibold">
            {teamCount}팀 · {weeksPlanLabel(plan)}
          </span>{' '}
          → {weeksCount}주차 · {games}경기가 만들어져요
          {plan.kind === 'custom' || plan.kind === 'fixtures' ? null : (
            <span className="tm-badge tm-badge-sm tm-badge-blue ml-2">
              팀 수로 자동 계산
            </span>
          )}
          {lastDayRounds > 0 ? (
            <span className="mt-1 block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {plan.kind === 'single' ? '라운드로빈은 한 번씩만 만나요 — ' : null}
              마지막 주에는 {lastDayRounds}라운드만 열려요
            </span>
          ) : null}
        </p>
        <div role="group" aria-label="대진 방식" className="mt-2 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.plan.kind}
              type="button"
              className={`tm-chip ${plan.kind === chip.plan.kind ? 'tm-chip-active' : ''}`}
              aria-pressed={plan.kind === chip.plan.kind}
              onClick={() => onPlanChange(chip.plan)}
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
          className={`${inputClassName} w-full`}
        />
      </div>
    </>
  );
}
