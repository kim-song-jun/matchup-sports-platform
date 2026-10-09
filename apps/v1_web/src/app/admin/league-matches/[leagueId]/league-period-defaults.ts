import type { TournamentPeriodSettingsResponse } from '@/hooks/use-tournament-period-settings';

type PeriodSettings = Pick<TournamentPeriodSettingsResponse, 'periods'> | undefined;

/** Regulation length in minutes, or null while unknown (loading, legacy count-only settings). */
export function totalPeriodMinutes(settings: PeriodSettings): number | null {
  const periods = settings?.periods;
  if (!periods?.length) return null;
  return periods.reduce((sum, period) => sum + period.durationMinutes, 0);
}

/** Short label for the hint text: "전·후반 25분", "단판 40분", otherwise the plain total. */
export function describeLeaguePeriods(settings: PeriodSettings): string | null {
  const total = totalPeriodMinutes(settings);
  const periods = settings?.periods;
  if (total === null || !periods) return null;
  if (periods.length === 1) return `단판 ${total}분`;
  if (periods.length === 2 && periods[0].durationMinutes === periods[1].durationMinutes) {
    return `전·후반 ${periods[0].durationMinutes}분`;
  }
  return `합계 ${total}분`;
}
