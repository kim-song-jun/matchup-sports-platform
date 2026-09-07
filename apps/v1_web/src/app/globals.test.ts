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

describe('선수 카드 무한 루프 가시성 게이트 (pcard-infinite-loop-no-visibility-gate)', () => {
  it('data-loop-paused="true" 규칙이 스윕·크레스트·프레임 발광·오로라 네 요소를 전부 잡는다', () => {
    // use-loop-pause.ts 가 세팅하는 속성을 globals.css 가 실제로 소비하는지 —
    // 훅만 있고 CSS 규칙이 없으면(또는 반대로) 아무 일도 일어나지 않는다.
    const rule = globalsCss.match(
      /\.tm-player-card\[data-loop-paused="true"\][^{]*\{([^}]*)\}/,
    )?.[0];

    expect(rule).toBeDefined();
    expect(rule).toContain('.tm-pcard-face::after');
    expect(rule).toContain('.tm-pcard-crest');
    expect(rule).toContain('.tm-pcard-frame');
    expect(rule).toContain('.tm-pcard-fx');
    expect(rule).toMatch(/animation-play-state:\s*paused/);
  });
});

describe('카드 광택 스윕(tmCardSweep)은 left 가 아니라 transform 을 보간한다 (pcard-sweep-animates-left-not-transform)', () => {
  // `[^}]*` 류 정규식은 첫 번째 안쪽 블록에서 멈춘다(실측: 0%,62% 블록만 잡히고 88%,100% 는
  // 빠짐) — 중괄호를 세어 @keyframes 블록 전체를 자른다. 안 그러면 뒤 블록의 left 보간이
  // 남아 있어도 통과하는 vacuous 테스트가 된다.
  const sweepKeyframes = (): string | undefined => {
    const start = globalsCss.indexOf('@keyframes tmCardSweep');
    if (start < 0) return undefined;
    let depth = 0;
    for (let i = globalsCss.indexOf('{', start); i < globalsCss.length; i++) {
      if (globalsCss[i] === '{') depth++;
      else if (globalsCss[i] === '}' && --depth === 0) return globalsCss.slice(start, i + 1);
    }
    return undefined;
  };

  it('키프레임이 left 를 애니메이션하지 않는다 — 레이아웃 리플로우를 강제하지 않는다', () => {
    const keyframe = sweepKeyframes();

    expect(keyframe).toBeDefined();
    // 이 정규식은 `keyframe { ... left: ... }` 형태만 걸러낸다 — 정적 `left`
    // 는 .tm-pcard-face::after 규칙(키프레임 밖)에 남아 있어도 되고, 이 검증 대상이 아니다.
    expect(keyframe).not.toMatch(/left\s*:/);
    expect(keyframe).toMatch(/translateX\(/);
  });

  it('정적 left + translateX 궤적이 예전 left 보간 궤적(-80% → 160%, 부모 폭 기준)과 일치한다', () => {
    const rule = globalsCss.match(/\.tm-pcard-face::after\s*\{([^}]*)\}/)?.[1];
    const keyframe = sweepKeyframes();

    expect(rule).toBeDefined();
    expect(keyframe).toBeDefined();
    // 기준점: 예전 키프레임 0% 의 left 값. 예전 정적값(-85%)을 그대로 두면 궤적 전체가 5%W 밀린다.
    const staticLeft = Number(rule!.match(/left:\s*(-?[\d.]+)%/)![1]);
    const width = Number(rule!.match(/width:\s*([\d.]+)%/)![1]) / 100;
    const xs = [...keyframe!.matchAll(/translateX\((-?[\d.]+)%\)/g)].map((m) => Number(m[1]));
    // translateX 는 자기 폭(62%) 기준이므로 부모 기준으로 환산해 유효 위치를 구한다.
    const effective = xs.map((x) => staticLeft + x * width);
    expect(effective[0]).toBeCloseTo(-80, 0);
    expect(effective[effective.length - 1]).toBeCloseTo(160, 0);
  });

  it('translateX 가 rotate 보다 먼저(바깥쪽) 와야 순수 수평 이동이 된다 — 순서를 뒤집으면 원점을 도는 호가 된다', () => {
    const rule = globalsCss.match(/\.tm-pcard-face::after\s*\{([^}]*)\}/)?.[1];

    expect(rule).toMatch(/transform:\s*translateX\([^)]*\)\s*rotate\(18deg\)/);
  });
});

describe('home featured media band', () => {
  // 사진 없는 변형이 aspect-ratio 를 풀면 밴드가 내용만큼 자라, 같은 그리드 행의 사진
  // 카드가 텍스트만 위에 뜬 채 아래가 비어 보인다(alpha 실측 2026-09-07: 308 vs 152px).
  // 마크업 계약(카피는 밴드 밖)은 home-featured-slot.test.tsx 가 지키고, 여기서는
  // 그 마크업이 전제하는 **밴드 높이 고정**만 지킨다.
  it('keeps the photo-less variant on the same fixed aspect ratio as the photo variant', () => {
    const rule = globalsCss.match(/\.tm-home-featured-stack\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    expect(rule).not.toMatch(/aspect-ratio/);
    expect(rule).not.toMatch(/height/);
  });
});

describe('home featured graphic size (cascade)', () => {
  // 이 선택자 쌍은 **같은 속성(width/height)** 을 겨루고, 일반 규칙이 파일 뒤쪽에 있다.
  // 특이도가 같으면 뒤가 이기므로, 홈 전용 규칙은 반드시 더 좁아야 한다.
  // (alpha 실측 2026-09-07: 이 조건이 깨져 그래픽이 208px 로 그려졌고, aspect-ratio 2/1 밴드가
  //  내용에 밀려 208px 까지 자라 같은 행의 사진 카드 밴드 152px 과 다시 벌어졌다.)
  const countClasses = (selector: string) => selector.split('.').length - 1;

  const homeRule = '.tm-home-featured-stack .tm-match-hero-graphic .tm-match-sport-illustration';
  const genericRule = '.tm-match-hero-graphic .tm-match-sport-illustration';

  it('declares the home-only illustration size, and the generic hero rule still exists', () => {
    expect(globalsCss).toContain(homeRule);
    expect(globalsCss).toContain(genericRule);
  });

  it('wins the cascade against the later generic rule by specificity, not by order', () => {
    const homeAt = globalsCss.indexOf(homeRule);
    // -1 을 그대로 쓰면 아래 비교가 전부 통과한다 — 규칙이 사라진 변이를 놓친다.
    expect(homeAt).toBeGreaterThan(-1);
    // 일반 규칙은 홈 규칙 **뒤에** 있는 것을 찾는다 — 앞쪽 매치는 홈 선택자 자신의 꼬리다.
    const genericAt = globalsCss.indexOf(`\n${genericRule}`, homeAt);

    expect(genericAt).toBeGreaterThan(homeAt);
    expect(countClasses(homeRule)).toBeGreaterThan(countClasses(genericRule));
  });

  it('sizes the graphic to fit inside the 2:1 media band on both breakpoints', () => {
    // 밴드 높이는 카드 폭의 절반이다(alpha 데스크톱 실측 304px 폭 → 152px). 그래픽이 그보다
    // 크면 밴드가 밀려 커진다 — 그래서 128px 이하로 묶는다.
    //
    // width 만 보면 안 된다. 밴드를 실제로 밀어 올리는 건 height 이고, 이 그래픽은 정사각형이라
    // 둘 중 하나만 커져도 회귀가 된다(#1090 Copilot).
    const homeAt = globalsCss.indexOf(homeRule);
    expect(homeAt).toBeGreaterThan(-1);
    const block = globalsCss.slice(homeAt, homeAt + 400);
    // `min-width: 1024px`(미디어 쿼리)가 잡히지 않도록 선언 줄만 본다.
    const decls = [...block.matchAll(/\n\s*(width|height):\s*(\d+)px/g)].map((m) => ({ prop: m[1], px: Number(m[2]) }));

    // 기본(112px) + ≥1024(128px) 두 블록 × width/height = 4개.
    expect(decls).toHaveLength(4);
    expect(decls.filter((d) => d.prop === 'width')).toHaveLength(2);
    expect(decls.filter((d) => d.prop === 'height')).toHaveLength(2);
    decls.forEach(({ px }) => expect(px).toBeLessThanOrEqual(128));
  });
});

describe('세그먼트 탭 조작부 높이 — 기준 44px 밑으로 내려가지 않는다', () => {
  // 이 저장소의 조작부 기준은 44×44 이고, 같은 이유로 .tm-btn-sm 은 이미 40→44 로
  // 올려 둔 상태다("WS11 a11y 터치 타깃"). 세그먼트 탭의 sm 변형만 40px 로 남아
  // 있었는데, 유닛 테스트도 tsc 도 이런 건 못 잡는다 — 화면은 멀쩡히 그려지고
  // 손가락만 빗나간다. 그래서 CSS 계약으로 못 박는다.
  it('기본 탭이 44px 이상이다', () => {
    const rule = globalsCss.match(/\.tm-segmented-tab\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    const min = Number(rule!.match(/min-height:\s*(\d+)px/)?.[1]);
    expect(min).toBeGreaterThanOrEqual(44);
  });

  it('sm 변형은 높이를 낮추지 않는다 — 글자 크기만 줄인다', () => {
    const rule = globalsCss.match(/\.tm-segmented-tabs-sm \.tm-segmented-tab\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeDefined();
    // 높이 계열 속성을 아예 쓰지 않아야 기본값 44px 를 그대로 물려받는다.
    // max-height 까지 막는 이유는 회귀가 아니라 dead code 다 — 브라우저 실측상
    // min-height 가 max-height 를 이기므로(min-height:44 + max-height:40 → 44px)
    // 여기 max-height 를 적어도 높이는 안 줄어든다. 즉 아무 효과 없는 선언이
    // 남게 되고, 다음 사람은 그게 먹히는 줄 안다.
    expect(rule).not.toMatch(/(?:min-|max-)?height:/);
    expect(rule).toMatch(/font-size:/);
  });
});

describe('틴트 지면 위 보조 텍스트 대비 — grey600 은 흰 배경에서만 AA 를 넘는다', () => {
  // alpha 배포본 실측에서 나왔다. --grey600 은 흰 카드(4.62:1)에서만 AA 를 넘고,
  // 지면에 색이 조금이라도 깔리면 4.11~4.42 로 떨어진다. .tm-card-closed 가 이미
  // 같은 이유로 grey700 을 쓰고 있어, 그 방법을 같은 조건의 지면으로 넓혔다.
  const hex = (s: string) => {
    const m = globalsCss.match(new RegExp('--' + s + ':\\s*(#[0-9a-fA-F]{6})'));
    return m ? m[1] : null;
  };
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c: number[]) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: string, b: string) => {
    const [l1, l2] = [lum(rgb(a)), lum(rgb(b))];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  it('문제가 실재한다 — grey600 은 grey50·grey100·blue50 위에서 AA 미달이다', () => {
    const g600 = hex('grey600');
    expect(g600).toBeTruthy();
    for (const surface of ['grey50', 'grey100', 'blue50']) {
      const bg = hex(surface);
      expect(bg, surface + ' 토큰을 찾지 못했다').toBeTruthy();
      expect(ratio(g600!, bg!), surface + ' 위 grey600').toBeLessThan(4.5);
    }
    // 흰 배경에서는 넘는다 — 그래서 전역 교체가 아니라 지면별 처방이어야 한다.
    expect(ratio(g600!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('grey700 은 세 지면 모두 AA 를 넘는다', () => {
    const g700 = hex('grey700');
    expect(g700).toBeTruthy();
    for (const surface of ['grey50', 'grey100', 'blue50']) {
      expect(ratio(g700!, hex(surface)!), surface + ' 위 grey700').toBeGreaterThanOrEqual(4.5);
    }
  });

  // 셀렉터가 **어느 규칙에** 어떤 순서로 적혀 있는지는 계약이 아니다 — 각 지면이
  // 두 토큰을 올린다는 것만 본다. 목록 순서·줄바꿈·포매터 변경으로 깨지지 않게
  // 규칙 단위로 파싱해서 확인한다(#1104 Copilot).
  const rulesDeclaring = (prop: string, value: string) => {
    const selectors = new Set<string>();
    // 주석을 먼저 걷어낸다 — 규칙 앞 주석이 첫 셀렉터에 붙어 와 매칭을 깨뜨린다.
    const stripped = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selText, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!new RegExp(prop + ':\\s*' + value).test(body)) continue;
      // `@media (...) { .foo,\n .bar` 처럼 at-rule 접두가 붙어 올 수 있다. 접두는
      // 마지막 `{` 뒤를 취해 걷어내되, **여러 줄 셀렉터 목록은 보존**해야 한다
      // (마지막 줄만 취하면 앞의 셀렉터를 통째로 잃는다 — 실제로 한 번 그랬다).
      for (const part of selText.split(',')) {
        const one = part.slice(part.lastIndexOf('{') + 1).trim();
        if (one) selectors.add(one);
      }
    }
    return selectors;
  };

  // hover 로 지면이 한 단계 눌리는 자리도 같이 본다. 이 클래스는 .tm-list-row 없이
  // 흰 지면에도 쓰여서(league awards) 평상시엔 올리지 않고 hover 일 때만 올린다 —
  // 그래서 위 it.each 목록이 아니라 별도로 확인한다.
  it('.tm-list-row-interactive 는 hover 일 때만 보조 텍스트 토큰을 올린다', () => {
    const hover = globalsCss.match(/\.tm-list-row-interactive:hover\s*\{([^}]*)\}/)?.[1];

    expect(hover, '.tm-list-row-interactive:hover 규칙을 찾지 못했다').toBeDefined();
    expect(hover).toMatch(/--text-caption:\s*var\(--grey700\)/);
    expect(hover).toMatch(/--text-muted:\s*var\(--grey700\)/);
    // 평상시 규칙에는 올리지 않는다 — 흰 지면에서는 grey600 이 이미 기준을 넘는다.
    expect(rulesDeclaring('--text-caption', 'var\\(--grey700\\)')).not.toContain('.tm-list-row-interactive');
  });

  it.each([
    '.tm-badge-grey',
    '.tm-segmented-tabs',
    '.tm-quick-grid',
    '.tm-match-summary-row',
    '.tm-team-summary-bar',
    '.tm-weather-strip',
    '.tm-player-card-progress',
    '.tm-list-row',
    '.tm-auth-profile-preview',
    '.tm-auth-segmented',
    '.tm-my-profile-head',
  ])('%s 는 보조 텍스트 토큰을 grey700 으로 올린다', (selector) => {
    expect(rulesDeclaring('--text-caption', 'var\\(--grey700\\)')).toContain(selector);
    expect(rulesDeclaring('--text-muted', 'var\\(--grey700\\)')).toContain(selector);
  });
});

describe('대진표 예정 단계 라벨 대비 (2026-09-07 사용자 확정 B안)', () => {
  // 예정 단계 이름이 grey400 이라 흰 배경에서 2.01:1 이었다(alpha 실측) — 기준의 절반이다.
  // grey500 으로 한 단계만 올려도 3.04 라 미달이어서 grey700 까지 올렸다.
  // 원 안 숫자(.tm-hub-stage-dot)는 라벨과 중복이라 grey400 으로 두기로 했다
  // (docs/design/a11y-decisions.md 5번) — 그 결정이 살아 있는지도 함께 못 박는다.
  const hex = (name: string) =>
    globalsCss.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'))?.[1] ?? null;
  const lum = (h: string) =>
    [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: string, b: string) => {
    const [l1, l2] = [lum(a), lum(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const colorOf = (selector: string) =>
    globalsCss.match(new RegExp('\\' + selector + '\\s*\\{[^}]*?color:\\s*var\\((--[a-z0-9-]+)\\)', 's'))?.[1] ?? null;

  it('예정 단계 이름은 흰 배경에서 AA 를 넘는다', () => {
    const token = colorOf('.tm-hub-stage-label');

    expect(token, '.tm-hub-stage-label 의 color 토큰을 찾지 못했다').toBeTruthy();
    const value = hex(token!.slice(2));
    expect(value, token + ' 값을 찾지 못했다').toBeTruthy();
    expect(ratio(value!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('원 안 숫자는 grey400 그대로다 — 라벨과 중복이라 예외로 등재했다', () => {
    expect(colorOf('.tm-hub-stage-dot')).toBe('--grey400');
  });
});

describe('데스크톱(≥1024) 틴트 지면 위 보조 텍스트', () => {
  // 데스크톱은 모바일과 다른 CSS 파일을 쓴다 — 390 만 재던 스윕에서 빠져 있었고,
  // 1440 으로 재니 모든 페이지에 깔리는 푸터에서 나왔다(alpha 실측).
  const shellCss = readFileSync(resolve(process.cwd(), 'src/app/desktop/_shell.css'), 'utf8');
  const chatCss = readFileSync(resolve(process.cwd(), 'src/app/desktop/chat.css'), 'utf8');

  it('푸터 링크는 grey50 지면 위에서 AA 를 넘는 색을 쓴다', () => {
    const rule = shellCss.match(/\.tm-desktop-footer-links a\s*\{([^}]*)\}/)?.[1];

    expect(rule, '.tm-desktop-footer-links a 규칙을 찾지 못했다').toBeDefined();
    // grey600 은 grey50(#f9fafb) 위에서 4.42:1 이라 미달이다. grey700 이 6.81:1.
    expect(rule).toMatch(/color:\s*var\(--grey700\)/);
  });

  it('데스크톱 채팅 스레드 창은 보조 텍스트 토큰을 올린다', () => {
    // 이 셀렉터는 파일에 두 번 나온다 — 세 창 공용 레이아웃 규칙의 마지막 줄과,
    // 이 창 전용 토큰 규칙. 줄 시작(^)으로 찾으면 앞의 것이 잡히므로 규칙 단위로
    // 쪼개서 **셀렉터가 이것 하나뿐인** 규칙을 고른다.
    const stripped = chatCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const own = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
      ([, sel]) => sel.trim() === '.tm-chat-desktop-thread-pane',
    );

    expect(own, '.tm-chat-desktop-thread-pane 단독 규칙을 찾지 못했다').toBeDefined();
    expect(own![2]).toMatch(/--text-caption:\s*var\(--grey700\)/);
    expect(own![2]).toMatch(/--text-muted:\s*var\(--grey700\)/);
  });

  // 이 검사는 실제 사고에서 나왔다(#1110 Copilot). 토큰 override 를 넣으면서
  // `.tm-chat-mobile-pane, .tm-chat-desktop-workspace, .tm-chat-desktop-thread-pane`
  // 라는 **세 셀렉터 목록의 마지막 줄 앞에** 새 규칙을 끼워 넣는 바람에, 앞의 두
  // 셀렉터가 `display: contents` 를 잃고 대신 토큰 override 를 받았다. 모바일 채팅
  // 레이아웃이 깨지는 회귀인데 tsc·기존 테스트 어느 것도 잡지 못했다.
  it('대회 프로모 단계는 배경을 까는 그 규칙 안에서 토큰을 올린다', () => {
    const tournamentsCss = readFileSync(resolve(process.cwd(), 'src/app/desktop/tournaments.css'), 'utf8');
    // 이 배경은 미디어 쿼리 안에서만 깔린다 — 밖에서는 지면이 흰색이라 올릴 필요가 없다.
    // 그래서 "배경을 주는 규칙"과 "토큰을 올리는 규칙"이 같아야 조건이 어긋나지 않는다.
    const rule = [...tournamentsCss.matchAll(/\.tm-tournament-promo-step\s*\{([^}]*)\}/g)]
      .map(([, body]) => body)
      .find((body) => /background:\s*var\(--grey50\)/.test(body));

    expect(rule, '--grey50 배경을 주는 .tm-tournament-promo-step 규칙을 찾지 못했다').toBeDefined();
    expect(rule).toMatch(/--text-caption:\s*var\(--grey700\)/);
    expect(rule).toMatch(/--text-muted:\s*var\(--grey700\)/);
  });

  it('세 창의 display: contents 목록이 쪼개지지 않았다', () => {
    const rule = chatCss.match(
      /\.tm-chat-mobile-pane,\s*\.tm-chat-desktop-workspace,\s*\.tm-chat-desktop-thread-pane\s*\{([^}]*)\}/,
    )?.[1];

    expect(rule, '세 셀렉터가 한 규칙에 함께 있지 않다 — 목록이 쪼개졌을 수 있다').toBeDefined();
    expect(rule).toMatch(/display:\s*contents/);
    // 그 규칙에 토큰을 얹으면 모바일 창까지 바뀐다 — 지면이 grey50 인 것은 스레드 창뿐이다.
    expect(rule).not.toMatch(/--text-caption|--text-muted/);
  });
});

describe('인라인으로 지면 색을 까는 곳의 보조 텍스트 (.tm-on-tint)', () => {
  // 위 목록은 CSS 셀렉터가 있는 지면만 담는다. 지면 색을 인라인 style 로 까는 곳은
  // 겨냥할 셀렉터가 없어 목록에 못 넣으므로 이 표시 클래스를 함께 붙인다.
  it('표시 클래스가 보조 텍스트 토큰을 올린다', () => {
    const rule = globalsCss.match(/\.tm-on-tint\s*\{([^}]*)\}/)?.[1];

    expect(rule, '.tm-on-tint 규칙을 찾지 못했다').toBeDefined();
    expect(rule).toMatch(/--text-caption:\s*var\(--grey700\)/);
    expect(rule).toMatch(/--text-muted:\s*var\(--grey700\)/);
  });

  // 클래스만 있고 아무 데도 안 붙으면 아무것도 고쳐지지 않는다 — alpha 에서 실제로
  // 미달이 확인된 두 곳에 붙어 있는지 본다.
  it.each([
    ['src/components/tournaments/pending-review-card.tsx', "background: 'var(--tint-blue)'"],
    ['src/app/tournaments/page.tsx', "background: 'var(--blue50)'"],
    ['src/components/my/my-api-clients.tsx', "'var(--blue50)'"],
  ])('%s 의 틴트 지면에 표시 클래스가 붙어 있다', (file, tint) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source, file + ' 에서 틴트 배경을 찾지 못했다').toContain(tint);
    expect(source).toMatch(/className="tm-on-tint"/);
  });

  it('my-api-clients 의 틴트 카드 3개 모두에 붙어 있다', () => {
    // 이 파일은 blue50/red50 을 조건부로 까는 Card 가 셋이다. 하나만 붙이면 나머지
    // 둘은 그대로 미달로 남는다 — red50 은 4.02:1 로 blue50(4.11)보다 더 낮다.
    const source = readFileSync(resolve(process.cwd(), 'src/components/my/my-api-clients.tsx'), 'utf8');
    const tinted = source.match(/<Card[^>]*var\(--blue50\)/g) ?? [];

    expect(tinted.length).toBe(3);
    for (const tag of tinted) expect(tag).toContain('tm-on-tint');
  });
});

describe('데스크톱 검색 화면의 틴트 지면', () => {
  // 모바일에서는 지면이 흰색이라 문제가 없고, 데스크톱에서만 --grey50 이 깔린다.
  // 그래서 처방도 배경을 주는 그 미디어 쿼리 안 규칙에 둔다(alpha 1440 실측 4.42:1).
  const searchCss = readFileSync(resolve(process.cwd(), 'src/app/desktop/search.css'), 'utf8');

  it.each([
    ['.tm-search-panel-col', /\.tm-search-panel-col\s*\{([^}]*background:\s*var\(--grey50\)[^}]*)\}/],
    ['.tm-search-results-col .tm-empty-state', /\.tm-search-results-col \.tm-empty-state\s*\{([^}]*)\}/],
  ])('%s 는 배경을 까는 규칙 안에서 토큰을 올린다', (_name, pattern) => {
    const rule = searchCss.match(pattern)?.[1];

    expect(rule, '배경을 까는 규칙을 찾지 못했다').toBeDefined();
    expect(rule).toMatch(/background:\s*var\(--grey50\)/);
    expect(rule).toMatch(/--text-caption:\s*var\(--grey700\)/);
    expect(rule).toMatch(/--text-muted:\s*var\(--grey700\)/);
  });
});
