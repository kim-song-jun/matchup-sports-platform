import { describe, expect, it } from 'vitest';
import {
  buildFormationPresets,
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
});
