# 앱 모션 시스템 사양 — 전환 · 스켈레톤 · 국소 motion

> Wave 2(전환+스켈레톤)와 Wave 3(국소 motion 일부)의 구현 사양. Wave 1(AppChrome → layout.tsx 셸
> 승격)은 별도 문서/작업의 소관이며, 이 문서는 Wave 1이 끝난 상태를 전제로 설계하되 **Wave 1 이전에도
> 안전하게 부분 적용 가능하도록** 각 절에 의존 여부를 명시한다.
>
> 작성 기준 저장소 상태(2026-09-01, `apps/v1_web` 실측): Next 16.2.10, React 19.2.5(stable 채널),
> `page.tsx` 182 / `loading.tsx` 6 / `template.tsx` 0 / `layout.tsx` 25, `AppChrome`
> (`src/components/v1-ui/shell.tsx`) 47곳에서 개별 렌더, motion/framer-motion 미설치.

## 목차

1. [모션 토큰](#1-모션-토큰)
2. [페이지 전환 규격](#2-페이지-전환-규격)
3. [스켈레톤 프리셋](#3-스켈레톤-프리셋)
4. [motion 라이브러리 도입 범위](#4-motion-라이브러리-도입-범위)
5. [구현 순서 · 파일 목록](#5-구현-순서--파일-목록)
6. [리스크 요약](#6-리스크-요약)
7. [열린 질문](#7-열린-질문)

---

## 1. 모션 토큰

### 1.1 결론: 신규 토큰 0개

`apps/v1_web/src/app/tokens.css:210-214, 161-163`에 이미 있는 5개 duration + 3개 easing을 감사한
결과, **이 문서가 요구하는 모든 동작(페이지 진입/퇴장, push/pop 이징, 스켈레톤→콘텐츠 크로스페이드)을
새 토큰 없이 표현할 수 있다.** "부족한 것만 추가"(정찰 지시)의 가장 정직한 결과는 여기서는 추가가
없다는 것이다 — 새 토큰을 만드는 것 자체가 "duration-page가 400ms, duration-slower도 400ms인데
둘이 다른 토큰"이라는 무의미한 중복을 낳는다.

기존 토큰:

| 토큰 | 값 | 기존 용도(tokens.css 주석) |
|---|---|---|
| `--duration-instant` | 80ms | 눌림 피드백(transform) |
| `--duration-fast` | 120ms | 색 변화, hover |
| `--duration-base` | 160ms | 기본 전환 |
| `--duration-slow` | 240ms | 패널, 시트 |
| `--duration-slower` | 400ms | 등장 애니메이션 |
| `--ease-standard` | cubic-bezier(.4,0,.2,1) | 기본 |
| `--ease-out` | cubic-bezier(0,0,.2,1) | 등장 |
| `--ease-spring` | cubic-bezier(.34,1.56,.64,1) | 강조 등장(오버슛) |

### 1.2 용도 확장 매핑 — 이 문서가 추가하는 "의미"

토큰 값은 그대로 두고, 아래 표만큼 **용도를 문서화**한다(tokens.css 주석에 절 2.4의 코드와 함께
추가). 값 재사용이 정당한 근거를 각 행에 붙인다.

| 신규 용도 | 토큰 | 근거 |
|---|---|---|
| 페이지 push/pop의 `slide` 구간 | `--duration-slower`(400ms) + `--ease-standard` | iOS `UINavigationController`의 기본 push/pop 전환은 관례적으로 ~350ms로 인용된다. Material 3의 "large/emphasized" 전환 duration 밴드는 400~500ms다. 기존 400ms는 이미 이 밴드 안에 있고 "등장 애니메이션"이라는 기존 의미와도 정확히 일치한다 — 페이지 전환도 결국 "새 화면이 등장"하는 것이다. 60fps 웹뷰(16.6ms/frame) 기준 400ms는 24프레임 — 중간 사양 Android(minSdk 26, `apps/v1_android/app/build.gradle.kts:29`)에서 프레임을 드롭해도(예: 18~20프레임 실제 재생) 사용자가 "끊겼다"보다 "약간 빠르게 끝났다"로 인지하는 여유 범위다. 100ms 미만이었다면 프레임 드롭이 곧바로 "순간이동"처럼 보였을 것이다.
| 페이지 push/pop의 `fade` 구간(퇴장) | `--duration-fast`(120ms) + `--ease-standard` | Next.js 공식 View Transitions 가이드(§2.1 참고)의 권장 패턴이 퇴장 fade를 진입보다 짧게 잡는 비대칭 구조다(거기서는 150ms/210ms). 새 토큰을 안 만들기 위해 가장 가까운 기존 값(120ms)을 채택 — 30ms 차이는 60fps에서 2프레임, 체감 불가.
| 페이지 push/pop의 `fade` 구간(진입, exit 뒤에 지연 시작) | `--duration-base`(160ms) + `--ease-out`, `animation-delay: var(--duration-fast)` | "등장" 의미의 기존 토큰(`--ease-out`)을 그대로 쓴다. 지연값도 새 변수 없이 `--duration-fast`(120ms)를 재사용 — "퇴장 fade가 끝나는 시점에 진입 fade가 시작"이라는 의도를 값 자체가 문서화한다.
| 탭 전환(하단탭 5개 간) crossfade | `--duration-base`(160ms) + `--ease-standard` | 탭은 계층 이동이 아니라 동위(peer) 전환이라 iOS `UITabBarController`처럼 슬라이드 없이 즉시에 가깝게 끝나야 한다. 기존 "기본 전환" 의미와 정확히 일치.
| 스켈레톤→콘텐츠 크로스페이드 | `--duration-base`(160ms) + `--ease-out` | 모달 진입(`tm-modal-fade`)과 같은 값 — 이 저장소에서 "무언가 화면에 나타난다"의 표준 길이로 이미 굳어져 있다(모달 38곳, `useModalA11y`의 `MODAL_EXIT_MS=160`과도 동일). 스켈레톤 블록 치수가 실제 콘텐츠와 어긋나면 duration을 아무리 조정해도 레이아웃 튐은 못 잡는다 — 그래서 3장은 duration보다 **치수 정합**에 무게를 둔다.
| CSS 폴백 진입(변형 거리) | 16~24px(신규 CSS 값, 토큰 아님) | 지속시간/이징이 아닌 "이동 거리"는 이 저장소가 애초에 토큰화하지 않는 값이다(`tmPodiumRise` 18px, `tmCardRise` 22px, `tmAwardEnter` translateY(12px) 전부 keyframe에 직접 리터럴로 박혀있다 — globals.css:5984,6182,7218). 같은 관례를 따라 페이지 진입 폴백도 리터럴로 24px를 쓴다(§2.6).

### 1.3 z-index — 손대지 않는다

`--z-top`(90, 라우트 진행바) 위에 새로 얹을 레이어가 없다 — View Transitions는 브라우저가
`::view-transition` 유사요소를 문서 트리 밖에 별도로 그리므로(진짜 top-layer, `dialog`의
`::backdrop`과 유사) 우리 z-index 사다리와 경쟁하지 않는다. 셸 요소(topbar/bottom-nav)에
`view-transition-name`을 붙이는 것은 stacking context를 새로 만드는 게 아니라 VT 스냅샷 그룹을
지정하는 것뿐이다 — tokens.css의 "31/34/38은 정규화 보류" 결정(같은 파일 주석)과 무관하다.

---

## 2. 페이지 전환 규격

### 2.1 메커니즘 결정 — `template.tsx` + 수동 네이티브 View Transitions API

**채택: `template.tsx`를 리마운트 경계로 쓰고, `document.startViewTransition()`을 직접 호출한다.
Next의 `experimental.viewTransition` 플래그(React `<ViewTransition>` 컴포넌트)는 기각한다.**

이 결정은 처음엔 "experimental이라 위험하다"는 손쉬운 이유로 내리려 했지만, 실제로
`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`(설치된 Next 16.2.10에
번들된 공식 문서, 버전 정합 확인됨)를 직접 읽은 뒤 근거를 바꿨다 — 그 문서는 이 플래그가
실제로 동작하고("App Router는 React canary를 쓰므로 `react@canary`를 따로 설치할 필요 없다"),
우리가 필요한 패턴(Suspense reveal, 방향성 슬라이드, 헤더 고정, reduced-motion) 전부를
공식 레시피로 제공한다는 걸 확인시켜줬다. 즉 "안 되니까 안 쓴다"가 아니라 **"되는데도
안 쓴다"**가 진짜 이유다.

기각 근거 3가지(전부 실측/공식 문서 근거):

1. **여전히 `experimental`이다.** 문서 프런트매터가 `version: experimental`이라고 명시한다.
   Next의 실험 플래그는 마이너 버전 사이에 시그니처·기본 동작이 바뀔 수 있고 마이그레이션
   보장이 없다 — "기술부채 0" 원칙에서 이건 도입 시점에 이미 빚이다. 반면 `template.tsx`는
   Next 13부터 있는 안정 API고, `document.startViewTransition()`은 [Baseline 웹 표준](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)이라
   Next 버전과 무관하게 동작이 고정돼 있다.

2. **뒤로가기의 핵심 경로(하드웨어 백버튼·엣지 스와이프)를 이 API가 못 다룬다 — 공식 문서가
   스스로 인정한 한계다.** 원문: *"Browser-initiated back navigations (the back button or
   swipe gestures) do not carry a transition type, so the directional slide does not
   play."* `transitionTypes`는 `<Link>`와 `router.push()/replace()`에만 지원되고
   (`router.back()`은 문서의 지원 목록에 없음), 애초에 네이티브 WebView의 하드웨어 백버튼/엣지
   스와이프는 브라우저 `popstate`를 직접 발생시키지 **Next 라우터 API를 경유하지 않는다.**
   이 앱은 iOS/Android WebView 셸이라(배경 설명) 사용자의 "뒤로가기"는 인앱 백버튼(`AppBackLink`)
   만큼이나 하드웨어 백버튼·스와이프 제스처 비중이 크다 — 정확히 이 API가 못 잡는 경로다.
   결국 `<ViewTransition>`을 쓰더라도 popstate를 감지하는 **별도 레이어가 반드시 필요**하고,
   그러면 "React가 자동으로 해준다"는 이 API의 핵심 이점이 사라진다 — 두 개의 병렬 전환
   시스템(Link 경로용 React API + popstate 경로용 수동 코드)을 유지하느니 하나로 통일하는
   편이 "기술부채 0"에 부합한다.

3. **route-progress.tsx가 이미 popstate/클릭 캡처를 갖고 있다** — 정찰 지시("재사용해라")와
   직접 정합한다. 이 기존 인프라를 확장하는 쪽이 React `<ViewTransition>`으로 182개 라우트를
   전부 새 컴포넌트로 감싸는 것보다 변경 반경이 작다.

**그래도 CSS 레시피는 공식 문서에서 그대로 가져온다** — `::view-transition-old/new/group`은
브라우저 표준 유사요소라 **누가 `startViewTransition()`을 호출했는지와 무관하게 동일하게
동작한다.** React `<ViewTransition>`을 안 쓰기로 한 것과, 그 가이드의 검증된 CSS 패턴(60px
오프셋의 근거, 비대칭 fade 타이밍, 헤더 고정 레시피, reduced-motion 오버라이드)을 재사용하는
것은 별개다 — 아래 §2.4~2.7이 그 레시피를 이 저장소 클래스명으로 옮긴 것이다.

### 2.2 방향 인지 — `useNavigationIntent` 훅으로 route-progress.tsx 리팩터

현재 `route-progress.tsx`(`apps/v1_web/src/components/v1-ui/route-progress.tsx`)는 클릭
캡처(27-45행)와 popstate(52행)를 직접 소유한다. 이 로직을 **동작 변경 없이** 추출해 전환
컨트롤러와 공유한다.

**신규 파일: `apps/v1_web/src/components/v1-ui/use-navigation-intent.ts`**

```ts
'use client';

import { useEffect, useRef } from 'react';

export type NavigationIntentKind = 'push' | 'pop' | 'tab';

export interface NavigationIntentHandlers {
  /** 내부 네비게이션이 "시작"되는 순간(클릭/popstate) — 아직 URL은 안 바뀜. */
  onIntent: (kind: NavigationIntentKind) => void;
}

/**
 * route-progress.tsx가 갖고 있던 클릭(capture)/popstate 캡처를 추출한 것.
 * 진행바와 전환 컨트롤러 둘 다 "내부 링크를 눌렀다/뒤로 갔다"를 알아야 하는데,
 * 로직을 복붙하면 한쪽만 고쳐지는 순간 두 기능이 갈린다 — 그래서 훅으로 뺀다.
 *
 * kind 판별 순서:
 *  1. `.tm-bottom-nav` 안의 앵커 클릭 → 'tab' (동위 전환, 슬라이드 없음)
 *  2. `data-nav-back="true"` 앵커 클릭 → 'pop' (AppBackLink — 실제로는 history push지만
 *     사용자 멘탈모델은 "뒤로"이므로 시각적으로 pop 취급. app-back-link.tsx가 이 속성을 단다)
 *  3. 그 외 내부 앵커 클릭 → 'push'
 *  4. popstate 이벤트(하드웨어 백버튼·엣지 스와이프·브라우저 뒤로) → 'pop'
 *
 * popstate가 forward 버튼에서도 발생하는 것(브라우저 앞으로가기)은 알려진 한계다 — 이
 * 경우도 'pop'으로 분류된다. 모바일 WebView에서 forward 버튼 사용은 극히 드물어(하드웨어
 * 버튼 자체가 없는 경우가 대부분) 실사용 영향이 적다고 판단해 별도 history-index 추적을
 * 추가하지 않았다. 사용자 리포트가 쌓이면 `history.state.idx`를 우리가 직접 증가시켜
 * 비교하는 방식으로 보강할 수 있다(§7 열린 질문 참고).
 */
export function useNavigationIntent({ onIntent }: NavigationIntentHandlers) {
  const handlersRef = useRef({ onIntent });
  handlersRef.current = { onIntent };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      const kind: NavigationIntentKind = anchor.closest('.tm-bottom-nav')
        ? 'tab'
        : anchor.dataset.navBack === 'true'
          ? 'pop'
          : 'push';
      handlersRef.current.onIntent(kind);
    };

    const onPopState = () => handlersRef.current.onIntent('pop');

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);
}
```

`route-progress.tsx`는 이 훅을 소비하도록 리팩터한다(동작 동일, 내부 구현만 바뀜):
기존 27~86행의 `onClick`/`onPopState`/`useEffect` 블록을
`useNavigationIntent({ onIntent: () => start() })` 한 줄로 치환한다. `start()`/`finish()`/
trickle/failsafe 로직은 그대로 둔다 — 진행바는 `kind`를 몰라도 된다.

**`AppBackLink` 수정** (`apps/v1_web/src/components/v1-ui/app-back-link.tsx`): 두 `<Link>`
렌더 지점(폴백 15행, 본체 37행) 모두에 `data-nav-back="true"`를 추가한다. 이 컴포넌트는
`router.back()`이 아니라 계산된 `href`로 향하는 **진짜 `<Link>`** 라 클릭 이벤트만으로는
"뒤로가기 성격"이라는 걸 구분할 수 없다 — 명시적 마커가 필요하다.

### 2.3 전환 컨트롤러 — `PageTransitionController`

**신규 파일: `apps/v1_web/src/components/v1-ui/page-transition-controller.tsx`**

```ts
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigationIntent, type NavigationIntentKind } from './use-navigation-intent';

const MAX_PENDING_MS = 150;
// ↑ VT 콜백 프로미스가 pending인 동안 브라우저는 "old" 스냅샷을 정지 화면으로 보여준다
//   (RouteProgressBar를 포함해 화면 전체가 그 순간엔 갱신되지 않는다 — §2.5 참고).
//   그래서 데이터 로딩 완료까지 기다리지 않고, "새 template.tsx 인스턴스가 마운트됐다"
//   (=스켈레톤이든 콘텐츠든 뭔가 화면에 걸렸다) 시점에 즉시 resolve한다. 그게 이 시간보다
//   오래 걸리면(느린 디바이스·JS 파싱 지연) 타임아웃으로 강제 종료 — "정지 화면"이 150ms를
//   넘기지 않게 하는 상한이다. 값 자체는 새 토큰이 아니라 이 컨트롤러 전용 상수로 둔다 —
//   duration 토큰(§1)은 "재생되는 애니메이션 길이"고 이건 "얼마나 기다릴지"라 성격이 다르다.

export function PageTransitionController() {
  const pathname = usePathname();
  const resolveRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const settlePending = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    resolveRef.current?.();
    resolveRef.current = null;
  };

  const beginTransition = (kind: NavigationIntentKind) => {
    if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
      // 미지원 웹뷰 — §2.6 CSS 폴백이 template.tsx 마운트 시 자동 재생되므로 여기선 아무것도 안 한다.
      document.documentElement.dataset.navKind = kind;
      return;
    }
    // 직전 전환이 아직 pending이면(연타 네비게이션) 먼저 정리 — 고아 프로미스가 남으면
    // 다음 startViewTransition() 호출이 브라우저에 따라 무시되거나 대기열에 쌓인다.
    settlePending();

    document.documentElement.dataset.navKind = kind;
    document.startViewTransition(() => new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      timeoutRef.current = setTimeout(settlePending, MAX_PENDING_MS);
    }));
  };

  useNavigationIntent({ onIntent: beginTransition });

  // template.tsx가 새로 마운트되면(=pathname 변경이 커밋됨) pending VT를 즉시 resolve.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    settlePending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
```

`app/layout.tsx`에 `<RouteProgressBar />` 옆에 `<PageTransitionController />`를 추가한다
(순서 무관 — 둘 다 `useNavigationIntent`를 각자 호출하므로 독립적으로 동작한다. 리스너가
두 벌 붙지만 클릭 캡처 리스너는 가벼워 문제되지 않는다 — 굳이 하나로 합치면 진행바와 전환
컨트롤러의 관심사가 섞여 오히려 결합도가 올라간다).

### 2.4 세 가지 전환 시각 규격

`template.tsx`가 반환하는 wrapper에 `data-nav-kind`(HTML 루트에서 상속받아 CSS 선택자로 읽음)
값에 따라 다른 애니메이션이 재생된다. VT 경로(브라우저 지원)와 CSS 폴백 경로(§2.6)는 **거리가
다르다** — VT는 old+new가 동시에 존재하므로 진짜 side-by-side가 가능하지만, 폴백은 new만
존재하므로(old는 이미 사라짐) 과한 거리를 쓰면 "허공에서 날아온다"는 부자연스러움이 생긴다.

| 구분 | 변형 축 | 거리(VT: old/new) | 거리(CSS 폴백: new만) | duration | easing | opacity 곡선 |
|---|---|---|---|---|---|---|
| **push**(forward) | translateX | old: 0→-24%, new: 100%→0 | new: 24px→0 | slide 400ms(`--duration-slower`) / fade는 아래 행 | slide: `--ease-standard`, fade-in: `--ease-out` | old: 1→0 (120ms `--duration-fast`), new: 0→1 (160ms `--duration-base`, 120ms 지연) |
| **pop**(back) | translateX | old: 0→100%, new: -24%→0 | new: -24px→0 | 위와 동일(부호만 반전) | 위와 동일 | 위와 동일 |
| **tab** | 없음(슬라이드 안 함) | — | — | 160ms(`--duration-base`) | `--ease-standard` | old: 1→0, new: 0→1 (동시, 단일 crossfade) |

**push/pop의 old가 -24%/100%까지만 움직이는 이유**(0/-100%가 아니라): 실제 iOS
`UINavigationController`의 parallax push는 나가는 화면이 들어오는 화면보다 **적게** 움직인다
(전체 이동량의 약 1/3) — "스택에 쌓인다"는 깊이감을 준다. 대칭으로 두 화면이 똑같이 움직이면
"교체"처럼 보이고 "쌓임"처럼 안 보인다. -24%는 이 비례를 100%(new 이동량)의 1/4로 근사한 값 —
정확한 iOS 비율(1/3)보다 살짝 보수적으로 잡아 화면 밖으로 완전히 나가지 않는 old가 어색해
보이지 않는 선에서 타협했다.

**CSS 폴백이 60px가 아니라 16~24px인 이유**: 공식 Next 가이드의 60px 오프셋은 old+new가
함께 보이는 상황(추적할 대상이 명확) 전제다. 폴백은 new 혼자 등장하므로, 이 저장소의 기존
"콘텐츠 등장" 어휘(`tmPodiumRise` 18px, `tmCardRise` 22px, `tmAwardEnter` 12px)와 같은
스케일(16~24px)을 쓰는 편이 **이미 앱 전체에 깔린 모션 언어와 일관**된다 — 페이지 전환만
유독 큰 거리를 쓰면 "왜 여기만 다르지"가 된다. push는 24px, pop은 -24px(부호 반전)를 쓴다.

CSS (globals.css에 추가):

```css
/* ── 페이지 전환: VT 경로 ─────────────────────────────────────────────── */
@keyframes tm-page-slide {
  from { translate: var(--tm-slide-offset); }
  to { translate: 0; }
}
@keyframes tm-page-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

::view-transition-old(page-content) {
  animation:
    var(--duration-fast) var(--ease-standard) both tm-page-fade reverse,
    var(--duration-slower) var(--ease-standard) both tm-page-slide reverse;
}
::view-transition-new(page-content) {
  animation:
    var(--duration-base) var(--ease-out) var(--duration-fast) both tm-page-fade,
    var(--duration-slower) var(--ease-standard) both tm-page-slide;
}

:root[data-nav-kind="push"] { --tm-slide-offset: -24%; } /* old 쪽 기준값 — new는 아래서 부호 반전 */
:root[data-nav-kind="push"] ::view-transition-new(page-content) { --tm-slide-offset: 100%; }
:root[data-nav-kind="pop"]  { --tm-slide-offset: 100%; }
:root[data-nav-kind="pop"]  ::view-transition-new(page-content) { --tm-slide-offset: -24%; }

/* 탭 전환은 슬라이드 없이 crossfade만 — 위 슬라이드 애니메이션을 덮어쓴다 */
:root[data-nav-kind="tab"] ::view-transition-old(page-content),
:root[data-nav-kind="tab"] ::view-transition-new(page-content) {
  animation: var(--duration-base) var(--ease-standard) both tm-page-fade;
}
:root[data-nav-kind="tab"] ::view-transition-old(page-content) { animation-direction: reverse; }

/* ── 페이지 전환: CSS 폴백(VT 미지원 웹뷰) — template.tsx가 마운트 시 재생 ──────── */
@keyframes tm-page-fallback-push {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes tm-page-fallback-pop {
  from { opacity: 0; transform: translateX(-24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes tm-page-fallback-tab {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.tm-page-transition-enter[data-nav-kind="push"] { animation: tm-page-fallback-push var(--duration-slower) var(--ease-out) both; }
.tm-page-transition-enter[data-nav-kind="pop"]  { animation: tm-page-fallback-pop var(--duration-slower) var(--ease-out) both; }
.tm-page-transition-enter[data-nav-kind="tab"]  { animation: tm-page-fallback-tab var(--duration-base) var(--ease-standard) both; }
/* data-nav-kind가 아직 없는 최초 진입(딥링크·새로고침)은 애니메이션 없이 그대로 보인다 —
   속성 선택자가 매칭 안 되므로 별도 처리가 필요 없다. */
```

### 2.5 View Transitions 적용 범위 — "정지 화면" 문제를 어떻게 피했는가

`document.startViewTransition(callback)`은 callback이 반환한 프로미스가 pending인 동안
**old 스냅샷을 정지 화면으로 보여준다** — 이 구간엔 RouteProgressBar의 trickle 애니메이션도
갱신되지 않는다(살아있는 DOM이 아니라 캡처된 이미지가 그려지기 때문). 데이터 페칭이 끝날 때까지
이 프로미스를 안 끝내면, 느린 네트워크에서 진행바가 "얼어붙는" 회귀가 생긴다.

**회피 전략**: §2.3의 `PageTransitionController`가 프로미스를 데이터 도착이 아니라 **새
template.tsx 인스턴스의 마운트**(=`pathname` 변경 커밋) 시점에 resolve한다. 3장에서 176개
페이지 전부에 `loading.tsx`(스켈레톤)를 배치하므로, 이 마운트는 데이터 유무와 무관하게
근시일 내(대개 1~2 프레임) 일어난다 — VT가 전환해 들어가는 "new" 상태는 **최종 콘텐츠가 아니라
스켈레톤**이다. 데이터가 실제로 도착해 스켈레톤이 콘텐츠로 바뀌는 것은 VT 바깥의, 별개의
크로스페이드(§3.3)다. `MAX_PENDING_MS=150`이 이 마운트가 유별나게 늦는 경우(저사양 기기의 JS
파싱 지연 등)의 상한이다 — 150ms는 정지 화면으로도 거의 인지되지 않는 길이면서, 정상적인
`loading.tsx` 마운트에는 절대 걸리지 않을 만큼 넉넉하다.

이 설계 덕분에 Next 공식 가이드의 "Suspense reveal" 패턴(§2.1에서 기각한 React
`<ViewTransition>`)이 프레임워크 레벨에서 풀던 문제를, 우리는 **"전환 대상을 최종 콘텐츠가
아니라 스켈레톤으로 낮춘다"**는 다른 방식으로 우회한 것이다 — React의 Suspense 스케줄링에
올라타지 않고도 같은 결과(정지 화면 없이 빠른 전환)를 얻는다.

### 2.6 미지원 웹뷰 폴백

`'startViewTransition' in document`가 `false`인 환경(Chromium 111 미만 — Android WebView는
minSdk 26부터 지원하므로 자동업데이트가 꺼진 구형 기기에서 흔할 수 있다; iOS는 WebKit이
Safari 18/iOS 18부터 지원하므로 그 이전 iOS를 지원 대상으로 두고 있다면 확인 필요 — §7)에서는:

- `PageTransitionController`가 `document.startViewTransition` 호출을 건너뛰고
  `data-nav-kind`만 설정한다(§2.3 코드의 `if` 분기).
- `template.tsx`(§2.9)가 마운트되며 `.tm-page-transition-enter` 클래스 + 부모로부터 상속된
  `data-nav-kind`로 §2.4의 CSS keyframe 애니메이션이 **자동 재생**된다 — 이 경로는 JS 타이밍
  조율이 전혀 필요 없다(`animation`은 엘리먼트가 페인트되면 스스로 재생을 시작하므로, 데이터가
  언제 도착하든 진입 애니메이션의 정확성에 영향을 주지 않는다).
- old 페이지가 함께 움직이는 연출은 이 경로에서 원천적으로 불가능하다(§2.4에서 설명) — "완전히
  다른 경험"이 아니라 "같은 언어의 축소판"이 되도록 거리/축을 맞췄다.
- 셸(topbar/bottom-nav) 배제는 이 경로에서 **아무 작업도 필요 없다** — VT 자체가 안 걸리므로
  셸이 애초에 스냅샷 대상이 아니다.

### 2.7 sticky/fixed 셸 요소 처리 — VT에서 셸을 제외한다

Wave 1(AppChrome 승격) 이전에도, 이후에도 `.tm-topbar`/`.tm-bottom-nav`/`.tm-fixed-cta`는
화면상 고정된 위치를 지킨다(`.tm-app-frame` 안에서 `position: absolute`/`fixed`로 이미 고정
— `globals.css:510-608`). VT는 기본적으로 **이름 없는 모든 요소를 문서 루트 하나의 그룹으로
묶어** 캡처하므로, 이름을 안 주면 셸도 페이지 콘텐츠와 함께 슬라이드해버린다(셸은 "지속"되므로
이건 명백한 결함이다).

```css
/* Next 공식 가이드(§2.1)의 헤더 고정 레시피를 이 저장소 클래스명에 맞춰 적용 */
.tm-topbar      { view-transition-name: tm-shell-topbar; }
.tm-bottom-nav  { view-transition-name: tm-shell-bottomnav; }
.tm-fixed-cta   { view-transition-name: tm-shell-fixed-cta; }
.tm-route-progress { view-transition-name: tm-shell-route-progress; }

::view-transition-group(tm-shell-topbar),
::view-transition-group(tm-shell-bottomnav),
::view-transition-group(tm-shell-fixed-cta),
::view-transition-group(tm-shell-route-progress) {
  animation: none;
  z-index: 100; /* 슬라이드하는 page-content 그룹 위에 그려지도록 */
}
::view-transition-old(tm-shell-topbar),
::view-transition-old(tm-shell-bottomnav),
::view-transition-old(tm-shell-fixed-cta),
::view-transition-old(tm-shell-route-progress) {
  display: none; /* old+new가 겹쳐 두 겹으로 보이는 것 방지 */
}
::view-transition-new(tm-shell-topbar),
::view-transition-new(tm-shell-bottomnav),
::view-transition-new(tm-shell-fixed-cta),
::view-transition-new(tm-shell-route-progress) {
  animation: none;
}
```

**주의 — 여러 요소가 `view-transition-name`을 놓고 충돌하면 VT 전체가 조용히 취소된다.**
스펙상 같은 캡처 순간에 동일한 이름을 가진 요소가 둘 이상이면 브라우저가 경고를 찍고 그
전환을 건너뛴다(즉시 스냅으로 폴백, 에러는 안 남). `.tm-topbar`/`.tm-bottom-nav`는 Wave 1
이전엔 47곳의 개별 페이지가 각자 렌더하지만 **한 순간에 화면엔 하나만 존재**하므로(라우팅이
한 페이지씩만 보여주므로) 이 충돌은 발생하지 않는다 — 다만 Wave 1 승격 후 레이아웃 전환 중
잠깐이라도 이전 페이지의 AppChrome과 새 페이지의 AppChrome이 동시에 DOM에 존재하는 구조로
바뀐다면(예: 병렬 라우트) 재검토가 필요하다. 현재 25개 layout.tsx 중 parallel route 사용 여부는
이 문서 범위 밖이라 확인하지 않았다 — Wave 1 설계 문서에서 확인할 것.

`.tm-fixed-cta`는 라우트마다 있을 수도 없을 수도 있다(폼 페이지 등에서만 등장) — 이름을
붙여도 그 라우트에 해당 요소가 없으면 단순히 매칭이 안 될 뿐 에러가 나지 않는다.

### 2.8 prefers-reduced-motion 정합 — 기존 전역 규칙의 사각지대를 메운다

`globals.css`의 기존 전역 catch-all(`* { animation-duration: 0.01ms !important; ... }`)은
**`::view-transition-*` 유사요소를 잡지 못한다** — 이건 추측이 아니라 Next 공식 가이드(§2.1)가
스스로 별도 오버라이드를 두는 이유이기도 하다(원문: "Directional slides simulate physical
movement... this is the most common trigger for motion sensitivity"). 유사요소는 일반
`*` 전체 선택자로 셀렉트되지 않는 별도 카테고리라, VT를 새로 도입하면서 아래 블록을 **명시
추가하지 않으면 이 저장소의 접근성 규칙(WCAG AA, prefers-reduced-motion 필수)이 조용히
깨진다.**

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

CSS 폴백 경로(`.tm-page-transition-enter`)는 기존 전역 catch-all이 이미 커버한다(일반
엘리먼트의 `animation`이므로 `*` 선택자에 잡힌다) — 별도 처리 불필요.

### 2.9 `template.tsx` 배치

**신규 파일: `apps/v1_web/src/app/template.tsx`** (루트 하나, 전체 182개 라우트에 적용 —
이 저장소엔 `(auth)`/`(main)` 같은 라우트 그룹 분리가 없어 단일 루트 template.tsx로 충분하다.
`.tm-app-frame`을 쓰는 메인 화면과 `.tm-auth-frame`을 쓰는 인증 화면 모두 100dvh 전체화면
컨테이너라 같은 전환 wrapper를 씌워도 지오메트리 충돌이 없다):

```tsx
export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="tm-page-transition-enter"
      style={{ viewTransitionName: 'page-content' }}
    >
      {children}
    </div>
  );
}
```

`template.tsx`는 Next 사양상 **매 네비게이션마다 새 인스턴스로 리마운트**된다(layout.tsx와의
핵심 차이) — 그래서 CSS 폴백의 `animation`이 매번 재생되고(§2.6), VT 경로에서는 이 리마운트
자체가 §2.5의 "resolve 신호"가 된다. `view-transition-name: 'page-content'`를 인라인
`style`로 주는 것은 React 표준 문법이며(camelCase CSS 프로퍼티), Next의 `<ViewTransition>`
컴포넌트 없이도 100% 동작한다 — §2.1에서 설명했듯 유사요소 시스템은 호출 주체를 가리지 않는다.

이 wrapper가 `.tm-scroll-area`의 자식이 되므로(Wave 1 이후: `AppChrome`이 layout.tsx로
올라가고 `{children}`이 `.tm-scroll-area` 안에서 이 template.tsx를 거친다) 슬라이드
애니메이션은 스크롤 영역 내부에서만 일어난다 — `.tm-app-frame`의 `overflow: hidden`이 혹시
넘치는 부분을 잘라주는 이중 안전장치 역할도 한다(CSS 폴백 경로에 한해 — VT 경로는
유사요소가 top-layer라 이 클리핑의 영향을 받지 않는다는 점을 §6 리스크에 남긴다).

---

## 3. 스켈레톤 프리셋

### 3.1 기존 인프라 재사용 — 새 시스템을 안 만든다

이미 **두 개의 독립된, 각자 검증된 스켈레톤 시스템**이 있다:

1. `.tm-skeleton`/`tm-skeleton-pulse`(CSS, `--grey100` 배경) — 소비자 화면용,
   `PageSkeleton`(`components/v1-ui/page-skeleton.tsx`)이 `list`/`detail` 2개 variant로 이미
   6개 `loading.tsx`에서 쓰인다.
2. Tailwind `animate-pulse` + `--card-surface`/`--border`/`--surface-soft` 토큰 —
   어드민 화면용, `admin-skeleton.tsx`의 `AdminKpiGridSkeleton`/`AdminListSkeleton`/
   `AdminTableSkeleton`/`AdminPageSkeleton`이 **이미 완성돼 있고** `AdminDataTable`이 로딩 중
   내부적으로 재사용 중이다(`skeletonRows` prop).

이 문서는 **7개 그룹 각각에 이 둘 중 하나를 배정**한다 — board/console은 어드민 톤이 강하므로
2번 계열을, 나머지는 1번 계열을 확장한다. 세 번째 시스템을 새로 만들지 않는 것 자체가
"기술부채 0"의 실천이다(이미 있는 두 시스템도 통합할 명분이 없다 — 서로 다른 디자인
언어(소비자 vs 어드민)를 쓰는 화면군이 각자의 토큰을 쓰는 게 맞다).

### 3.2 그룹별 프리셋 사양

| 그룹(정찰 분류, 개수) | 시스템 | variant/컴포넌트 | 치수 |
|---|---|---|---|
| **list**(~24) | `.tm-skeleton` | `PageSkeleton variant="list"`(기존, 무변경) | 검색바 44px + 칩4×32px(72px폭) + 카드5×96px, gap 16px |
| **detail**(~19) | `.tm-skeleton` | `PageSkeleton variant="detail"`(기존, 무변경) | 히어로172px + 제목22px(62%) + 부제14px(42%) + 블록2×120px |
| **board**(~30, admin) | Tailwind `animate-pulse` | `AdminPageSkeleton`(대시보드 1곳) / `AdminBoardListSkeleton`(신규, 나머지 29곳) | 아래 §3.2.1 |
| **console**(~15) | `.tm-skeleton` | `PageSkeleton variant="console"`(신규) | 아래 §3.2.2 |
| **auth**(~12) | `.tm-skeleton` | `PageSkeleton variant="auth"`(신규) | 아래 §3.2.3 |
| **form**(~26) | `.tm-skeleton` | `PageSkeleton variant="form"`(신규) | 아래 §3.2.4 |
| **static**(~6) | 없음 | `loading.tsx` 자체를 안 만든다 | 아래 §3.2.5 |

#### 3.2.1 board — 두 하위 프리셋

`admin/matches/page.tsx` 같은 board 페이지 대다수(정찰: inquiries/matches/users/teams/
team-matches/league-matches/league-match-disputes/reports/teams — 8곳 이상 확인, 나머지도
동일 `AdminDataTable` 패턴)는 **필터바 + 테이블뿐, KPI 그리드가 없다.** 기존
`AdminPageSkeleton`은 KPI 그리드(`AdminKpiGridSkeleton`)를 항상 포함하므로 이 페이지들에
그대로 쓰면 "실제로 안 뜰 4개 박스"가 스켈레톤에만 보이는 레이아웃 튐이 생긴다 — 실제로
`admin/matches/page.tsx`를 열어 확인: `'use client'` 페이지가 `<Suspense fallback={null}>`
로 감싸져 있어 현재 라우트 레벨 로딩 표시가 **전무하다**(내부 `AdminDataTable`의
`loading`/`skeletonRows`는 페이지가 이미 마운트된 *뒤* 데이터 재요청에만 쓰인다 — 라우트
전환 자체의 공백은 못 막는다).

**신규: `AdminBoardListSkeleton`** (`apps/v1_web/src/components/admin/admin-skeleton.tsx`에 추가):

```tsx
export function AdminBoardListSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 bg-[var(--surface-soft)] rounded-lg w-16 mb-2" />
        <div className="h-7 bg-[var(--surface-soft)] rounded-lg w-48" />
      </div>
      <div className="flex gap-2 mb-6">
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-24" />
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-24" />
        <div className="h-10 bg-[var(--surface-soft)] rounded-xl w-20" />
      </div>
      <AdminTableSkeleton rows={rows} cols={cols} />
    </div>
  );
}
```

`AdminPageSkeleton`(기존, KPI 포함)은 `admin/page.tsx`(대시보드, 실측: `card=1 table=1
console=1`) 한 곳에만 그대로 쓴다. `admin/tournaments/page.tsx`(정찰: `console=1` 모니터링
위젯)처럼 KPI는 없지만 board와 다른 부가 위젯이 있는 소수 페이지는 구현 시 실제 화면과
대조해 `AdminBoardListSkeleton`에 위젯 자리만큼 블록을 더할지 개별 판단한다(이 문서가 30개
전부의 위젯 유무를 확인하지 못했다 — §6 리스크).

`rows`/`cols` 기본값(8/5)은 기존 `AdminDataTable`의 `skeletonRows` 기본값(5)보다 조금 크게
잡았다 — 라우트 레벨 스켈레톤은 첫 화면 골격이라 화면을 더 채워야 "빈 페이지"처럼 안 보인다.

#### 3.2.2 console — 신규 variant

`operate-console.tsx`(1581줄, 실시간 소켓 콘솔) 등 15곳의 공통 골격: 연결상태 바 + 스코어/시계
블록 + 액션 버튼 그리드. **정확한 픽셀은 이 문서에서 실측하지 못했다** — 구현 시 실제 콘솔
화면 스크린샷과 대조해 보정할 것(CLAUDE.md 규칙 4: UI 변경 후 라이브 시각 검증 필수).

```tsx
// PageSkeleton variant='console' 분기
<>
  <SkeletonBlock height={32} radius={16} />                 {/* 연결상태 바 */}
  <SkeletonBlock height={88} radius={16} style={{ marginTop: 8 }} /> {/* 스코어/시계 */}
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonBlock key={i} height={56} radius={12} />       {/* 액션 버튼 3x2 */}
    ))}
  </div>
</>
```

#### 3.2.3 auth — 신규 variant

`onboarding/*`, 로그인, 약관 등 12곳의 공통 골격: 중앙정렬 아이콘 + 제목/부제 2줄 + 단일 CTA.
`otp-verification-card.tsx`의 `idle` phase 구조(제목 라벨 + 큰 버튼 하나)와
`onboarding-client.tsx`의 스텝 화면 구조를 근거로 잡았다.

```tsx
// PageSkeleton variant='auth' 분기
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 48 }}>
  <SkeletonBlock height={96} width="96px" radius={999} />   {/* 아이콘/일러스트 원형 */}
  <SkeletonBlock height={24} width="55%" />                  {/* 제목 */}
  <SkeletonBlock height={16} width="75%" />                  {/* 부제 */}
  <SkeletonBlock height={52} radius={14} style={{ marginTop: 24, width: '100%' }} /> {/* CTA */}
</div>
```

#### 3.2.4 form — 신규 variant

`matches/new` 등 26곳(다수가 멀티스텝 마법사)의 공통 골격: 스텝 인디케이터 + 반복되는
라벨+인풋 블록. `otp-verification-card.tsx`의 `tm-auth-field`(라벨 `span` + `input`) 패턴,
`tournament-progress-stepper.tsx`의 존재를 근거로 잡았다.

```tsx
// PageSkeleton variant='form' 분기
<>
  <div style={{ display: 'flex', gap: 6 }}>
    {Array.from({ length: 4 }).map((_, i) => (
      <SkeletonBlock key={i} height={4} radius={2} style={{ flex: 1 }} />  {/* 스텝 인디케이터 */}
    ))}
  </div>
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
      <SkeletonBlock height={14} width="30%" />   {/* 라벨 */}
      <SkeletonBlock height={52} radius={12} />    {/* 인풋 */}
    </div>
  ))}
</>
```

#### 3.2.5 static — 스켈레톤을 만들지 않는다

정찰이 분류한 ~6곳(약관 텍스트, 정적 안내 등)은 데이터 페칭이 없거나 있어도 즉시 렌더 가능한
정적 콘텐츠다. 스켈레톤은 "곧 채워질 자리"를 예고하는 장치인데, 채울 게 거의 즉시 나타나는
화면에 스켈레톤을 넣으면 스켈레톤 자체가 깜빡임(flash)이 된다 — `loading.tsx`를 아예 만들지
않는 것이 맞는 설계다. `template.tsx`의 진입 애니메이션(§2.4)만으로 충분하다.

### 3.3 스켈레톤 → 콘텐츠 전환 — 2단 계층

Next의 App Router에서 `loading.tsx`(Suspense fallback)는 데이터가 준비되면 **한 번의 커밋으로
콘텐츠로 교체**된다 — fallback이 언마운트되고 콘텐츠가 마운트되는 단일 스위치라, 브라우저
Suspense 메커니즘만으로는 "둘이 동시에 보이며 겹쳐 사라지고 나타나는" 진짜 크로스페이드를
만들 수 없다(React `<ViewTransition>`의 "Suspense reveal" 패턴이 이 문제를 프레임워크
레벨에서 푸는 이유이기도 하다 — 우리는 §2.1에서 그 컴포넌트를 안 쓰기로 했으므로 이 문제를
직접 풀어야 한다). 176개 페이지 전부에 React 상태 기반의 정교한 크로스페이드를 요구하는 건
과한 구현 부담이라, **트래픽 비중에 따라 2단으로 나눈다.**

**1단(176개 전부, 기본값 — 추가 코드 없이 적용)**: 콘텐츠가 마운트되는 순간 짧게 페이드인만
준다. 진짜 크로스페이드(둘이 겹침)는 아니지만, "뚝 끊긴다"는 체감을 `--duration-base`(160ms)
만큼의 부드러운 등장으로 완화한다.

```css
.tm-content-enter {
  animation: tm-page-fade var(--duration-base) var(--ease-out) both; /* §2.4에서 정의한 keyframe 재사용 */
}
```

각 페이지의 실제 콘텐츠 최상위 wrapper에 이 클래스를 붙인다(page.tsx 또는 각 라우트가
위임하는 `-client.tsx`의 루트 엘리먼트). 176개 전부에 손으로 붙이는 대신, §5에서 제안하는
codemod가 `loading.tsx` 생성과 함께 대상 파일을 찾아 자동으로 삽입하는 것을 권장한다.

**2단(선택, 고트래픽 6곳만 — 기존 `loading.tsx` 보유 라우트: home/matches/team-matches/
teams/tournaments/tournaments/[id])**: 데이터 도착 시점을 클라이언트에서 직접 알 수 있는
페이지(React Query의 `isLoading` 등)에 한해, **진짜 크로스페이드**를 VT로 구현한다. 이
경우는 §2.5와 달리 "이미 데이터가 준비된 상태에서 로컬 state를 바꾸는" 동기적 전환이라
freeze 문제가 없다:

```ts
function handleDataReady() {
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => setIsLoading(false));
  } else {
    setIsLoading(false);
  }
}
```

`isLoading` 분기의 스켈레톤/콘텐츠 두 엘리먼트에 각각 `view-transition-name: 'skeleton-swap'`
을 주면(둘 다 같은 이름 — 어차피 동시에 존재하지 않으므로 §2.7의 충돌 규칙에 안 걸린다)
브라우저 기본 크로스페이드가 적용된다. 이 6곳은 이미 `loading.tsx`를 보유해 스켈레톤 치수가
검증된 곳들이라 2단 적용의 위험이 가장 낮다 — 나머지 170곳은 1단으로 시작하고, 필요성이
확인되면 개별적으로 승격한다(§5).

### 3.4 loading.tsx 배치 — 기계적 작업이므로 스크립트화를 권장

176개 파일을 손으로 쓰지 않는다. route-taxonomy 정찰이 이미 182개 전부를 7개 그룹으로
분류했으므로(일부는 대표 항목에 그룹화돼 있어 개별 경로 목록은 재확인 필요), 그 분류를
JSON으로 정리해 아래 형태의 스크립트로 생성하는 것을 권장한다:

```js
// scripts/docs/generate-route-loading-skeletons.mjs (신규, 예시 — 정찰 분류 JSON을 입력으로 받는다)
// group → PageSkeleton variant 매핑에 따라 각 라우트 디렉터리에 loading.tsx를 쓴다.
// board 그룹은 PageSkeleton이 아니라 admin-skeleton.tsx의 export를 쓴다 — 매핑표(§3.2) 그대로.
```

생성될 파일 3종의 verbatim 예시:

```tsx
// apps/v1_web/src/app/notices/loading.tsx (list)
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
export default function Loading() {
  return <PageSkeleton variant="list" />;
}
```

```tsx
// apps/v1_web/src/app/admin/inquiries/loading.tsx (board)
import { AdminBoardListSkeleton } from '@/components/admin/admin-skeleton';
export default function Loading() {
  return <AdminBoardListSkeleton />;
}
```

```tsx
// apps/v1_web/src/app/onboarding/sport/loading.tsx (auth)
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
export default function Loading() {
  return <PageSkeleton variant="auth" />;
}
```

이 방식이 CLAUDE.md의 "skeleton-first 점진적 빌드"(전역 규칙 22)와 정확히 맞는다 — 뼈대
(스크립트 + 7개 프리셋)를 먼저 세우고, 그룹 분류가 틀린 개별 페이지가 발견되면 그 파일만
점진적으로 고친다. 176개를 한 번에 다 맞추려 하지 않는다.

---

## 4. motion 라이브러리 도입 범위

### 4.1 최종 채택 — 1건: Bottom Sheet 드래그 상호작용

정찰(ref-beui-rareui)이 올린 후보는 Tabs(하단탭 pill)와 Bottom Sheet 2건이었다. 각각을
"CSS로 정말 안 되는가"로 재검증한 결과, **Tabs는 기각하고 Bottom Sheet만 채택한다.**

#### 기각: 하단탭 pill 슬라이드 (Tabs 패턴)

정찰이 인용한 이유("shared element layoutId 전환")를 그대로 받아들이지 않고 직접 검토했다.
`.tm-bottom-tab[data-active="true"]::before`(`globals.css:678`)는 탭마다 독립된 `::before`라
지금은 색만 바뀌고 위치는 안 움직인다 — 이건 사실이다. 하지만 "위치가 미끄러지는 pill"
자체는 **JS로 목표 탭의 위치를 측정해 CSS 변수에 주입하고, `transform: translateX(var(--x))`에
`transition`을 거는 것만으로 완전히 재현 가능**하다(ref-transitions 정찰이 "Tabs Sliding"을
`[css-only]`로 판정한 것과 일치, 동일 앱 안에서 두 정찰이 상충된 판정을 낸 지점이라 직접
재검토했다). Framer Motion의 `layoutId`가 이 수동 구현 대비 추가로 주는 건 (a) 측정 자동화
(b) 스프링 물리인데, (b)는 이 저장소에 **이미 있는 `--ease-spring`**(cubic-bezier 오버슛)
토큰으로 근사 가능하다 — "더 부드럽다"가 아니라 "물리 라이브러리 없이 같은 시각효과를 내는
구체적 CSS 경로가 존재한다"는 게 기각 근거다.

CSS로 재구현할 경우의 스케치(신규 컴포넌트 아님, `shell.tsx`의 `BottomNav` 함수 내부 수정):

```tsx
// shell.tsx BottomNav — 탭 컨테이너에 ref, 활성 탭 인덱스로 --pill-x/--pill-w 계산
const navRef = useRef<HTMLElement>(null);
useEffect(() => {
  const activeEl = navRef.current?.querySelector<HTMLElement>('[data-active="true"]');
  if (!activeEl || !navRef.current) return;
  const navRect = navRef.current.getBoundingClientRect();
  const tabRect = activeEl.getBoundingClientRect();
  navRef.current.style.setProperty('--pill-x', `${tabRect.left - navRect.left + tabRect.width / 2}px`);
}, [activeTab]);
```

```css
/* globals.css — 기존 .tm-bottom-tab[data-active]::before(개별) 대신 nav 레벨 단일 pill */
.tm-bottom-nav-pill {
  position: absolute;
  top: 2px; left: 0;
  width: 46px; height: 26px;
  transform: translateX(calc(var(--pill-x, 0px) - 23px));
  transition: transform var(--duration-base) var(--ease-spring);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--blue500) 14%, transparent);
  z-index: 0;
}
```

**이 리팩터는 이 문서의 실행 범위에 넣지 않는다** — 셸 관련 파일(`shell.tsx`) 수정은 Wave 1
(AppChrome 승격)과 같은 파일을 건드리므로, 두 작업이 병렬로 진행되면 충돌한다. §5에 Wave 1
완료 후 후속 작업으로 남긴다.

#### 채택: Bottom Sheet 드래그+관성

**정찰 정정**: ref-beui-rareui는 "우리 앱엔 바텀시트 자체가 없다"고 적었는데, 직접 확인한 결과
**있다.** `.tm-filter-sheet`/`.tm-filter-scrim`/`.tm-filter-sheet-handle`
(`globals.css:2701-2790` 부근)이 매치/팀매치/팀 목록(`matches-page.tsx`,
`team-matches-page.tsx`, `teams-page.tsx`) 등 최소 5개 파일에서 필터/정렬 선택 UI로 이미
쓰이고 있다 — 다만 CSS `translateY(100%)→0` 슬라이드 진입만 있고, **드래그로 닫는 제스처는
없다**(단, `.tm-filter-sheet-handle`이라는 42×4px pill 형태의 "드래그 핸들처럼 보이는"
장식 엘리먼트가 이미 있어 사용자에게 "끌 수 있을 것 같은" 기대를 준다 — 실제로는 안 끌린다는
불일치가 있다).

**CSS로 안 되는 이유(구체적)**: 드래그 제스처는 세 가지를 요구한다.
1. **포인터 이동에 실시간으로 1:1 추종** — `pointermove`마다 `transform`을 명령형으로 갱신해야
   한다. CSS `transition`은 두 "상태" 사이를 보간하는 것이지, 매 프레임 바뀌는 임의의 입력값을
   따라가는 것이 아니다 — 구조적으로 불가능하다(더 매끄럽게 만들 수 있는 문제가 아니라
   애초에 CSS의 적용 대상이 아니다).
2. **놓는 순간의 속도로 스냅 지점을 결정**(관성) — "빠르게 튕기면 작은 이동거리로도 완전히
   닫힘"은 릴리스 시점의 velocity를 알아야 계산 가능한데, CSS는 velocity라는 개념 자체가
   없다.
3. **그 velocity를 초기조건으로 갖는 스프링 감속** — 물리적으로 자연스러운 "튕겨 나가듯
   멈추는" 정착 애니메이션은 시작 속도가 0이 아닌 스프링 시뮬레이션이 필요한데, CSS
   애니메이션/전환은 항상 정지 상태(velocity=0)에서 시작한다.

이 세 가지는 전부 "제스처+물리" 문제라 순수 CSS의 적용 범위 밖이다 — Framer Motion의
`drag`/`dragElastic`/`onDragEnd`(velocity 정보 포함) + 스프링 트랜지션이 정확히 이 문제를
위한 기능이다.

**파일**: 신규 `apps/v1_web/src/components/v1-ui/bottom-sheet.tsx` — `role="dialog"` +
`aria-modal="true"` + ESC 핸들러 + focus trap은 `confirm-modal.tsx`/`use-modal-a11y.ts`의
기존 패턴을 그대로 재사용한다(모달 접근성 인프라는 motion 도입과 무관하게 검증된 자산이므로
새로 만들지 않는다).

```tsx
'use client';
import { lazy, Suspense } from 'react';

// motion은 이 파일을 import하는 순간에만 로드된다 — 바텀시트를 안 여는 세션은 0바이트.
const MotionSheetBody = lazy(() => import('./bottom-sheet-motion-body'));

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  if (!open) return null;
  return (
    <Suspense fallback={null /* motion 청크 로딩 중 — 스크림만 먼저 보임, §2.6과 동일하게 순간적 */}>
      <MotionSheetBody onClose={onClose}>{children}</MotionSheetBody>
    </Suspense>
  );
}
```

**dynamic import 경계**: `bottom-sheet.tsx`(공개 API, motion 미포함) /
`bottom-sheet-motion-body.tsx`(실제 `motion.div drag="y" dragConstraints dragElastic
onDragEnd` 구현, motion 패키지를 여기서만 import) 두 파일로 쪼갠다. 사용자가 시트를 **한 번도
열지 않으면 motion 청크가 아예 네트워크에 안 나간다** — "국소 인터랙션만 dynamic import"라는
사용자 결정을 파일 경계로 강제한다. `motion`(공식 후속 패키지명, `framer-motion`이 아님 —
npm registry 확인: 둘 다 최신 13.1.1, `motion`이 현재 공식 이름) 패키지를 신규 devDependency
아닌 dependency로 추가한다.

**소비처 전환은 이 문서 범위 밖**: `matches-page.tsx` 등 기존 5개 파일의 필터 UI를
`<BottomSheet>`로 갈아끼우는 것은 "기존 화면 재사용 여부"를 명시해야 하는 UI 변경(레포
CLAUDE.md "UI 착수 규칙")에 해당할 수 있어, 이 모션 시스템 설계 문서가 임의로 결정하지 않는다.
이 절은 **컴포넌트 자체의 존재와 계약**만 정의한다 — 배선은 후속 작업.

### 4.2 기각 요약 — 나머지 후보들

| 후보 | 판정 | 이유(요약) |
|---|---|---|
| 모달 morph(높이 변형) | 채택 안 함 | 뷰 전환이 있는 다단계 모달 소비처가 현재 식별되지 않음(`confirm-modal.tsx`는 단일 뷰). 필요해지면 그때 재평가 — 지금 만들면 쓰이지 않는 코드다. |
| 토스트 스택 | 채택 안 함 | `admin-toast.tsx`가 이미 CSS만으로 stack 관리 + 비대칭 enter/exit + reduced-motion 분기를 갖췄다. 스와이프 dismiss가 필요해지면 로컬 pointer 핸들러(velocity 불필요 — 단순 threshold 판정) 하나로 충분, motion 전체 도입보다 훨씬 싸다. |
| OTP 분리 박스 입력 | 채택 안 함(CSS 재구현 대상) | `otp-verification-card.tsx`가 현재 단일 input이라 분리 박스로 바꾸면 UX가 개선되지만, 박스 분리·자동 포커스 이동·숫자 입력 시 pop 효과는 state 배열 + `focus()` + CSS keyframe으로 충분 — 공유요소 전환·스프링 물리가 필요 없다. |
| Duration Picker, Switch | 채택 안 함 | 실제 소비 화면(UI)을 이번 조사에서 열어 확인하지 못해 필요성 자체가 불확실. |
| Dock, Dynamic Island, Multi Select, Expandable Tabs, Tooltip, Folder, Action Swap, Morphing Modal, StatefulButton류 | 채택 안 함 | 확실한 소비처 없음(Multi Select) / 기존 디자인 정책과 충돌(Expandable Tabs — 라벨 상시노출 규칙) / 범위 밖(Dynamic Island — 라이브 경기 위젯은 별도 후속) / 모바일 웹뷰엔 hover 개념이 약함(Tooltip). |

**참고 — 기존에 남아있는 결함 하나**: `admin-toast.tsx`의 `left-1/2 -translate-x-1/2`는
390px 뷰포트에서 가용 폭을 50vw로 잘라 찌그러지는 알려진 버그다(사용자 메모리:
`fixed-center-toast-collapses-at-390.md`). 이 문서의 motion 도입 범위와 무관한 기존 결함이라
**손대지 않는다** — 별도 수정 대상으로 남긴다.

### 4.3 초기 번들 영향

`motion` 패키지는 `bottom-sheet-motion-body.tsx` 안에서만 import되고 그 파일은 `lazy()`로
분리돼 있어, **바텀시트를 열지 않는 페이지·세션의 초기 번들에는 포함되지 않는다.** 정확한
gzip 크기는 이번 조사에서 실측하지 못했다(bundlephobia가 JS-SPA라 WebFetch로 확인 불가) —
구현 시 `ANALYZE=true`(이미 `next.config.ts`에 `@next/bundle-analyzer` 연결돼 있다)로 실측할
것.

---

## 5. 구현 순서 · 파일 목록

Wave 1(AppChrome 승격) 완료를 기다려야 하는 항목과, 그전에도 착수 가능한 항목을 분리한다.

### Wave 1과 무관하게 바로 시작 가능

1. `use-navigation-intent.ts` 신규 + `route-progress.tsx` 리팩터(§2.2) — 동작 변경 없는
   순수 추출이라 회귀 위험 최소.
2. `app-back-link.tsx`에 `data-nav-back` 속성 추가(§2.2) — 1줄짜리 두 곳.
3. `admin-skeleton.tsx`에 `AdminBoardListSkeleton` 추가(§3.2.1) — 신규 export, 기존 export
   무변경.
4. `page-skeleton.tsx`에 `console`/`auth`/`form` variant 추가(§3.2.2~3.2.4) — 기존
   `list`/`detail` 분기 무변경.
5. 176개 `loading.tsx` 생성(§3.4) — 스크립트화 권장, 기존 6개는 건드리지 않음(이미
   `list`/`detail`로 올바르게 매핑돼 있음 확인).
6. globals.css에 §2.4/§2.7/§2.8 CSS 추가 — 전부 신규 선택자, 기존 규칙과 충돌 없음.

### Wave 1 완료 후

7. `template.tsx` 신규 배치(§2.9) — `.tm-scroll-area`가 `{children}`을 layout.tsx에서
   렌더하게 된 뒤에야 이 wrapper의 위치가 의도대로 스크롤 영역 안에 들어간다. Wave 1 이전에
   먼저 넣으면(AppChrome이 아직 각 page.tsx 안에 있는 상태) template.tsx의 자식이 AppChrome
   전체가 돼버려 셸까지 매 네비게이션마다 리마운트+애니메이션 대상이 된다 — 지금 하려는
   개선과 정반대 결과.
8. `PageTransitionController` 신규 + layout.tsx 배치(§2.3) — 7과 함께.
9. §2.7의 셸 view-transition-name 배제 CSS 활성 확인 — 7·8 배치 직후 반드시 실기기/실
   WebView에서 셸이 슬라이드에 끌려가지 않는지 시각 검증(CLAUDE.md 규칙 4).

### 이 문서 범위 밖 — 후속 과제로 남김

- 하단탭 pill 슬라이드 CSS 리팩터(§4.1) — `shell.tsx` 수정이 Wave 1과 충돌하므로 그 이후.
- `<BottomSheet>`를 기존 5개 필터 UI 소비처에 배선 — UI 착수 규칙(A·B·C 3안) 대상 여부 판단
  필요.
- board 스켈레톤 중 부가 위젯이 있는 소수 페이지(예: `admin/tournaments`)의 개별 보정.
- console variant의 정확한 픽셀 보정(실측 스크린샷 대조).
- iOS 배포 타깃 버전 확인 후 View Transitions 지원 임계 재확인(§7).

---

## 6. 리스크 요약

- **VT 스냅샷은 top-layer라 `.tm-app-frame`의 `overflow: hidden` 클리핑을 안 받는다.** CSS
  폴백 경로(§2.6)는 24px 이동이라 어차피 프레임 밖으로 안 나가지만, VT 경로(§2.4)의 old
  콘텐츠가 -24% 이동하는 동안 `.tm-app-frame` 경계 밖으로 픽셀이 삐져나와 보일 가능성이
  있다 — 데스크톱 와이드 레이아웃(`.tm-app-frame`이 `min(100%, 480px)`로 화면 중앙에 고정폭
  카드처럼 뜨는 경우, `desktop/_shell.css`)에서 프레임 바깥(빈 여백)에 슬라이드 중인 콘텐츠
  조각이 잠깐 노출될 수 있다. 완화책: `page-content`에도 `overflow: clip` 또는 VT 그룹 자체에
  `clip-path`를 추가로 지정하는 것을 구현 단계에서 검증할 것 — 이 문서는 문제의 존재만
  특정하고 해결책은 실기기 검증 후 확정하도록 남긴다.
- **iOS WKWebView의 View Transitions 지원 버전을 이 조사에서 확인하지 못했다.** `.pbxproj`/
  `Info.plist`가 이 worktree에서 발견되지 않았다(다른 빌드 시스템이거나 저장소에 미포함).
  WebKit은 Safari 18(iOS 18, 2024-09)부터 지원 — 그보다 낮은 배포 타깃을 지원한다면 그
  비중만큼 사용자가 항상 §2.6 CSS 폴백 경로를 탄다(문제는 아니지만, "대부분 VT 경로를
  탈 것"이라는 가정하에 폴백 경로의 품질 검증을 소홀히 하면 안 된다는 뜻).
- **`::view-transition-group` z-index=100이 `--z-top`(90) 체계와 별도 숫자 공간이라는 점을
  명확히 문서화해야 한다.** VT 유사요소는 우리 z-index 사다리와 안 섞이지만, 나중에 다른
  개발자가 "왜 90이 최상단이라면서 100이 있지"라고 오인할 수 있다 — §1.3에서 이유를 남겼지만
  구현 PR에서도 같은 설명을 주석으로 남길 것.
- **board 그룹 30개 전부를 이 문서가 개별 확인하지 못했다.** `admin/matches`(필터+테이블,
  KPI 없음)와 `admin/page.tsx`(KPI 있음) 두 극단만 직접 열어 확인했고, 나머지는 정찰의 경로명
  기반 분류를 신뢰했다 — `AdminBoardListSkeleton` 배치 시 각 페이지가 실제로 KPI 그리드가
  없는지 개별 확인 필요(있는데 빠뜨리면 레이아웃 튐 재발).
- **`useNavigationIntent`의 pop 판정이 브라우저 앞으로가기(forward)도 pop으로 오분류한다**
  (§2.2에 기록) — 실사용 영향 낮다고 판단했지만 검증되지 않은 가정이다.
- **motion 패키지 실제 gzip 크기 미실측** — §4.3에서 명시, 구현 시 `ANALYZE=true` 필수.
- **`tm-page-transition-enter`에 `data-nav-kind`가 없는 최초 진입(딥링크·새로고침)** 은
  의도적으로 애니메이션 없음(§2.4 CSS 주석) — 이건 리스크가 아니라 설계지만, "왜 첫 페이지엔
  전환이 없지"라는 질문이 나올 수 있어 명시해 둔다.

---

## 7. 열린 질문

사용자만 답할 수 있는 항목 — 구현 착수 전 확인 필요.

1. **iOS 배포 최소 버전이 몇인가?** View Transitions API가 WebKit에 Safari 18(iOS 18)부터
   있다 — 그보다 낮은 버전을 지원 대상으로 유지한다면 iOS 사용자 상당수가 상시 CSS
   폴백(§2.6)만 보게 된다. 이 경우 폴백 경로의 완성도를 VT 경로와 동등하게 끌어올리는 데
   더 많은 검증 시간을 배정해야 한다.
2. **브라우저 forward 버튼 오분류(§2.2, §6)를 지금 `history.state` 인덱스 추적으로 보강할
   것인가, 아니면 실사용 데이터가 쌓일 때까지 미룰 것인가?** 지금 보강하면 코드가 조금
   늘어나고, 미루면 드문 케이스에서 "뒤로가기인데 앞으로가기처럼 슬라이드"하는 작은 어색함이
   남는다.
3. **`<BottomSheet>`를 기존 5개 필터 UI(`matches-page.tsx` 등)에 실제로 배선할 것인가?**
   §4.1은 컴포넌트 계약만 정의했다 — 배선은 레이아웃/정보구조 변경에 해당할 수 있어 저장소의
   "UI 착수 규칙"(A·B·C 3안 브레인스토밍) 대상 여부를 먼저 판단해야 한다.
4. **하단탭 pill 슬라이드 CSS 리팩터(§4.1 기각 항목의 대안 스케치)를 Wave 1 이후 별도
   작업으로 진행할 것인가?** 기술적으로는 motion 없이 가능하다고 판단했지만, 이 리팩터
   자체가 `shell.tsx`(Wave 1의 핵심 파일)를 다시 건드리는 일이라 우선순위 조율이 필요하다.
