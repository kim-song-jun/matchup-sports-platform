import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), 'src/app/desktop', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const BASE = read('landing.css');
const V4 = read('landing-v4.css');

/** @media 안쪽 규칙도 가장 안쪽 블록 단위로 잡힌다(셀렉터 · 본문). */
function rules(css: string): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

const selectorsOf = (selector: string) => selector.split(',').map((s) => s.trim());

/**
 * 랜딩의 반복 모션은 "움직임 멈추기" 버튼과 뷰포트 밖 정지(WCAG 2.2.2)가 CSS 로 멈춘다.
 * `animation` 단축 속성은 play-state 를 running 으로 되돌리므로, 정지는 재생 규칙 안의
 * `animation-play-state: var(--tm-landing-play)` 로만 먹는다 — 따로 거는 정지 셀렉터는
 * 특이도에서 져서 버튼을 눌러도 계속 움직였다(적대 리뷰 실측).
 */
describe('랜딩 반복 모션 정지', () => {
  const infinite = [...rules(BASE), ...rules(V4)].filter((r) => /animation:[^;]*\binfinite\b/.test(r.body));

  it('무한 반복 애니메이션이 있다(검사 대상이 비어 통과하지 않게)', () => {
    expect(infinite.length).toBeGreaterThanOrEqual(5);
  });

  it('무한 반복 애니메이션마다 정지 변수를 play-state 로 읽는다', () => {
    const missing = infinite
      .filter((r) => !/animation-play-state:\s*var\(--tm-landing-play\b/.test(r.body))
      .map((r) => r.selector);
    expect(missing).toEqual([]);
  });

  it('멈추기 버튼과 뷰포트 밖 구역이 정지 변수를 paused 로 바꾼다', () => {
    const pausers = rules(BASE)
      .filter((r) => /--tm-landing-play:\s*paused/.test(r.body))
      .flatMap((r) => selectorsOf(r.selector));
    expect(pausers).toContain(".tm-landing[data-paused='true']");
    expect(pausers).toContain(".tm-landing [data-loop='off']");
  });
});

/* jsdom 에는 레이아웃이 없어 겹침·잘림은 못 재므로, alpha 에서 나온 두 결함을 CSS 계약으로 묶는다. */
describe('랜딩 층 순서·잘림', () => {
  const zIndexes = (css: string, selector: string) =>
    rules(css)
      .filter((r) => selectorsOf(r.selector).includes(selector))
      .flatMap((r) => [...r.body.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1])));

  it('고정 무대 배지는 폰 목업보다 앞에 놓인다(폰 뒤로 숨지 않는다)', () => {
    const [device] = zIndexes(BASE, '.tm-landing-device');
    const badges = zIndexes(V4, '.tm-landing-v4-day-badges');
    expect(device).toBeDefined();
    expect(badges.length).toBeGreaterThan(0);
    for (const z of badges) expect(z).toBeGreaterThan(device);
  });

  it('마지막 CTA 일러스트는 모든 폭에서 박스 안쪽에 놓인다(음수 오프셋이면 경계에 잘린다)', () => {
    const offsets = rules(V4)
      .filter((r) => r.selector.startsWith('.tm-landing-v4-cta-illu['))
      .flatMap((r) => [...r.body.matchAll(/\b(top|bottom):\s*(-?\d+)px/g)].map((m) => Number(m[2])));
    expect(offsets.length).toBeGreaterThanOrEqual(4);
    for (const px of offsets) expect(px).toBeGreaterThanOrEqual(0);
  });
});
