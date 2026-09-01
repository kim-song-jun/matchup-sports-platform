/**
 * 종목 칩의 링크 계약 — **누르면 실제로 필터가 걸리는 링크만 만든다.**
 * 서버 프리렌더가 마스터 종목 없이도 이 함수를 호출하므로 두 경로를 모두 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { buildSportSummary } from './matches.card-model';
import { getMatchListViewModel } from './matches.view-model';
import type { V1Match, V1Sport } from '@/types/api';

const base = getMatchListViewModel();
const futsal = { id: 'uuid-futsal', name: '풋살', levels: [] } as unknown as V1Sport;

function match(sportName: string): V1Match {
  return { id: 'm1', matchId: 'm1', sport: { id: 's', name: sportName }, startsAt: '2026-10-01T00:00:00.000Z' } as unknown as V1Match;
}

describe('buildSportSummary', () => {
  it('마스터 종목이 있으면 그 ID 로 필터 링크를 만든다', () => {
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base, undefined, [futsal]);

    expect(chips.find((c) => c.label === '풋살')?.href).toBe('/matches?sportId=uuid-futsal');
  });

  it('마스터 종목이 없으면 종목 칩에 링크를 붙이지 않는다', () => {
    // 예전에는 sportId 없는 `/matches` 로 링크해, 눌러도 필터가 걸리지 않는 '가짜 필터'가 됐다.
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base);

    for (const chip of chips.slice(1)) {
      expect(chip.href, `${chip.label} 칩에 링크가 붙었다`).toBeUndefined();
    }
  });

  it("'전체' 칩은 마스터가 없어도 링크를 유지한다 — 필터 해제는 sportId 없이도 유효하다", () => {
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base);

    expect(chips[0].href).toBe('/matches');
  });

  it('마스터에 없는 종목만 링크가 빠진다', () => {
    const chips = buildSportSummary(new URLSearchParams(), [match('풋살')], base, undefined, [futsal]);

    expect(chips.find((c) => c.label === '풋살')?.href).toBeDefined();
    expect(chips.find((c) => c.label === '축구')?.href).toBeUndefined();
  });
});
