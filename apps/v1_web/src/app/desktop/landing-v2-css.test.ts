import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 랜딩 v2 의 반복 모션도 A안(landing-css.test.ts)과 같은 방식으로 멈춘다. `animation` 단축 속성이
 * play-state 를 running 으로 되돌리므로, 정지는 재생 규칙 안의
 * `animation-play-state: var(--tm-landing-v2-play)` 로만 먹는다.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/app/desktop/landing-v2.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

describe('landing-v2.css 반복 모션 정지', () => {
  const infinite = rules(CSS).filter((r) => /animation:[^;]*\binfinite\b/.test(r.body));

  it('무한 반복 애니메이션이 있다(검사 대상이 비어 통과하지 않게)', () => {
    expect(infinite.length).toBeGreaterThanOrEqual(5);
  });

  it('무한 반복 애니메이션마다 정지 변수를 play-state 로 읽는다', () => {
    const missing = infinite
      .filter((r) => !/animation-play-state:\s*var\(--tm-landing-v2-play\b/.test(r.body))
      .map((r) => r.selector);
    expect(missing).toEqual([]);
  });

  it('멈추기 버튼·뷰포트 밖·띠 위 hover/focus 가 정지 변수를 paused 로 바꾼다', () => {
    const pausers = rules(CSS)
      .filter((r) => /--tm-landing-v2-play:\s*paused/.test(r.body))
      .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
    expect(pausers).toEqual(
      expect.arrayContaining([
        ".tm-landing-v2[data-paused='true']",
        ".tm-landing-v2 [data-loop='off']",
        '.tm-landing-v2-marquee:hover',
        '.tm-landing-v2-marquee:focus-within',
      ]),
    );
  });

  it('반복 모션은 JS 가 준비되고 모션 감소가 아닐 때(data-motion=on)만 건다', () => {
    const outside = infinite.filter((r) => !r.selector.startsWith(".tm-landing-v2[data-motion='on']"));
    expect(outside.map((r) => r.selector)).toEqual([]);
  });
});

/** @media 등 블록 밖(깊이 0)에 있는 규칙만 고른다 */
function topLevelRules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') {
      if (depth === 0) open = i;
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const selector = css.slice(start, open).trim();
        if (!selector.startsWith('@')) out.push({ selector, body: css.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  return out;
}

describe('landing-v2.css 예전엔/이제는 면 가리기', () => {
  it('가리는 규칙이 미디어 쿼리 밖에 있다 — (scripting) 을 모르는 브라우저에서 두 면이 겹치지 않게', () => {
    const hide = topLevelRules(CSS).find(
      (r) => r.selector.includes("[data-view='after'] [data-face='before']") && /display:\s*none/.test(r.body),
    );
    expect(hide?.selector).toContain("[data-view='before'] [data-face='after']");
  });
});
