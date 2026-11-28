import { describe, expect, it } from 'vitest';
import {
  TOURNAMENT_PERIOD_PHASES,
  periodLabels,
  switchPeriodCount,
  tournamentPeriodPhaseLabel,
  tournamentPeriodPhaseShortLabel,
} from './tournament-period-phases';

describe('periodLabels', () => {
  it('경기 시간 입력칸 이름 — 1개 단판, 2개 전반·후반, 3개 이상은 1부·2부·3부(피리어드 금지)', () => {
    expect(periodLabels(1)).toEqual(['단판']);
    expect(periodLabels(2)).toEqual(['전반', '후반']);
    expect(periodLabels(3)).toEqual(['1부', '2부', '3부']);
    expect(periodLabels(4)).toEqual(['1부', '2부', '3부', '4부']);
  });
});

describe('switchPeriodCount', () => {
  it('전·후반 ↔ 단판 전환은 합계를 지킨다', () => {
    expect(switchPeriodCount(['20', '20'], 1)).toEqual(['40']);
    expect(switchPeriodCount(['41'], 2)).toEqual(['21', '20']);
    expect(switchPeriodCount(['40'], 2)).toEqual(['20', '20']);
    // 비어 있거나 숫자가 아닌 칸은 0분으로 센다.
    expect(switchPeriodCount(['', '15'], 1)).toEqual(['15']);
    expect(switchPeriodCount(['abc', '30'], 1)).toEqual(['30']);
  });
});

describe('경기 시간 단계 이름', () => {
  it('단계 이름은 목록용 label 과 문장용 shortLabel 이 다르다', () => {
    expect(tournamentPeriodPhaseLabel('round16')).toBe('16강 · 12팀 결선의 12강');
    expect(tournamentPeriodPhaseShortLabel('round16')).toBe('16강');
    expect(tournamentPeriodPhaseLabel('quarter')).toBe('8강 · 6팀 대진의 6강');
    expect(tournamentPeriodPhaseShortLabel('quarter')).toBe('8강');
    expect(tournamentPeriodPhaseLabel('final')).toBe('결승');
    expect(tournamentPeriodPhaseShortLabel('third_place')).toBe('3·4위전');
  });

  it('모르는 단계는 그 값을 그대로 돌려준다', () => {
    // @ts-expect-error — 서버가 새 단계를 내려도 화면이 깨지지 않아야 한다.
    expect(tournamentPeriodPhaseLabel('future_phase')).toBe('future_phase');
    // @ts-expect-error — 위와 같다.
    expect(tournamentPeriodPhaseShortLabel('future_phase')).toBe('future_phase');
  });

  it('단계 9개가 조별리그부터 3·4위전까지 이 순서로 있다', () => {
    expect(TOURNAMENT_PERIOD_PHASES.map((phase) => phase.value)).toEqual([
      'group',
      'round64',
      'round32',
      'round16',
      'round12',
      'quarter',
      'semi',
      'final',
      'third_place',
    ]);
  });
});
