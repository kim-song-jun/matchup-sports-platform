import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const GLOBALS = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
const TOKENS = readFileSync(resolve(process.cwd(), 'src/app/tokens.css'), 'utf8');

// 등번호 칸이 56px(글자 영역 22px)이라 데스크톱 스핀 버튼이 폭을 먹어 10 이 "1" 로만 보이던 결함(L7).
// jsdom 은 레이아웃을 재지 못하므로, 그 결함을 만든 두 조건(스핀 버튼 · 좁은 폭)을 스타일 규칙에서 직접 고정한다.
describe('.tm-input-compact-number', () => {
  const rule = GLOBALS.match(/\.tm-input-compact-number\s*\{([^}]*)\}/)?.[1] ?? '';

  it('스핀 버튼을 숨겨 좁은 칸의 글자 폭을 지킨다', () => {
    expect(rule).toMatch(/appearance:\s*textfield/);
    expect(GLOBALS).toMatch(/\.tm-input-compact-number::-webkit-inner-spin-button[^{]*\{[^}]*-webkit-appearance:\s*none/);
  });

  it('폭은 토큰이고, 좌우 패딩을 뺀 글자 영역에 세 자리가 들어간다', () => {
    expect(rule).toMatch(/width:\s*var\(--size-input-compact-number\)/);
    const width = Number(TOKENS.match(/--size-input-compact-number:\s*(\d+)px/)?.[1]);
    const padding = Number(TOKENS.match(/--spacing-2:\s*(\d+)px/)?.[1]);
    // 15px 글자의 숫자 한 자리는 넉넉히 12px 로 잡는다. 테두리 1px × 2 포함.
    expect(width - padding * 2 - 2).toBeGreaterThanOrEqual(12 * 3);
  });

  it('44px 터치 높이는 .tm-input 의 min-height 를 그대로 물려받는다', () => {
    expect(rule).not.toMatch(/min-height/);
    expect(GLOBALS.match(/\.tm-input\s*\{([^}]*)\}/)?.[1]).toMatch(/min-height:\s*(50|4[4-9])px/);
  });
});
