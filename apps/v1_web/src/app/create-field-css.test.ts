import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const marginTopOf = (selector: string) => {
  const rule = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].trim() === selector);
  return rule?.[2].match(/margin-top:\s*([^;]+);/)?.[1].trim();
};

// 팀 정보 폼은 레벨 select(.tm-create-input)와 정원 스테퍼를 같은 줄(two-col)에 놓는다.
// 두 컨트롤의 위 간격이 다르면 한쪽만 그만큼 내려가 윗선이 어긋난다(실측 4px).
describe('폼 컨트롤 윗선', () => {
  it('정원 스테퍼의 위 간격은 .tm-create-input 과 같다', () => {
    const input = marginTopOf('.tm-create-input');
    expect(input).toBeDefined();
    expect(marginTopOf('.tm-create-stepper')).toBe(input);
  });
});
