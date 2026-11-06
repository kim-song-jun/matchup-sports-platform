import { normalizeFinalColors, reconcileFinalColors } from './multi-finals-colors';
const final = (name: string) => ({ name, rules: [], thirdPlace: false });
describe('stable final colors', () => {
  it.each([2, 3, 10])('assigns the first %i colors in configuration order', count => {
    const result = reconcileFinalColors(null, Array.from({ length: count }, (_, i) => final('final-'+i)));
    expect(result.finals.map(f => f.colorIndex)).toEqual(Array.from({ length: count }, (_, i) => i));
    expect(new Set(result.finals.map(f => f.id)).size).toBe(count);
  });
  it('keeps identity and colors across legacy hydration, rename, reorder, delete, add and JSON reload', () => {
    const legacy = normalizeFinalColors({ finals: [final('upper'), final('middle'), final('lower')] });
    expect(normalizeFinalColors({ finals: [final('upper'), final('middle'), final('lower')] })).toEqual(legacy);
    const saved = reconcileFinalColors(legacy, [ { ...legacy.finals[2], name: 'renamed' }, legacy.finals[0] ]);
    const reloaded = JSON.parse(JSON.stringify(saved));
    const added = reconcileFinalColors(reloaded, [...reloaded.finals, final('new')]);
    expect(added.finals.map(f => f.colorIndex)).toEqual([2, 0, 3]);
    expect(added.finals[0].id).toBe(legacy.finals[2].id);
    expect(added.nextColorIndex).toBe(4);
  });
  it('avoids duplicate active colors when replacing a destination after ten allocations', () => {
    const saved = reconcileFinalColors(null, Array.from({length: 10}, (_, i) => final('final-'+i)));
    const replaced = reconcileFinalColors(saved, [...saved.finals.filter((_, i) => i !== 1), final('new')]);
    expect(new Set(replaced.finals.map(f => f.colorIndex % 10)).size).toBe(10);
    expect(replaced.finals[9].colorIndex).toBe(11);
  });
  it('rejects unknown and duplicate identities', () => {
    const saved = reconcileFinalColors(null, [final('upper')]);
    expect(() => reconcileFinalColors(saved, [{ ...final('x'), id: 'unknown' }])).toThrow();
    expect(() => reconcileFinalColors(saved, [saved.finals[0], { ...saved.finals[0], name: 'x' }])).toThrow();
  });
});
