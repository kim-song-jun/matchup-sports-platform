import { describe, expect, it } from 'vitest';
import { panelDockSide } from './panel-dock-side';

describe('panelDockSide', () => {
  it.each([
    ['왼쪽 절반의 칸은 오른쪽에 붙는다', 100, 1136, 'end'],
    ['오른쪽 절반의 칸은 왼쪽에 붙는다', 900, 1136, 'start'],
    ['정확히 가운데면 오른쪽(end)', 568, 1136, 'end'],
    ['가운데를 1px 넘으면 왼쪽(start)', 569, 1136, 'start'],
    ['폭을 모르면(0) 오른쪽', 10, 0, 'end'],
  ] as const)('%s', (_name, nodeCenterX, containerWidth, expected) => {
    expect(panelDockSide({ nodeCenterX, containerWidth })).toBe(expected);
  });
});
