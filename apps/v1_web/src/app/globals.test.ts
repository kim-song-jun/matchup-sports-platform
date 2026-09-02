import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('mobile floating action button layout', () => {
  it('keeps the FAB above both the bottom navigation and the native safe inset', () => {
    const rule = globalsCss.match(/\.tm-floating-fab\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).toMatch(
      /bottom:\s*calc\(var\(--v1-shell-bottom-nav-height\)\s*\+\s*var\(--v1-shell-safe-bottom\)\s*\+\s*18px\)/,
    );
  });
});

describe('Android bottom inset layout', () => {
  it('keeps no-bottom-nav pages above the system navigation area', () => {
    const rule = globalsCss.match(/\.tm-app-frame-no-bottom \.tm-scroll-area\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).toMatch(/bottom:\s*var\(--v1-shell-safe-bottom\)/);
  });

  it('does not reserve the inset twice when a child surface already consumes it', () => {
    expect(globalsCss).toMatch(
      /\.tm-app-frame-no-bottom \.tm-scroll-area:has\(\.tm-fixed-cta\),\s*\.tm-app-frame-no-bottom \.tm-scroll-area:has\(\.tm-chat-room\)\s*\{\s*bottom:\s*0;/,
    );
  });
});

describe('keyboard viewport layout', () => {
  it('keeps app and auth frames on the visual viewport with a normal 100dvh fallback', () => {
    expect(globalsCss).toMatch(
      /\.tm-app-frame\s*\{[^}]*height:\s*var\(--teameet-visual-viewport-height,\s*100dvh\)/,
    );
    expect(globalsCss).toMatch(
      /\.tm-auth-frame\s*\{[^}]*height:\s*var\(--teameet-visual-viewport-height,\s*100dvh\)/,
    );
  });

  it('changes fixed chrome and scroll bounds only while a browser or native keyboard is open', () => {
    expect(globalsCss).toMatch(
      /html\.tm-keyboard-open \.tm-bottom-nav,\s*html\[data-teameet-native-keyboard="open"\] \.tm-bottom-nav\s*\{\s*display:\s*none;/,
    );
    expect(globalsCss).toMatch(
      /html\.tm-keyboard-open \.tm-scroll-area,[^{]+\{[^}]*bottom:\s*0;[^}]*scroll-padding-block:/,
    );
    expect(globalsCss).toMatch(
      /html\.tm-keyboard-open \.tm-modal-panel,[^{]+\{[^}]*max-height:[^}]*overflow-y:\s*auto;/,
    );
  });
});

describe('data-nav-kind 선택자 형태 — 형태가 틀리면 조용히 발화하지 않는다', () => {
  // **주석을 걷어내고 본다.** 이 규칙들의 주석은 금지된 형태를 그대로 인용해 설명하므로,
  // 원문 그대로 스캔하면 설명문이 위반으로 잡힌다(실제로 한 번 걸렸다).
  const rulesOnly = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '');

  // 이 두 규칙은 문법이 멀쩡해서 tsc·lint·유닛테스트가 전부 통과하는데도 **매칭되지 않는다**.
  // 실제로 그 상태로 배포돼 탭 전환에서 tm-page-slide 가 그대로 재생됐다(alpha 실측).
  // 화면 없이는 잡을 수 없는 결함이라 텍스트 계약으로 고정한다.

  it('탭 경로는 old/new 뿐 아니라 group 까지 끈다(이름 지정만으로는 부족)', () => {
    // 이름을 지정(page-content)하면 root 스냅샷 교차 페이드와 group 리사이즈가 남는다.
    // 최소 재현: 기준 10건 · 이름 지정만 6건 · old/new(*) 2건 · group(*) 까지 0건.
    // alpha 실측도 이름 지정 상태에서 정확히 6건이었다.
    const tabRule = rulesOnly.match(/:root\[data-nav-kind=["']tab["']\][\s\S]*?\{[^}]*animation:\s*none[^}]*\}/);

    expect(tabRule).not.toBeNull();
    for (const part of ['old(*)', 'new(*)', 'group(*)']) {
      expect(tabRule?.[0]).toContain(part);
    }
  });

  it('CSS 폴백은 VT 미지원 환경에서만 적용된다(이중 재생 방지)', () => {
    // 선택자 형태를 고치기 전에는 폴백이 아무 데서도 안 돌았다. 고치고 나니 VT 지원
    // 브라우저에서도 함께 돌아 VT 슬라이드와 이중으로 겹쳤다(alpha 실측: push 이동에서
    // tm-page-fallback-push 와 -ua-view-transition-* 동시 발화). @supports 밖으로
    // 빠져나오면 그 이중 재생이 되살아난다.
    // 닫는 브레이스 앞의 공백·개행(\r\n, 들여쓰기)을 허용한다 — 포매팅만 바뀌어도
    // 깨지면 계약이 아니라 잡음이 된다. 같은 정규식을 match/replace 에 재사용한다.
    const GATE = /@supports\s+not\s*\(view-transition-name:[^)]*\)\s*\{[\s\S]*?[\r\n]\s*\}/;
    const gate = rulesOnly.match(GATE);

    expect(gate).not.toBeNull();
    expect(gate?.[0]).toContain('tm-page-fallback-push');
    expect(gate?.[0]).toContain('tm-page-fallback-pop');
    // 게이트 **밖**에 폴백이 남아 있으면 안 된다 — push·pop 둘 다 본다.
    const outside = rulesOnly.replace(GATE, '');
    expect(outside).not.toContain('tm-page-fallback-push var(');
    expect(outside).not.toContain('tm-page-fallback-pop var(');
  });

  it('view-transition 의사요소는 :root 에 붙여 쓴다(공백 금지)', () => {
    // 최소 재현(Chromium): `:root[x] ::view-transition-old(y)` 는 UA 애니메이션을 못 끄고
    // (2건 재생), `:root[x]::view-transition-old(y)` 만 끈다(0건). 공백은 자손 결합자인데
    // view-transition 의사요소는 그 방식으로 매칭되지 않는다.
    // 따옴표 종류(" vs ')는 이 규칙과 무관하다 — 형태만 본다.
    const spaced = rulesOnly.match(/:root\[data-nav-kind=[^\]]+\]\s+::view-transition-/g) ?? [];

    expect(spaced).toEqual([]);
  });

  it('실제 요소(.tm-page-transition-enter)는 반대로 자손 결합자로 겨냥한다', () => {
    // data-nav-kind 는 page-transition-controller 가 <html> 에만 단다. 이 요소 자신에게서
    // 찾는 형태(.tm-page-transition-enter[data-nav-kind=...])는 영원히 매칭되지 않는다.
    const onSelf = rulesOnly.match(/\.tm-page-transition-enter\[data-nav-kind=/g) ?? [];

    expect(onSelf).toEqual([]);
    expect(rulesOnly).toMatch(/:root\[data-nav-kind=["']tab["']\]\s+\.tm-page-transition-enter/);
  });
});
