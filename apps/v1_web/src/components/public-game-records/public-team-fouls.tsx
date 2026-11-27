import { periodLabel } from '@/shared/game-operations/period-label';
import type { PublicTeamFouls } from './types';

/**
 * 공개 경기 화면의 팀 파울 — 스코어 카드의 팀 이름 바로 아래에 두 팀의 파울을 방송 중계처럼 채워지는 바로 보여 준다.
 * **진행 중인 경기에서만** 응답에 있고(서버가 경기가 끝나면 값을 싣지 않는다) 기록으로 남지 않는다.
 *
 * - 칸 수 = 대회·리그의 팀 파울 기준(`threshold`). 기준 개수에 이르면(= "다음 파울부터 10m 프리킥" 구간) 바 전체가 빨강이고
 *   문구는 개수 대신 "10m 프리킥" 하나로 바뀐다. 기준을 넘어도 색·문구는 그대로다.
 * - 기준이 크면(11개 이상) 칸이 너무 얇아져 칸 대신 하나로 이어진 바를 채운다.
 * - 색(주황 → 빨강)만으로 구분하지 않는다 — 빨강일 때는 문구가 함께 바뀌고 `aria-label` 도 같은 말을 한다.
 */
const SEGMENTED_BAR_MAX_THRESHOLD = 10;

function FoulBar({ count, threshold, name }: { readonly count: number; readonly threshold: number; readonly name: string }) {
  const reached = count >= threshold;
  const fill = reached ? 'bg-red-500' : 'bg-orange-500';
  const label = reached
    ? `${name} 팀 파울 기준 ${threshold}개에 이르렀어요. 10m 프리킥`
    : `${name} 팀 파울 ${count}개, 기준 ${threshold}개`;
  return (
    <span role="img" aria-label={label} className="flex w-full max-w-[92px] gap-[3px] md:max-w-[132px] md:gap-1">
      {threshold <= SEGMENTED_BAR_MAX_THRESHOLD ? (
        Array.from({ length: threshold }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full md:h-2 ${index < count ? fill : 'bg-[var(--grey200)]'}`}
          />
        ))
      ) : (
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--grey200)] md:h-2">
          <span className={`block h-full ${fill}`} style={{ width: `${Math.min(100, (count / threshold) * 100)}%` }} />
        </span>
      )}
    </span>
  );
}

function FoulCell({
  count,
  threshold,
  name,
  align,
}: {
  readonly count: number;
  readonly threshold: number;
  readonly name: string;
  readonly align: 'home' | 'away';
}) {
  const reached = count >= threshold;
  // 좁은 화면은 칸 가운데, 넓은 화면은 점수에 가까운 쪽 끝에 맞춘다(팀 이름이 점수 쪽으로 붙어 있어서 바도 이름 밑에 놓인다).
  const alignClass =
    align === 'home' ? 'items-center text-center md:items-end md:text-right' : 'items-center text-center md:items-start md:text-left';
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${alignClass}`}>
      <FoulBar count={count} threshold={threshold} name={name} />
      {reached ? (
        <span className="whitespace-nowrap text-[length:var(--font-size-caption)] font-bold text-red-700 dark:text-red-300">10m 프리킥</span>
      ) : (
        <span className="tab-num text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)]">파울 {count}</span>
      )}
    </div>
  );
}

export function PublicTeamFoulsRow({
  teamFouls,
  periodCount,
  homeName,
  awayName,
}: {
  readonly teamFouls: PublicTeamFouls;
  readonly periodCount?: number | null;
  readonly homeName: string;
  readonly awayName: string;
}) {
  const periodName = periodLabel(teamFouls.periodNumber, periodCount);
  return (
    // 스코어 줄(이름 · 84px 점수 · 이름)과 같은 열 폭·간격이라 바가 이름 바로 아래에 놓인다.
    <div
      role="group"
      aria-label={`${periodName} 팀 파울`}
      className="mt-3 grid grid-cols-[1fr_84px_1fr] items-start gap-3"
    >
      <FoulCell count={teamFouls.home} threshold={teamFouls.threshold} name={homeName} align="home" />
      <span className="text-center text-[length:var(--font-size-micro)] font-semibold leading-tight text-[var(--text-caption)]">
        {periodName} 팀 파울
      </span>
      <FoulCell count={teamFouls.away} threshold={teamFouls.threshold} name={awayName} align="away" />
    </div>
  );
}
