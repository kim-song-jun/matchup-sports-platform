import { describe, expect, it } from 'vitest';
import {
  buildFormationPresets,
  describeSquadSize,
  goalkeeperPositionCode,
  presetsForOutfieldCount,
  slotsWithGoalkeeper,
  type FormationPreset,
  type LineupConfigFormation,
  type LineupConfigPosition,
} from './formation-slots';

describe('formation-slots', () => {
  it('buildFormationPresets resolves each slot label from the positions dictionary — proves there is no hardcoded catalog', () => {
    const positions: LineupConfigPosition[] = [
      { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
      { code: 'FIXO', label: '픽소', short: 'FX' },
      { code: 'PIVO', label: '피보', short: 'PV' },
    ];
    const formations: LineupConfigFormation[] = [
      {
        code: '2-2',
        label: '박스',
        outfield: 4,
        slots: [
          { position: 'FIXO', x: 28, y: 38 },
          { position: 'PIVO', x: 28, y: 76 },
        ],
      },
    ];
    expect(buildFormationPresets(positions, formations)).toEqual<FormationPreset[]>([
      {
        code: '2-2',
        label: '박스',
        outfield: 4,
        slots: [
          { positionCode: 'FIXO', label: '픽소', x: 28, y: 38 },
          { positionCode: 'PIVO', label: '피보', x: 28, y: 76 },
        ],
      },
    ]);
  });

  it('buildFormationPresets returns an empty array when formations is empty — no fallback catalog exists to fall back to', () => {
    expect(buildFormationPresets([{ code: 'FIXO', label: '픽소', short: 'FX' }], [])).toEqual([]);
  });

  it('buildFormationPresets falls back to the raw code as label when a slot references an unknown position code (defensive, server/client drift)', () => {
    const presets = buildFormationPresets(
      [{ code: 'FIXO', label: '픽소', short: 'FX' }],
      [{ code: 'x', label: 'X', outfield: 1, slots: [{ position: 'UNKNOWN', x: 50, y: 50 }] }],
    );
    expect(presets[0].slots[0]).toEqual({ positionCode: 'UNKNOWN', label: 'UNKNOWN', x: 50, y: 50 });
  });

  it('presetsForOutfieldCount returns only presets matching the given outfield count, preserving order', () => {
    const presets: FormationPreset[] = [
      { code: 'a', label: 'A', outfield: 4, slots: [] },
      { code: 'b', label: 'B', outfield: 5, slots: [] },
      { code: 'c', label: 'C', outfield: 4, slots: [] },
    ];
    expect(presetsForOutfieldCount(presets, 4).map((p) => p.code)).toEqual(['a', 'c']);
    expect(presetsForOutfieldCount(presets, 6)).toEqual([]);
  });

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

/**
 * PR #402 Copilot 리뷰가 잡은 실제 결함의 회귀 테스트: 출전 인원은 **범위**인데
 * maxPlayers만 단일 값처럼 비교해, 범위 안에 있는 정상 선발 수에도 경고가 떴다.
 */
describe('describeSquadSize', () => {
  it('축구 7~11 경기에서 선발 9명은 정상이므로 경고하지 않는다 (예전엔 "11명인데 9명"이라고 틀린 경고)', () => {
    expect(describeSquadSize(7, 11, 9)).toEqual({ label: '7~11명', outOfRange: false });
  });

  it('범위를 벗어나면 경고한다 — 하한 미달과 상한 초과 모두', () => {
    expect(describeSquadSize(7, 11, 6).outOfRange).toBe(true);
    expect(describeSquadSize(7, 11, 12).outOfRange).toBe(true);
  });

  it('경계값(하한·상한 정확히 일치)은 정상으로 본다', () => {
    expect(describeSquadSize(7, 11, 7).outOfRange).toBe(false);
    expect(describeSquadSize(7, 11, 11).outOfRange).toBe(false);
  });

  it('min과 max가 같으면 범위가 아니라 단일 인원으로 표기한다 (5인제 대회)', () => {
    expect(describeSquadSize(5, 5, 5)).toEqual({ label: '5명', outOfRange: false });
    expect(describeSquadSize(5, 5, 4).outOfRange).toBe(true);
  });

  it('선발이 아직 0명이면 "벗어났다"고 말하지 않는다 — 막 진입한 화면에서 경고가 뜨면 안 된다', () => {
    expect(describeSquadSize(7, 11, 0).outOfRange).toBe(false);
  });

  it('인원 정보가 없는 구버전 응답에서는 안내를 생략한다 — 모르는 값으로 경고하지 않는다', () => {
    expect(describeSquadSize(null, null, 9)).toEqual({ label: null, outOfRange: false });
    expect(describeSquadSize(7, null, 9)).toEqual({ label: null, outOfRange: false });
  });
});
