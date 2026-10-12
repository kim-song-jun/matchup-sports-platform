import { KST_OFFSET_MS } from '../kst-datetime';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SportFacet = { sportId: string; count: number };

/** 칩에 그대로 뿌리는 첫 페이지 전용 건수. 종목 건수는 종목 필터만 뺀 나머지 필터로 센다. */
export type ListFacets = {
  sports: SportFacet[];
  today?: number;
  recruiting?: number;
};

/** KST 달력 기준 오늘의 [시작, 다음 날 시작) 구간. 서버 시간대와 무관하다. */
export function kstDayRange(now: Date): { gte: Date; lt: Date } {
  const startMs = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return { gte: new Date(startMs), lt: new Date(startMs + DAY_MS) };
}

/** groupBy 결과를 건수 내림차순(동률은 id 순) 종목 건수로 바꾼다. 0건 종목은 행 자체가 없다. */
export function toSportFacets(rows: ReadonlyArray<{ sportId: string; _count: { _all: number } }>): SportFacet[] {
  return rows
    .map((row) => ({ sportId: row.sportId, count: row._count._all }))
    .filter((facet) => facet.count > 0)
    .sort((a, b) => b.count - a.count || a.sportId.localeCompare(b.sportId));
}

/**
 * 필터가 적용된 전체 건수. 종목 건수는 종목 필터만 뺀 집합이므로, 종목 필터가 있으면 그 종목의
 * 건수가 곧 전체 건수이고 없으면 전 종목의 합이다 — 별도 count 쿼리가 필요 없다.
 */
export function totalFromSportFacets(sports: SportFacet[], sportId?: string): number {
  if (sportId) return sports.find((facet) => facet.sportId === sportId)?.count ?? 0;
  return sports.reduce((sum, facet) => sum + facet.count, 0);
}

/** `today=true` 토글: KST 오늘 시작하는 경기. */
export function startsTodayWhere(now: Date) {
  return { startAt: kstDayRange(now) };
}

/** `recruitingOnly=true` 토글: 지금 신청할 수 있는 글 — 모집 중이고 시작 전이며 마감이 지나지 않았다. */
export function recruitingNowWhere(now: Date) {
  return {
    status: 'recruiting' as const,
    startAt: { gte: now },
    OR: [{ deadlineAt: null }, { deadlineAt: { gte: now } }],
  };
}
