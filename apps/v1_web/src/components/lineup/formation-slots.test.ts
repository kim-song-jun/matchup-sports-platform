import { describe, expect, it } from 'vitest';
import {
  goalkeeperPositionCode,
  presetsFromLineupConfig,
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

  // Task 180 H7 — 5:5 경기는 필드 4명 대형만. 서버 사전은 필드 4·5명 대형을 함께 준다.
  describe('presetsFromLineupConfig', () => {
    const config = {
      positions: [
        { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
        { code: 'FIXO', label: '픽소', short: 'FX' },
        { code: 'PIVO', label: '피보', short: 'PV' },
      ],
      formations: [
        { code: '1-2-1', label: '다이아몬드', outfield: 4, slots: [{ position: 'FIXO', x: 50, y: 35 }] },
        { code: '2-2', label: '박스', outfield: 4, slots: [{ position: 'PIVO', x: 28, y: 76 }] },
        { code: '2-2-1', label: '박스 + 피보', outfield: 5, slots: [{ position: 'FIXO', x: 27, y: 33 }] },
      ],
    };

    it('필드 인원에 맞는 대형만 남기고, 서버 순서를 지킨다', () => {
      expect(presetsFromLineupConfig(config, 4).map((preset) => preset.code)).toEqual(['1-2-1', '2-2']);
      expect(presetsFromLineupConfig(config, 5).map((preset) => preset.code)).toEqual(['2-2-1']);
    });

    it('이미 저장된 대형은 인원이 달라도 목록에 남는다 (저장본을 읽을 수 있어야 한다)', () => {
      expect(presetsFromLineupConfig(config, 4, '2-2-1').map((preset) => preset.code)).toEqual(['1-2-1', '2-2', '2-2-1']);
    });

    it('슬롯 표시는 포지션 약칭이고, 사전에 없는 코드는 코드 그대로 쓴다', () => {
      expect(presetsFromLineupConfig(config, 4)[0].slots[0]).toEqual({ positionCode: 'FIXO', label: 'FX', x: 50, y: 35 });
      const unknown = presetsFromLineupConfig(
        { positions: [], formations: [{ code: 'x', label: 'X', outfield: 1, slots: [{ position: 'ZZ', x: 1, y: 2 }] }] },
        null,
      );
      expect(unknown[0].slots[0].label).toBe('ZZ');
    });
  });
});
