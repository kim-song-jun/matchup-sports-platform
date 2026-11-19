/** Mirrors the existing periods DTO: a non-empty list of positive integer minutes. */
export function hasValidPeriodDurations(durations: readonly string[]): boolean {
  return durations.length > 0 && durations.every(duration => {
    const minutes = Number(duration.trim());
    return /^\d+$/.test(duration.trim()) && Number.isInteger(minutes) && minutes >= 1;
  });
}
