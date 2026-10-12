import { kstDayRange } from '../../src/common/pagination/list-facets';

const MIN_REMAINING_MS = 2 * 60_000;

/**
 * KST 오늘 안에서 아직 시작하지 않은 시각 — 오늘 칩과 모집 중(시작 전) 조건을 모두 만족한다.
 * 하루가 2분도 안 남았으면 자정을 넘길 때까지 기다린 뒤 새 날의 한가운데를 돌려줘, 스펙 실행 중에
 * 날짜가 바뀌어 기대값이 어긋나는 일이 없다(최대 2분 대기 — beforeAll 타임아웃을 그만큼 늘릴 것).
 */
export async function startAtLaterTodayKst(): Promise<Date> {
  let now = new Date();
  let { lt } = kstDayRange(now);
  if (lt.getTime() - now.getTime() < MIN_REMAINING_MS) {
    await new Promise((resolve) => setTimeout(resolve, lt.getTime() - now.getTime() + 1000));
    now = new Date();
    ({ lt } = kstDayRange(now));
  }
  return new Date(now.getTime() + (lt.getTime() - now.getTime()) / 2);
}

export const KST_TODAY_FIXTURE_TIMEOUT_MS = MIN_REMAINING_MS + 30_000;
