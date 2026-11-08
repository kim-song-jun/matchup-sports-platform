import { groupScheduleEntries } from './schedule-grouping';
import type { PublicScheduleEntry } from './types';

/** 아직 시작하지 않은 경기. 공개 일정의 status 는 scheduled | live | ended | cancelled 다. */
export function isUpcomingEntry(entry: Pick<PublicScheduleEntry, 'status'>): boolean {
  return entry.status === 'scheduled';
}

/**
 * "예정만" 이 가리는 경기 — 끝났거나 취소된 경기. 진행 중인 경기는 예정은 아니지만
 * 지금 뛰고 있으므로 가리지 않는다.
 */
export function isPastEntry(entry: Pick<PublicScheduleEntry, 'status'>): boolean {
  return entry.status !== 'scheduled' && entry.status !== 'live';
}

/**
 * "다음 경기" — 예정 경기 중 시각이 가장 이른 것. 시각이 같거나 아무도 시각이 없으면
 * 화면에 그려지는 순서(조 → 결선, 경기 번호)에서 앞선 경기다.
 */
export function nextUpcomingFixtureId(entries: readonly PublicScheduleEntry[]): string | null {
  const upcoming = groupScheduleEntries(entries)
    .flatMap((phase) => phase.groups.flatMap((group) => group.entries))
    .filter(isUpcomingEntry);
  let next: { id: string; at: number } | null = null;
  for (const entry of upcoming) {
    const at = entry.scheduledAt === null ? Number.NaN : Date.parse(entry.scheduledAt);
    if (Number.isNaN(at)) continue;
    if (next === null || at < next.at) next = { id: entry.fixtureId, at };
  }
  return next?.id ?? upcoming[0]?.fixtureId ?? null;
}
