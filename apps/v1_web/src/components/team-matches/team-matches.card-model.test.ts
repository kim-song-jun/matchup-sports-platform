/**
 * `matches.card-model.test.ts` 와 같은 계약 — 누르면 실제로 필터가 걸리는 링크만 만든다.
 */
import { describe, expect, it } from 'vitest';
import { buildSportChips } from './team-matches.card-model';
import { getTeamMatchListViewModel } from './team-matches.view-model';
import type { V1Sport, V1TeamMatch } from '@/types/api';

const base = getTeamMatchListViewModel();
const futsal = { id: 'uuid-futsal', name: '풋살', levels: [] } as unknown as V1Sport;
const matches = [{ id: 'tm1', sport: { id: 's', name: '풋살' } }] as unknown as V1TeamMatch[];

describe('buildSportChips', () => {
  it('마스터 종목이 있으면 그 ID 로 필터 링크를 만든다', () => {
    const chips = buildSportChips({ base, params: new URLSearchParams(), matches, sports: [futsal] });

    expect(chips.find((c) => c.label === '풋살')?.href).toBe('/team-matches?sportId=uuid-futsal');
  });

  it('마스터 종목이 없으면 종목 칩에 링크를 붙이지 않는다', () => {
    const chips = buildSportChips({ base, params: new URLSearchParams(), matches });

    for (const chip of chips.slice(1)) {
      expect(chip.href, `${chip.label} 칩에 링크가 붙었다`).toBeUndefined();
    }
  });

  it("'전체' 칩은 마스터가 없어도 링크를 유지한다", () => {
    const chips = buildSportChips({ base, params: new URLSearchParams(), matches });

    expect(chips[0].href).toBe('/team-matches');
  });
});
