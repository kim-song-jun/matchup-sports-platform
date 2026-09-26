import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 랜딩의 반복 모션은 "움직임 멈추기" 버튼과 뷰포트 밖 정지(WCAG 2.2.2)가 CSS 로 멈춘다.
 * `animation` 단축 속성은 play-state 를 running 으로 되돌리므로, 정지는 재생 규칙 안의
 * `animation-play-state: var(--tm-landing-play)` 로만 먹는다 — 따로 거는 정지 셀렉터는
 * 특이도에서 져서 버튼을 눌러도 계속 움직였다(적대 리뷰 실측).
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/app/desktop/landing.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

describe('landing.css 반복 모션 정지', () => {
  const infinite = rules(CSS).filter((r) => /animation:[^;]*\binfinite\b/.test(r.body));

  it('무한 반복 애니메이션이 있다(검사 대상이 비어 통과하지 않게)', () => {
    expect(infinite.length).toBeGreaterThanOrEqual(7);
  });

  it('무한 반복 애니메이션마다 정지 변수를 play-state 로 읽는다', () => {
    const missing = infinite
      .filter((r) => !/animation-play-state:\s*var\(--tm-landing-play\b/.test(r.body))
      .map((r) => r.selector);
    expect(missing).toEqual([]);
  });

  it('멈추기 버튼과 뷰포트 밖 구역이 정지 변수를 paused 로 바꾼다', () => {
    const pausers = rules(CSS)
      .filter((r) => /--tm-landing-play:\s*paused/.test(r.body))
      .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
    expect(pausers).toContain(".tm-landing[data-paused='true']");
    expect(pausers).toContain(".tm-landing [data-loop='off']");
  });
});
