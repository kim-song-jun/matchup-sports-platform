import { describe, expect, it } from 'vitest';
import { buildScheduleFilters, groupScheduleEntries } from './schedule-grouping';
import type { PublicScheduleEntry } from './types';

/**
 * alpha 실측 데이터 그대로: A조(1) · B조(2) · 4강(3,4) · 결승(5) · 3·4위전(6).
 * 서버가 준 배열 순서는 진행 순서와 다르다(결승이 4강보다 앞에 온다) — 그룹 순서를
 * `fixtureNumber` 로 정하는 이유가 바로 이것이다.
 */
function entry(overrides: Partial<PublicScheduleEntry> & Pick<PublicScheduleEntry, 'fixtureId' | 'round' | 'fixtureNumber'>): PublicScheduleEntry {
  return {
    groupId: 'g',
    groupName: null,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    fieldName: null,
    home: null,
    away: null,
    visibilityMode: 'official_only',
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: null,
    clock: null,
    periodBreak: null,
    scorers: [],
    cards: [],
    hasVideo: false,
    ...overrides,
  } as PublicScheduleEntry;
}

const ALPHA_SHAPE: PublicScheduleEntry[] = [
  entry({ fixtureId: 'b', round: '조별 1라운드', groupName: 'B조', fixtureNumber: 2 }),
  entry({ fixtureId: 'a', round: '조별 1라운드', groupName: 'A조', fixtureNumber: 1 }),
  entry({ fixtureId: 'final', round: '결승', groupName: '결승', fixtureNumber: 5 }),
  entry({ fixtureId: 'semi1', round: '4강', groupName: '4강', fixtureNumber: 3 }),
  entry({ fixtureId: 'third', round: '3·4위전', groupName: '3위 결정전', fixtureNumber: 6 }),
  entry({ fixtureId: 'semi2', round: '4강', groupName: '4강', fixtureNumber: 4 }),
];

describe('groupScheduleEntries', () => {
  it('조별리그와 결선으로 나누고, 각 단계 안에서 진행 순서대로 묶는다', () => {
    const phases = groupScheduleEntries(ALPHA_SHAPE);

    expect(phases.map((phase) => phase.label)).toEqual(['조별리그', '결선']);
    expect(phases[0].groups.map((group) => group.label)).toEqual(['A조', 'B조']);
    // 결선은 4강(3,4) → 결승(5) → 3·4위전(6) 순 — 서버 배열 순서(결승이 4강보다 앞)가 아니다.
    expect(phases[1].groups.map((group) => group.label)).toEqual(['4강', '결승', '3위 결정전']);
    // 같은 그룹 안에서도 fixtureNumber 순
    expect(phases[1].groups[0].entries.map((e) => e.fixtureId)).toEqual(['semi1', 'semi2']);
  });

  it('조별리그가 없는 순수 토너먼트는 결선 단계만 남긴다 (빈 제목을 만들지 않는다)', () => {
    const phases = groupScheduleEntries([
      entry({ fixtureId: 'f', round: '결승', groupName: '결승', fixtureNumber: 1 }),
    ]);

    expect(phases.map((phase) => phase.key)).toEqual(['knockout']);
  });

  it('"3위 결정전"을 조별리그로 오해하지 않는다 ("조"로 끝나지 않고 round 도 조별이 아니다)', () => {
    const phases = groupScheduleEntries([
      entry({ fixtureId: 'third', round: '3·4위전', groupName: '3위 결정전', fixtureNumber: 1 }),
    ]);

    expect(phases[0].key).toBe('knockout');
  });

  it('그룹 이름이 없으면 라운드 이름으로 묶는다 (제목 없는 묶음을 만들지 않는다)', () => {
    const phases = groupScheduleEntries([
      entry({ fixtureId: 'x', round: '8강', groupName: null, fixtureNumber: 1 }),
    ]);

    expect(phases[0].groups[0].label).toBe('8강');
  });
});

describe('buildScheduleFilters', () => {
  it('내 경기가 없으면 "내 팀" 칩을 만들지 않는다 (눌러도 빈 화면인 버튼)', () => {
    const phases = groupScheduleEntries(ALPHA_SHAPE);

    expect(buildScheduleFilters(phases, false).map((f) => f.key)).toEqual(['all', 'group_stage', 'knockout']);
    expect(buildScheduleFilters(phases, true).map((f) => f.key)).toEqual(['all', 'mine', 'group_stage', 'knockout']);
  });

  it('없는 단계는 칩으로 만들지 않는다', () => {
    const phases = groupScheduleEntries([entry({ fixtureId: 'f', round: '결승', groupName: '결승', fixtureNumber: 1 })]);

    expect(buildScheduleFilters(phases, false).map((f) => f.key)).toEqual(['all', 'knockout']);
  });
});
