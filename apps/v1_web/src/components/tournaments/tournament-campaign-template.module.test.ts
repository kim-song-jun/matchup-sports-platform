import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS Modules 선택자 형태 계약 — globals.test.ts 와 같은 이유로 텍스트 계약을 둔다.
// vitest 는 `css: false`(vitest.config.ts)라 이 파일의 CSS 를 렌더링/평가하지 않는다 —
// `:global()` 문법이 틀려도 tsc·lint·컴포넌트 렌더 테스트 전부 통과하고, 실제 브라우저에서만
// 선택자가 매칭되지 않는 형태로 조용히 실패한다(globals.css 의 view-transition 선택자와
// 똑같은 함정 — 화면 없이는 못 잡는다).
const moduleCss = readFileSync(
  resolve(process.cwd(), 'src/components/tournaments/tournament-campaign-template.module.css'),
  'utf8',
);
const rulesOnly = moduleCss.replace(/\/\*[\s\S]*?\*\//g, '');

describe('campaign-hero-settle 억제(D2안 B, 그룹2/F2) — push/pop + VT 지원 브라우저 한정', () => {
  it('데스크톱-전역 속성 :root[data-nav-kind] 은 :global() 로 참조한다(CSS Modules 문법)', () => {
    // :global() 밖에 쓰면 CSS Modules 로더가 :root[data-nav-kind="push"] 자체를 파일
    // 스코프 해시를 붙이려 시도해 선택자가 영원히 매칭되지 않는다.
    expect(rulesOnly).toContain(':global(:root[data-nav-kind="push"]) .heroImage');
    expect(rulesOnly).toContain(':global(:root[data-nav-kind="pop"]) .heroImage');

    // :global() 없이 그대로 쓴 형태(회귀 형태)가 하나라도 남아 있으면 안 된다 — 이 파일에
    // 나오는 `:root[data-nav-kind="push"/"pop"]` 은 예외 없이 전부 `:global(...)` 로
    // 시작해야 한다(문자열 위치로 직접 대조해 lookbehind 정규식의 함정을 피한다).
    const needle = /:root\[data-nav-kind="(?:push|pop)"\]/g;
    let match: RegExpExecArray | null;
    let checked = 0;
    while ((match = needle.exec(rulesOnly))) {
      const before = rulesOnly.slice(Math.max(0, match.index - 8), match.index);
      expect(before).toBe(':global(');
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0); // 이 파일에 push/pop 참조가 아예 사라지면 이 게이트 자체가 없다는 뜻
  });

  it('VT 를 지원하는 브라우저에서만 끈다(@supports, not 없는 형태) — iOS16/17 CSS 폴백은 절대 건드리지 않는다', () => {
    // "@supports (view-transition-name: none)" — "not" 이 없는 형태만 잡는다.
    const positiveGate = rulesOnly.match(/@supports\s*\(view-transition-name:[^)]*\)\s*\{[\s\S]*?\n\}/);

    expect(positiveGate).not.toBeNull();
    const body = positiveGate![0];
    expect(body).toContain(':global(:root[data-nav-kind="push"]) .heroImage');
    expect(body).toContain(':global(:root[data-nav-kind="pop"]) .heroImage');
    expect(body).toMatch(/animation:\s*none;/);

    // 이 파일 전체에 "@supports not" 게이트는 없어야 한다 — 있다면 그 안에 .heroImage 를
    // 넣는 실수(VT 미지원 경로의 유일한 히어로 등장 연출을 꺼버리는 회귀)를 의심해야 한다.
    expect(rulesOnly).not.toMatch(/@supports\s+not\s*\(view-transition-name/);
  });

  it('기본 800ms 정착 애니메이션 자체(키프레임)는 그대로 남아 있다 — 이 게이트는 끄는 조건만 좁힌다', () => {
    expect(rulesOnly).toMatch(/animation:\s*campaign-hero-settle\s+800ms/);
    expect(rulesOnly).toMatch(/@keyframes campaign-hero-settle\s*\{/);
  });
});
