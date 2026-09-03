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

  it("'native'(iOS 셸의 popstate)도 tab 과 같은 범위로 끈다", () => {
    // iOS 엣지 스와이프는 네이티브가 이미 슬라이드를 그렸다. 웹이 또 그리면 두 겹.
    // VT 경로(old/new/group 전부)와 CSS 폴백 경로 양쪽에 native 가 있어야 한다.
    for (const part of ['old(*)', 'new(*)', 'group(*)']) {
      expect(rulesOnly).toMatch(new RegExp(`:root\\[data-nav-kind=["']native["']\\]::view-transition-${part.replace('(*)', '\\(\\*\\)')}`));
    }
    expect(rulesOnly).toMatch(/:root\[data-nav-kind=["']native["']\]\s+\.tm-page-transition-enter/);
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

  it('push/pop 의 UA root leak 억제는 이름 없는 root 만 겨냥한다(와일드카드 금지 — F1)', () => {
    // tab/native/search 는 (*) 와일드카드로 콘텐츠(page-content)까지 함께 죽이는 것이
    // 의도(탭은 페이지가 아니다)지만, push/pop 은 콘텐츠 슬라이드+페이드를 우리가 직접
    // 그린다 — 여기 (*) 를 쓰면 attribute 셀렉터의 specificity 가 이름-특정 규칙을 이겨
    // push/pop 고유의 전환 자체가 사라진다(적대 검증에서 확인된 회귀). 'root' 이름만
    // 명시적으로 좁혀야 한다.
    for (const kind of ['push', 'pop']) {
      for (const part of ['old(root)', 'new(root)', 'group(root)']) {
        expect(rulesOnly).toContain(`:root[data-nav-kind="${kind}"]::view-transition-${part}`);
      }
      // 이 kind 에 대해서는 (*) 형태가 단 하나도 있으면 안 된다 — 있으면 회귀.
      const wildcard = rulesOnly.match(
        new RegExp(`:root\\[data-nav-kind="${kind}"\\]::view-transition-(old|new|group)\\(\\*\\)`, 'g'),
      ) ?? [];
      expect(wildcard).toEqual([]);
    }
  });

  it("'search'(검색파라미터만 바뀌는 이동, FS-1)도 tab/native 와 같은 범위로 끈다", () => {
    // VT 경로(old/new/group 전부)와 CSS 폴백 경로 양쪽에 search 가 있어야 한다 —
    // 필터 시트 자체 애니메이션 위에 페이지 슬라이드+페이드가 겹치는 것을 막는다.
    for (const part of ['old(*)', 'new(*)', 'group(*)']) {
      expect(rulesOnly).toMatch(
        new RegExp(`:root\\[data-nav-kind=["']search["']\\]::view-transition-${part.replace('(*)', '\\(\\*\\)')}`),
      );
    }
    expect(rulesOnly).toMatch(/:root\[data-nav-kind=["']search["']\]\s+\.tm-page-transition-enter/);
  });
});

describe('데스크톱(≥1024px) push/pop 은 슬라이드 없이 페이드 전용(D0안 B)', () => {
  const rulesOnly = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '');

  it('VT 경로: --tm-slide-offset 을 push/pop(old/new) 양쪽에서 0으로 덮어쓴다', () => {
    // globals.css 에는 nav-kind 와 무관한 `@media (min-width: 1024px)` 블록이 이미 여러 개
    // 있다(레이아웃 등) — 파일 전체를 뒤지는 느슨한 정규식은 그 무관한 블록의 `{`부터
    // 시작해 수백 줄 뒤의 `--tm-slide-offset: 0;`까지 lazy 하게 이어붙여 "매칭됐다"고
    // 오판할 수 있다(이 미디어 쿼리 자체를 지워도 통과하는 vacuous 테스트가 된다). 그래서
    // 이 선택자 4개가 **연속으로 붙어** `--tm-slide-offset: 0;` 앞에 오는지, 그리고 그
    // 묶음이 `@media (min-width: 1024px) {` 로 시작하는지를 하나의 좁은 블록으로 검증한다.
    const idx = rulesOnly.indexOf(
      ':root[data-nav-kind="push"],\n  :root[data-nav-kind="push"]::view-transition-new(page-content),\n  :root[data-nav-kind="pop"],\n  :root[data-nav-kind="pop"]::view-transition-new(page-content) {\n    --tm-slide-offset: 0;',
    );

    expect(idx).toBeGreaterThan(-1);
    const preceding = rulesOnly.slice(Math.max(0, idx - 80), idx);
    expect(preceding).toMatch(/@media \(min-width:\s*1024px\)\s*\{\s*$/);
  });

  it('모바일(<1024px) 규칙(기본 --tm-slide-offset 값)은 그대로 남아 있다 — 미디어 쿼리 밖', () => {
    // 데스크톱 override 를 추가하면서 모바일 기본값 자체를 지우면 안 된다.
    expect(rulesOnly).toMatch(/:root\[data-nav-kind="push"\]\s*\{\s*--tm-slide-offset:\s*-24%;/);
    expect(rulesOnly).toMatch(/:root\[data-nav-kind="pop"\]\s*\{\s*--tm-slide-offset:\s*100%;/);
  });

  it('CSS 폴백(VT 미지원) 경로도 같은 폭에서 translateX 0 이 되도록 --tm-fallback-slide-offset 을 덮어쓴다', () => {
    // 폴백 keyframe 자체가 커스텀 프로퍼티를 참조하지 않으면(하드코딩 24px) 데스크톱에서
    // 절대 0 이 될 수 없다 — 두 가지를 모두 본다.
    expect(rulesOnly).toMatch(/@keyframes tm-page-fallback-push[\s\S]*?translateX\(var\(--tm-fallback-slide-offset,\s*24px\)\)/);
    expect(rulesOnly).toMatch(/@keyframes tm-page-fallback-pop[\s\S]*?translateX\(var\(--tm-fallback-slide-offset,\s*-24px\)\)/);

    // 이 override 는 반드시 VT 미지원 게이트(@supports not) **안**에 있어야 한다 — 밖에
    // 있으면 무해하지만, 안에 있어야 이 값이 실제로 쓰이는 곳과 같은 조건부 블록임이
    // 코드로 드러난다.
    const fallbackGate = rulesOnly.match(/@supports\s+not\s*\(view-transition-name:[^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(fallbackGate).not.toBeNull();
    expect(fallbackGate![0]).toMatch(/--tm-fallback-slide-offset:\s*0px;/);
  });
});

describe('push/pop 콘텐츠 이중 페이드 억제(D2안 B, 그룹2/F2) — VT 지원 브라우저 한정', () => {
  const rulesOnly = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '');

  it('VT 를 지원하는 브라우저에서만 .tm-content-enter 를 push/pop 에서 끈다', () => {
    // "@supports (view-transition-name: none)" — "not" 없는 형태만 잡는다. "not" 이
    // 있는 폴백 게이트와 혼동하면 이 테스트가 반대 걸 검증하게 된다.
    const positiveGate = rulesOnly.match(/@supports\s*\(view-transition-name:[^)]*\)\s*\{[\s\S]*?\n\}/);

    expect(positiveGate).not.toBeNull();
    const body = positiveGate![0];
    expect(body).toContain(':root[data-nav-kind="push"] .tm-content-enter');
    expect(body).toContain(':root[data-nav-kind="pop"] .tm-content-enter');
    expect(body).toMatch(/animation:\s*none;/);
  });

  it('VT 미지원 폴백 경로(@supports not)에서는 .tm-content-enter 를 절대 건드리지 않는다', () => {
    // 폴백에서 .tm-content-enter 가 유일한 진입 페이드다 — 여기서 꺼지면 콘텐츠가
    // 아예 페이드 없이 나타난다(이 저장소가 이미 겪은 사고의 반대 방향 재현).
    const fallbackGate = rulesOnly.match(/@supports\s+not\s*\(view-transition-name:[^)]*\)\s*\{[\s\S]*?\n\}/);

    expect(fallbackGate).not.toBeNull();
    expect(fallbackGate![0]).not.toContain('.tm-content-enter');
  });
});
