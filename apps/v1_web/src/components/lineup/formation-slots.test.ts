import { describe, expect, it } from 'vitest';
import {
  goalkeeperPositionCode,
  slotsWithGoalkeeper,
  type FormationPreset,
  type LineupConfigPosition,
} from './formation-slots';

describe('formation-slots', () => {
  it('slotsWithGoalkeeper prepends a fixed (50,6) GK slot without mutating the source preset', () => {
    const preset: FormationPreset = {
      code: 'x',
      label: 'X',
      outfield: 1,
      slots: [{ positionCode: 'FIXO', label: '픽소', x: 30, y: 40 }],
    };
    const withGk = slotsWithGoalkeeper(preset);
    expect(withGk[0]).toEqual({ positionCode: 'GK', label: 'GK', x: 50, y: 6 });
    expect(withGk).toHaveLength(2);
    expect(preset.slots).toHaveLength(1); // 원본은 그대로다
  });

  // [알파 감사 E] 종목별 골키퍼 포지션 코드가 하드코딩된 'GK'가 아니라 positions 사전에서
  // 읽혀야 한다 — 풋살은 GOLEIRO/FIXO/ALA/PIVO를 쓰고 골키퍼 코드는 GOLEIRO다.
  it('goalkeeperPositionCode reads the sport-specific code from the positions dictionary (futsal: GOLEIRO, not GK)', () => {
    const footballPositions: LineupConfigPosition[] = [
      { code: 'GK', label: '골키퍼', short: 'GK', goalkeeper: true },
      { code: 'DF', label: '수비수', short: 'DF' },
    ];
    const futsalPositions: LineupConfigPosition[] = [
      { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
      { code: 'FIXO', label: '픽소', short: 'FX' },
    ];
    expect(goalkeeperPositionCode(footballPositions)).toBe('GK');
    expect(goalkeeperPositionCode(futsalPositions)).toBe('GOLEIRO');
  });

  it('goalkeeperPositionCode falls back to GK when no dictionary entry is flagged as goalkeeper (defensive)', () => {
    expect(goalkeeperPositionCode([{ code: 'FIXO', label: '픽소', short: 'FX' }])).toBe('GK');
  });
});
