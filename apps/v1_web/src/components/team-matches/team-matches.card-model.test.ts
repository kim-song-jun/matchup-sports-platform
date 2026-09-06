/**
 * `matches.card-model.test.ts` 와 같은 계약 — 누르면 실제로 필터가 걸리는 링크만 만든다.
 */
import { describe, expect, it } from 'vitest';
import { buildSportChips, getStatus } from './team-matches.card-model';
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

/**
 * 목록과 상세가 서로 다른 상태를 말하던 결함(2026-09-07 제보: "밖에서는 모집중으로 뜨고
 * 안에서는 신청 마감")의 프론트 쪽 방어선. 서버가 displayState 를 실어주면 그걸 쓰지만,
 * 안 실어주는 응답이 섞여도 마감된 팀매치를 '모집 중'으로 그리면 안 된다.
 */
describe('getStatus — 마감 판정', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const teamMatch = (overrides: Partial<V1TeamMatch>) => overrides as V1TeamMatch;

  it('displayState 가 없어도 신청 마감이 지났으면 closed 로 본다', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', deadlineAt: past }))).toBe('closed');
  });

  it('마감이 아직 남았으면 recruiting 그대로다', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', deadlineAt: future }))).toBe('recruiting');
  });

  it('마감 자체가 없으면 recruiting 그대로다 (마감 없음 = 시작 전까지 받는다)', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', deadlineAt: null }))).toBe('recruiting');
  });

  it('서버 displayState 가 더 구체적이면 그 값을 그대로 쓴다', () => {
    expect(getStatus(teamMatch({ status: 'recruiting', displayState: 'expired', deadlineAt: past }))).toBe('expired');
    expect(getStatus(teamMatch({ status: 'recruiting', displayState: 'matched', deadlineAt: future }))).toBe('matched');
  });
});
