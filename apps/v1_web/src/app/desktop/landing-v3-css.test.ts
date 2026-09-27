import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingTour } from '@/components/landing/landing-tour';

/**
 * v3 는 768 이상에서 "스크롤하면 켜지는" 연출 없이 완성된 화면을 보여 준다.
 * ① 어떤 sticky 규칙도 v3 투어의 요소에 걸리지 않는다(A안 투어에는 걸린다 — 대조군).
 * ② A안이 스크롤 전 숨겨 두는 상태(:not(.is-in))마다 v3 의 768+ 규칙이 완성 상태로 되돌린다 —
 *    A안에 새 연출이 생기면 여기서 v3 대응이 빠진 것을 잡는다.
 */
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), 'src/app/desktop', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const V1_CSS = read('landing.css');
const V3_CSS = read('landing-v3.css');

type Rule = { selectors: string[]; body: string; at: string[] };

function flatRules(css: string): Rule[] {
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.split(';').pop()!.trim());
      buf = '';
    } else if (ch === '}') {
      const prelude = stack.pop()!;
      if (!prelude.startsWith('@')) {
        out.push({ selectors: prelude.split(',').map((s) => s.trim()), body: buf, at: stack.filter((s) => s.startsWith('@')) });
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

const stickySelectors = [...flatRules(V1_CSS), ...flatRules(V3_CSS)]
  .filter((r) => /position:\s*sticky/.test(r.body))
  .flatMap((r) => r.selectors)
  .map((s) => s.replace(/::[\w-]+/g, ''));

function stickyHits(layout: 'sticky' | 'rows') {
  const { container } = render(
    createElement('div', { className: 'tm-landing tm-landing-v3', 'data-motion': 'on' }, createElement(LandingTour, { layout })),
  );
  const els = [...container.querySelectorAll('#tour, #tour *')];
  return stickySelectors.filter((sel) => els.some((el) => el.matches(sel)));
}

describe('landing-v3.css — 768 이상은 정적 화면', () => {
  it('sticky 규칙이 A안 투어에는 걸리고(대조군) v3 투어에는 하나도 걸리지 않는다', () => {
    expect(stickyHits('sticky')).not.toEqual([]);
    expect(stickyHits('rows')).toEqual([]);
  });

  it('A안이 스크롤 전 숨기는 상태마다 v3 의 768+ 규칙이 완성 상태를 건다', () => {
    const hidden = flatRules(V1_CSS)
      .flatMap((r) => r.selectors)
      .filter((s) => s.includes(':not(.is-in)'));
    expect(hidden.length).toBeGreaterThanOrEqual(6);

    const settled = new Set(
      flatRules(V3_CSS)
        .filter((r) => r.at.some((a) => /min-width:\s*768px/.test(a)))
        .flatMap((r) => r.selectors),
    );
    const missing = hidden
      .map((s) =>
        s
          .replace(".tm-landing[data-motion='on']", ".tm-landing.tm-landing-v3[data-motion='on']")
          .replace("[data-reveal='scale']", '[data-reveal]'),
      )
      .filter((s) => !settled.has(s));
    expect(missing).toEqual([]);
  });

  it('취소선을 완성 상태로 둬도 "예전엔" 보기는 취소선을 지운다(같은 특이도라 뒤에 와야 한다)', () => {
    const rules = flatRules(V3_CSS);
    const settle = rules.findIndex((r) => r.selectors.some((s) => s.includes(':not(.is-in) .tm-landing-pain-strike')));
    const before = rules.findIndex((r) =>
      r.selectors.includes(".tm-landing.tm-landing-v3[data-motion='on'] .tm-landing-ba[data-view='before'] .tm-landing-pain-strike"),
    );
    expect(settle).toBeGreaterThanOrEqual(0);
    expect(before).toBeGreaterThan(settle);
    expect(rules[before].body).toMatch(/background-size:\s*0%/);
  });

  it('스크롤 진행 바를 768 이상에서 끈다', () => {
    const rule = flatRules(V3_CSS).find((r) => r.selectors.includes('.tm-landing-v3 .tm-landing-progress'));
    expect(rule?.at.some((a) => /min-width:\s*768px/.test(a))).toBe(true);
    expect(rule?.body).toMatch(/display:\s*none/);
  });
});
