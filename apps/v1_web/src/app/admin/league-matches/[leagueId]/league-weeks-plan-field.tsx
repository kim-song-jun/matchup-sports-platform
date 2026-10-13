'use client';

import { resolveFixturePlan, weeksPlanLabel, type WeeksPlan } from '@/lib/league-round-robin-plan';

/**
 * 대진 만들기·재생성 폼의 "주차 수"(= 경기 날짜 수) — 팀 수·하루 경기 수로 계산한 제안 칩(단일/홈앤어웨이)과
 * 계획 요약 한 줄(F40).
 * 부모 grid 안에서 fragment 자식이 그대로 grid 아이템이 된다(요약은 col-span-full 로 한 줄을 차지).
 */
export function LeagueWeeksPlanField({
  inputId,
  inputClassName,
  teamCount,
  gamesPerDay,
  plan,
  plannedFixtureCount,
  onPlanChange,
}: {
  inputId: string;
  inputClassName: string;
  teamCount: number;
  /** 하루 경기 수. null 이면 하루 한 라운드. */
  gamesPerDay: number | null;
  plan: WeeksPlan;
  /** 리그를 만들 때 정한 총 경기 수. 있으면 '총 N경기' 칩이 생긴다. */
  plannedFixtureCount?: number | null;
  onPlanChange: (plan: WeeksPlan) => void;
}) {
  const singleWeeks = resolveFixturePlan({ kind: 'single' }, teamCount, gamesPerDay).days;
  const doubleWeeks = resolveFixturePlan({ kind: 'double' }, teamCount, gamesPerDay).days;
  const { games, days } = resolveFixturePlan(plan, teamCount, gamesPerDay);
  const perDay = gamesPerDay ?? Math.floor(teamCount / 2);
  // 하루 경기 수가 총 경기를 나눠떨어뜨리지 않으면 마지막 날만 덜 찬다.
  const lastDayGames = days <= 1 || perDay < 1 ? 0 : games % perDay;
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
          → {days}주차 · {games}경기가 만들어져요
          {plan.kind === 'custom' || plan.kind === 'fixtures' ? null : (
            <span className="tm-badge tm-badge-sm tm-badge-blue ml-2">
              팀 수로 자동 계산
            </span>
          )}
          {lastDayGames > 0 ? (
            <span className="mt-1 block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              마지막 주차에는 {lastDayGames}경기만 열려요
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
          value={days}
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
