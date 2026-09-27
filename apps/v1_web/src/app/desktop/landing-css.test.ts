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

/**
 * 히어로 에셋(스톱워치·공·콘)이 폰 목업 뒤(z 0)에 깔려 768 에선 파란 테두리만 보였다.
 * jsdom 에는 레이아웃이 없어 겹침은 못 재므로, 층 순서와 등장 순서를 CSS 계약으로 묶는다.
 */
describe('landing.css 히어로 에셋 층·등장 순서', () => {
  const all = rules(CSS);

  function zIndexes(selector: string): number[] {
    return all
      .filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector))
      .flatMap((r) => [...r.body.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1])));
  }

  function entranceDelayMs(selector: string): number {
    const rule = all.find((r) => r.selector === selector && /animation:\s*tmLanding\w+In\b/.test(r.body));
    const times = [...rule!.body.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    return times[1];
  }

  it('에셋은 모든 폭에서 폰보다 앞, 떠 있는 카드보다 뒤에 놓인다', () => {
    const illust = zIndexes('.tm-landing-hero-illust');
    const [device] = zIndexes('.tm-landing-device');
    const [float] = zIndexes('.tm-landing-float');
    expect(illust.length).toBeGreaterThan(0);
    for (const z of illust) {
      expect(z).toBeGreaterThan(device);
      expect(z).toBeLessThan(float);
    }
  });

  it('첫 등장은 폰 → 에셋 → 카드 순서다', () => {
    const device = entranceDelayMs('.tm-landing-hero-graphic .tm-landing-device');
    const illust = entranceDelayMs('.tm-landing-hero-illust-img');
    const card = entranceDelayMs('.tm-landing-float-card');
    expect(device).toBeLessThan(illust);
    expect(illust).toBeLessThan(card);
  });
});
