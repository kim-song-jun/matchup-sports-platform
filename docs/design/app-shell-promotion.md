# 셸 승격 계약 설계 (App Shell Promotion Contract)

> 웨이브 C 中 1단계 "셸 승격" 설계 문서. 앱 셸(AppChrome — 상단바·하단탭바·데스크톱
> 네비·스크롤 컨테이너)을 44개 page/컴포넌트 각각에서 걷어내 `layout` 레벨로 승격시켜,
> 라우트 전환마다 셸이 통째로 리마운트되는 현재 구조(진단 #1)를 없앤다.
>
> 이 문서는 **구현 에이전트가 그대로 따라 만들 수 있는 정도의 구체성**을 목표로 한다 —
> 파일 경로·타입·함수 시그니처·값까지 명시한다. "적절히 처리한다" 식 문장은 없다.
>
> 전제(정찰로 이미 확정, 재검증하지 않음): AppChrome이 44개 page/컴포넌트 각각에서
> 렌더된다(layout.tsx 25개 중 AppChrome 렌더 0개) · loading.tsx 6개 vs page.tsx 182개 ·
> template.tsx/View Transition 0건 · React Query staleTime 30s+refetchOnWindowFocus,
> persist 없음 · 실제 스크롤러는 `.tm-scroll-area`(모바일)/`window`(데스크톱 ≥1024px) ·
> Android WebView 캐시/bfcache 미설정 · 정적 에셋 서비스워커 없음 · next/image 5건, raw
> `<img>` 13건. 이 문서가 다루는 건 이 중 **셸 승격 부분 하나**(다음 웨이브인 전환·스켈레톤,
> 지속성·최적화는 §5에서 인터페이스만 짚고 범위 밖으로 둔다).

## 목차

1. [route-meta 계약](#1-route-meta-계약) — chrome 설정을 어디에 둘 것인가
2. [점진 이행 경로](#2-점진-이행-경로) — 44곳을 한 번에 안 바꾸는 법
3. [셸 지속성 검증법](#3-셸-지속성-검증법) — "리마운트되지 않는다"를 증명하는 테스트
4. [위험 목록과 방어](#4-위험-목록과-방어) — 정찰 risks 전부 + 설계 중 새로 발견한 위험
5. [다음 웨이브에 넘기는 인터페이스](#5-다음-웨이브에-넘기는-인터페이스) — 범위 경계
6. [부록](#6-부록)

---

## 0. 이 설계가 만드는 파일

| 경로 | 상태 | 역할 |
|---|---|---|
| `apps/v1_web/src/lib/route-chrome.ts` | 신규 | 정적 route → chrome 설정 테이블 + 패턴 매처 |
| `apps/v1_web/src/lib/route-chrome.test.ts` | 신규 | 테이블 커버리지/충돌 회귀 테스트 |
| `apps/v1_web/src/components/v1-ui/shell-override.ts` | 신규 | 런타임 override store + `useShellOverride` 훅 |
| `apps/v1_web/src/components/v1-ui/app-shell-frame.tsx` | 신규 | 셸의 유일한 마운트 지점 |
| `apps/v1_web/src/components/v1-ui/app-shell-frame.test.tsx` | 신규 | 셸 지속성 테스트 + 이중 셸 가드 테스트 |
| `apps/v1_web/src/components/v1-ui/shell.tsx` | 수정 | `ShellMountedContext` 가드 추가 (기존 렌더 로직은 그대로) |
| `apps/v1_web/src/app/providers.tsx` | 수정 | `AppShellFrame` 배선 (1줄 교체) |
| `apps/v1_web/src/components/auth/pending-social-signup-gate.tsx` 가 재사용하는 `SessionFallback` (`apps/v1_web/src/components/providers/session-entry-gate.tsx`) | 수정 (§4 R20) | `<main>` → `<div>` — 셸 안에 중첩되는 `<main>` 랜드마크 중복 제거 |
| 59개 파일(약 130개 호출 지점)의 `<AppChrome>` 자체 호출 | 삭제 (웨이브별, §2) | 셸이 layout에서 오므로 각 페이지는 더 이상 직접 렌더하지 않는다 |

---

## 1. route-meta 계약

### 1.1 세 후보 비교

| | (a) 정적 테이블 | (b) Context + `useSetChrome()` | (c) 경로군별 중첩 layout |
|---|---|---|---|
| 동적(fetch) 제목 | ❌ 단독으론 불가 | ✅ 자연스러움 | ❌ 단독으론 불가 |
| 첫 페인트(SSR) 정확도 | ✅ pathname만으로 동기 결정 | ❌ 페이지가 register하기 전엔 빈 셸 | ✅ (layout이 렌더하는 한) |
| 새 라우트 추가 비용 | 파일 2곳 수정(라우트 자체 + 테이블) | 파일 1곳(페이지 안에서 완결) | 파일 2곳+ (라우트 자체 + layout 배치) |
| 교차 라우트 오염 위험 | 매처 버그로 오매칭 가능 | 훅 호출 누락 시 **이전 페이지 값이 새어 보임** | 없음(Next 자체 라우팅이 경계) |
| 이 저장소에 실제로 적용 가능한가 | ✅ | ✅ | ⚠️ 대규모 폴더 이동 필요(§1.4) |
| 44곳 분기 불일치(desktopHead 등) 정리 효과 | ✅ 라우트당 값 1개로 강제 | ❌ 여전히 페이지마다 다르게 부를 수 있음 | ❌ 동일 |

세 안 모두 "단점 없음"은 없다 — 아래에서 각각을 있는 그대로 적는다.

**(a) 정적 테이블 (`route-chrome.ts`).**
- 장점: pathname만으로 셸 마운트 시점에 동기적으로 결정되므로 **SSR 첫 페인트부터 올바른
  제목/탭이 나온다**(useEffect를 기다릴 필요 없음 — §1.10). 라우트당 값이 정확히 1개이므로
  `desktopHead` 같은 boolean이 loading/error/success 분기마다 다르게 새는 사고(§4 R3, 실측
  4건)가 **테이블 구조상 불가능**해진다. 커버리지 테스트(§3.5)로 드리프트를 CI에서 잡을 수 있다.
- 단점(진짜): 런타임 데이터(fetch된 제목, FAB) 는 이 테이블 혼자로는 절대 표현할 수 없다 —
  아래 (b)와의 결합이 필수다. 자체 패턴 매처를 새로 만들어야 하고, 매처 버그는 라우트를
  잘못 매칭시키는 **새로운 버그 종류**를 만든다(오늘은 각 페이지가 자기 props를 직접 하드코딩해서
  이런 교차 오염이 원천적으로 불가능했다). 130여 항목짜리 파일 하나는 동시에 여러 라우트를
  건드리는 PR들의 git 충돌 지점이 된다(이 저장소는 공유 워크트리 다중 세션 환경 — 사용자
  전역 지침).

**(b) React Context + `useSetChrome()`.**
- 장점: 데이터가 이미 컴포넌트 스코프에 있으므로(`data.title`) 정적/동적을 가리지 않고
  **하나의 메커니즘**으로 처리된다. 페이지당 수정 지점이 1곳(테이블처럼 별도 파일을 안 건드림).
  중앙 파일이 없어 PR 충돌 표면도 없다.
- 단점(진짜, 정찰이 정확히 짚은 지점): 페이지의 커밋 단계 `useEffect`에서 register하면, 그
  effect가 실행되기 전 프레임(들)은 **직전 라우트의 chrome 값이 그대로 남아 보인다** —
  "헤더 텍스트 깜빡임"이 정찰이 지적한 바로 그 현상이다. 페이지가 register를 깜빡하면(신규
  페이지 실수, 조건부 분기 누락) 셸은 **이전 라우트의 값을 계속 보여준다** — (a)의 "빈
  기본값"보다 나쁜 실패 모드다(틀린 정보를 적극적으로 보여줌). 느리게 응답하는 이전
  페이지의 지연된 register가 새 라우트로 넘어간 뒤 도착해 새 페이지 값을 덮어쓰는 경쟁도
  막아야 한다(§1.8에서 이 경쟁을 없애는 설계를 한다 — 하지만 순수 Context+useEffect로는
  이 경쟁 자체가 구조적으로 존재한다).

**(c) 경로군별 중첩 layout, 각 layout이 AppChrome을 렌더.**
- 장점: Next.js가 layout 지속을 **프레임워크 차원에서 보장**한다 — 커스텀 마운트-포인트
  로직이나 패턴 매처가 전혀 필요 없다. 물리적 폴더 스코프라 오매칭 자체가 불가능하다.
- 단점(진짜, 그리고 **이게 이 저장소에서 (c)를 탈락시키는 결정적 이유**, §1.4): AppChrome을
  쓰는 13개 최상위 세그먼트(home/matches/team-matches/teams/tournaments/league-matches/
  events/users/my/search/chat/notifications/notices)는 **공통 상위 디렉터리가 없다**
  (모두 `src/app/` 바로 아래 형제). Next.js가 layout을 공유시키려면 이 13개를 실제 폴더로
  묶어야 하는데(route group `(shell)/` 등), **형제 layout 경계를 넘는 순간(`/home` →
  `/matches` 같은 하단 탭 전환) 여전히 리마운트된다** — 정확히 지금 고치려는 버그가
  탭 전환의 대다수에서 재발한다. 폴더를 하나로 합치면(진짜 단일 layout) 되지만 그러면 13개
  최상위 디렉터리를 통째로 이동해야 하고(내용 무변화라도 경로가 바뀌는 파일이 130개+,
  이 저장소 자체 관행상 300개 파일 한도에 근접·PR 리뷰 리스크 큼), 그마저도 동적 제목은
  여전히 못 풀어서 (b)를 **추가로** 얹어야 한다 — 즉 (c)는 (b)가 필요로 하는 걸 줄여주지
  못하면서 비용만 더 크다.

### 1.2 결정: (a) + (b) 하이브리드, 단일 마운트 지점, (c)는 채택하지 않는다

**정적으로 알 수 있는 값(라우트 자체 또는 라우트 파라미터로 정해지는 값)은 테이블에,
런타임에만 알 수 있는 값(fetch 데이터·React 상태)은 override 훅에** 둔다. 이 경계는
정찰이 이미 실측으로 나눠 놓았다 — [static] 그룹(≈90%)은 테이블, [dynamic-title]/
[dynamic-heavy] 그룹(≈10곳)은 override.

마운트 지점은 **13개 세그먼트 중 어디에도 속하지 않는, 트리 최상단에 하나만** 둔다 —
`app/layout.tsx`가 아니라 그 안의 `Providers`(`apps/v1_web/src/app/providers.tsx`) 내부다.
이유: `AppChrome`이 내부에서 렌더하는 `NotificationBellLink`가 React Query 훅
(`useV1NotificationUnreadSummary`)을 호출하고(`shell.tsx:130`, `notification-bell.tsx`),
다크모드 CSS 변수는 `ThemeProvider`가 공급한다 — 둘 다 `Providers` 내부에서만 유효하므로
그 안에 넣는 게 자연스럽다. `app/layout.tsx` 자체는 건드리지 않는다.

```diff
// apps/v1_web/src/app/providers.tsx
+ import { AppShellFrame } from '@/components/v1-ui/app-shell-frame';

  <PendingSocialSignupGate>
-   {children}
+   <AppShellFrame>{children}</AppShellFrame>
    <GlobalPopup />
    <PhoneVerificationRequiredModal />
  </PendingSocialSignupGate>
```

`PendingSocialSignupGate`는 온보딩/약관 재동의가 필요하면 `{children}` 슬롯 전체를
`<SessionFallback/>`으로 **바꿔치기**한다(`pending-social-signup-gate.tsx:64-67`) — 이 교체가
`AppShellFrame`보다 **위에서** 일어나므로(내가 전달하는 children 자체가 통째로 안 쓰이는
경우), `AppShellFrame`/`AppChrome`는 그 경우 아예 렌더되지 않는다. 이건 오늘과 동일한
동작이라 회귀가 아니다. 반대로 `RequireAuth`(my/notifications/chat/onboarding
`layout.tsx`)는 `AppShellFrame`보다 **아래**(Next 라우트 트리 안)에 있어서 그 fallback은
새로 AppChrome 안에 중첩된다 — 이건 실제 부작용이라 §4 R20에서 별도로 다룬다.

### 1.3 왜 정적 필드와 override 필드를 나누는가 — 타입 설계

```ts
// apps/v1_web/src/lib/route-chrome.ts 발췌
export type RouteParams = Record<string, string>;

/** pathname만으로(또는 라우트 파라미터로) 결정되는, fetch 없이 아는 값. */
export type RouteChromeConfig = {
  title: string;                              // ReactNode 아님 — 동적 제목은 override로 (§1.6)
  activeTab?: import('@/components/v1-ui/shell').V1NavTab;
  backHref?: string | ((params: RouteParams) => string);  // 라우트 파라미터 조합 허용
  showSearch?: boolean;
  showNotifications?: boolean;
  bottomNav?: boolean;
  topBar?: boolean;
  desktopHead?: boolean;                      // 기본값 = "제너릭 desktop head 사용" (§4 R3)
  centerTitle?: boolean;
  titleAsHeading?: boolean;
};
```

```ts
// apps/v1_web/src/components/v1-ui/shell-override.ts 발췌
/** 렌더 시점에만 정해지는 값. 테이블의 title/desktopHead를 있으면 덮어쓴다. */
export type ShellOverride = {
  title?: ReactNode;
  floatingSlot?: ReactNode;
  topbarActions?: ReactNode;
  hasNewNotification?: boolean;
  desktopHead?: boolean;
};
```

`title`을 테이블에서는 `string`으로, override에서는 `ReactNode`로 다르게 잡은 것은 의도적이다.
정적 테이블에 `ReactNode`를 허용하면 JSX 리터럴을 안전하게 직렬화/비교할 수 없어 §3.5
커버리지 테스트가 무의미해진다 — 진짜 `ReactNode`가 필요한 라우트(딱 1곳,
`NotificationsPageView`의 안읽음 카운트 뱃지, §1.6 표 참고)는 override로 보낸다.

`backHref`가 함수 형태를 허용하는 이유: 정찰이 확인한 90%의 "정적" 그룹 중 상당수는 문자열
자체는 고정이 아니라 `` `/matches/${matchId}` `` 처럼 **라우트 파라미터를 조합**한다
(예: `matches/[id]/applications/client.tsx:50` `backHref={\`/matches/${matchId}\`}`). 이건
fetch가 필요 없는 값이므로 override로 보낼 이유가 없다 — 매처가 돌려주는 `params`를 받아
문자열을 만드는 함수로 테이블에 그대로 넣는다. `title`에는 이 패턴이 관찰되지 않았다(정찰
전체에서 라우트 파라미터를 보간하는 제목은 0건 — 제목은 항상 완전 고정이거나 완전
fetch-의존이다) 그래서 `title`은 함수형을 지원하지 않는다(불필요한 표현력은 매처 설계를
복잡하게 만들 뿐이다).

### 1.4 패턴 매처

```ts
// apps/v1_web/src/lib/route-chrome.ts 발췌
type RouteChromeEntry = { pattern: string; chrome: RouteChromeConfig };

function matchPattern(pattern: string, pathname: string): RouteParams | null {
  const patternSegs = pattern.split('/').filter(Boolean);
  const pathSegs = pathname.split('/').filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return null; // 세그먼트 수가 다르면 절대 매치 안 함
  const params: RouteParams = {};
  for (let i = 0; i < patternSegs.length; i += 1) {
    const p = patternSegs[i];
    const s = pathSegs[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(s);
    } else if (p !== s) {
      return null;
    }
  }
  return params;
}

function literalSegmentCount(pattern: string): number {
  return pattern.split('/').filter((seg) => seg && !seg.startsWith(':')).length;
}

/**
 * 여러 엔트리가 동시에 매치되면(테이블 작성 실수로 우연히 겹친 경우) literal 세그먼트가
 * 더 많은 쪽이 이긴다 — Next 자신의 라우팅 우선순위(정적 세그먼트가 동적 세그먼트를
 * 이긴다)와 같은 규칙이다. 이 저장소의 실제 라우트는 파일 트리로 이미 유일하게
 * 귀결되므로(같은 URL에 두 page.tsx가 동시에 매치되는 경우가 Next 자체에 없다) 정상
 * 작성이라면 이 정렬이 실제로 순위를 뒤집을 일은 없어야 한다 — 실수로 겹친 엔트리를
 * 조용히 잘못된 쪽이 이기게 두지 않기 위한 방어다.
 */
export function resolveRouteChrome(
  pathname: string,
): { chrome: RouteChromeConfig; params: RouteParams } | null {
  const candidates = ROUTE_CHROME_TABLE
    .map((entry) => ({ entry, params: matchPattern(entry.pattern, pathname) }))
    .filter((c): c is { entry: RouteChromeEntry; params: RouteParams } => c.params !== null)
    .sort((x, y) => literalSegmentCount(y.entry.pattern) - literalSegmentCount(x.entry.pattern));
  const best = candidates[0];
  return best ? { chrome: best.entry.chrome, params: best.params } : null;
}
```

테이블에 없는 pathname은 `null`을 반환한다 — 이게 `/admin/*`, `/auth/*`, `/login`,
`/signup`, `/callback`, `/onboarding`, `/terms`, `/account-deletion`, `/landing`,
`/admin-content-preview`를 위한 별도 "제외 목록"이 필요 없는 이유다(직접 확인:
`grep -rl AppChrome apps/v1_web/src/app/{admin,auth,login,signup,callback,landing,
account-deletion,terms,admin-content-preview}` → 전부 0건 — 이 세그먼트들은 원래도
AppChrome을 쓴 적이 없다). "테이블에 없다 = 원래도 셸이 없던 라우트" 라는 등식이 그대로
성립하므로, 이 세그먼트들을 위해 매처에 예외 로직을 추가할 필요가 없다.

### 1.5 테이블 조직

130여 항목을 파일 하나에 넣되, 정찰의 세그먼트 분류(shell-inventory의 "by top segment"
그룹)를 그대로 섹션으로 삼는다 — 정찰과 테이블이 같은 축으로 나뉘어 있어야 "이 라우트
찾기"가 정찰 문서와 코드 양쪽에서 동일한 순서로 된다.

```ts
const HOME_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const MATCHES_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const TEAM_MATCHES_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const TEAMS_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const TOURNAMENTS_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const LEAGUE_MATCHES_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const MY_ROUTES: RouteChromeEntry[] = [ /* ... */ ];
const COMMUNITY_ROUTES: RouteChromeEntry[] = [ /* ... */ ]; // /chat, /notifications
const MISC_ROUTES: RouteChromeEntry[] = [ /* ... */ ];      // /events, /users, /search, /notices, /not-found

const ROUTE_CHROME_TABLE: RouteChromeEntry[] = [
  ...HOME_ROUTES, ...MATCHES_ROUTES, ...TEAM_MATCHES_ROUTES, ...TEAMS_ROUTES,
  ...TOURNAMENTS_ROUTES, ...LEAGUE_MATCHES_ROUTES, ...MY_ROUTES,
  ...COMMUNITY_ROUTES, ...MISC_ROUTES,
];
```

이 구조가 감당 못 할 만큼 자라면(체감상 400줄 이상) `route-chrome/home.ts` 식으로 세그먼트당
파일을 쪼개고 `route-chrome/index.ts`가 합치는 걸로 넘어간다 — 지금은 섹션 나눔만으로 충분하다
(추정 총 항목 수 ≈130, 항목당 1~4줄 ⇒ 250~350줄대).

### 1.6 런타임 override — `useSyncExternalStore`를 쓰는 이유 (Context+useEffect가 아니라)

처음 시도한 설계는 Context 였다: 각 페이지가 `useEffect(() => setOverride(값), [])`로
"등록"한다. **이건 무한 루프가 된다** — 실제로 렌더 순서를 끝까지 추적해서 확인했다:

1. `AppShellFrame`이 `<AppChrome>{children}</AppChrome>`을 렌더한다(`children` = 페이지).
2. 페이지의 `useEffect`(의존성 배열 없음, "매 렌더 후 실행")가 커밋 후 실행되어
   `setOverride(새 객체)`를 부른다.
3. Context 값이 바뀌었으니 그 값을 구독하는 `AppChrome`(또는 그 조상)이 리렌더된다.
4. **그 리렌더는 `children`(페이지)도 다시 렌더한다** — 페이지는 `AppChrome`의 자식이므로
   조상이 리렌더되면 기본적으로 같이 리렌더된다.
5. 페이지가 다시 렌더되면 그 `useEffect`가 **또 실행된다**(의존성 배열이 없으므로) →
   2번으로 돌아간다. 종료 조건이 없다.

`useSyncExternalStore` + **렌더 단계에서 직접 store를 쓰는** 방식은 이 루프를 구조적으로
끊는다:

```ts
// apps/v1_web/src/components/v1-ui/shell-override.ts
'use client';
import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type ShellOverride = {
  title?: ReactNode;
  floatingSlot?: ReactNode;
  topbarActions?: ReactNode;
  hasNewNotification?: boolean;
  desktopHead?: boolean;
};

type Snapshot = { pathname: string; override: ShellOverride };
const EMPTY: Snapshot = { pathname: '', override: {} };

let current: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function setOverride(next: Snapshot) {
  current = next;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() { return current; }
// 서버는 요청마다 다른 값을 볼 수 없다 — 모듈 스코프 store는 같은 Node 프로세스가 처리하는
// 여러 동시 요청이 공유하므로, 여기서 실제 override를 읽으면 사용자 A의 대회명이 사용자
// B의 SSR HTML에 새는 교차 요청 오염이 생긴다. 그래서 SSR은 항상 빈 스냅숏만 보고 테이블의
// title이 첫 페인트에 쓰인다 — 이 라우트들의 실제 fetch는 오늘도 클라이언트 전용(React
// Query)이므로 승격 전/후 SSR 결과는 동일하다(회귀 아님, §1.10).
function getServerSnapshot() { return EMPTY; }

/**
 * 셸에 런타임 값을 밀어넣는다. **반드시 렌더 함수 본문에서 직접 호출한다(useEffect 아님).**
 * 렌더 단계에서 store.set을 부르면: AppChrome(조상)이 재구독으로 다시 렌더 → 그때
 * `children`(페이지) prop은 AppShellFrame이 만든 그 엘리먼트 그대로(참조 동일)이므로
 * React가 그 아래를 다시 렌더하지 않고 멈춘다(Dan Abramov, "Before You memo()") — 정확히
 * 1번 더 렌더되고 종료. useEffect 버전과 달리 페이지 자신의 렌더 함수가 다시 불릴 일이
 * 없으므로 루프가 성립하지 않는다.
 */
export function useShellOverride(override: ShellOverride): void {
  const pathname = usePathname();
  // typeof window 가드: 이 저장소 기존 관례(pending-social-signup-gate.tsx)와 동일 패턴.
  // 서버에서 부르면 위 getServerSnapshot 주석과 같은 교차 요청 오염이 생기므로 클라이언트
  // 커밋 이후에만 store를 쓴다.
  if (typeof window !== 'undefined') {
    setOverride({ pathname, override });
  }
}

/** AppShellFrame 전용 판독. pathname이 안 맞으면(=다른 라우트가 남긴 값) 빈 override로
 *  취급한다 — 별도 "리셋" effect 없이 라우트 전환 순간 자동으로 정리되는 이유(§1.7). */
export function useShellOverrideForRoute(pathname: string): ShellOverride {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot.pathname === pathname ? snapshot.override : {};
}
```

### 1.7 "리셋"이 따로 필요 없는 이유 — pathname을 값의 일부로 저장한다

Context 버전에서 두 번째로 막힐 뻔한 지점: A 라우트가 override를 남기고 B 라우트로
전환했는데 B가 override를 안 쓰면, store엔 A의 값이 그대로 남는다 — "B로 갈 때 리셋"을
`AppShellFrame`의 `useEffect(() => reset(), [pathname])`로 하면 될 것 같지만, 커밋 순서를
추적하면 **역효과**가 난다: 같은 커밋에서 B 페이지가 렌더 단계에 override를 이미
정확히 밀어넣었는데(§1.6), 그 다음 effect 단계에서 `AppShellFrame`의 리셋 effect가
그 값을 **바로 지워버린다**(effect는 항상 render보다 늦게 실행되므로).

그래서 리셋을 effect로 하지 않고, **override 값 자체에 그 값을 만든 시점의 pathname을
같이 저장**한다(`Snapshot.pathname`). 판독 시(`useShellOverrideForRoute`) "저장된
pathname === 지금 pathname"일 때만 override를 인정한다. B로 넘어간 순간 store엔 아직
A의 `{pathname:'/home', ...}`가 남아있어도, B를 렌더하는 `AppShellFrame`은 `pathname`이
`/matches`이므로 비교가 즉시 거짓이 되어 빈 override로 취급한다 — B 페이지가 나중에
자기 override를 밀어넣으면 그때 store가 `{pathname:'/matches', ...}`로 갱신되고
비교가 참이 된다. 리셋 로직이 아예 없어도 매 라우트가 "자기 값이 없으면 빈 값"으로
정확히 동작한다.

### 1.8 마운트 지점 — `AppShellFrame`

```tsx
// apps/v1_web/src/components/v1-ui/app-shell-frame.tsx
'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppChrome } from './shell';
import { resolveRouteChrome } from '@/lib/route-chrome';
import { useShellOverrideForRoute } from './shell-override';

/**
 * 셸의 유일한 마운트 지점. providers.tsx에서 {children} 자리에 끼운다 — 페이지 트리 전체의
 * 조상이므로 pathname이 바뀌어도(라우트 전환) 이 컴포넌트 자신은 리마운트되지 않고, 그
 * 아래 AppChrome도 함께 살아남는다(진단 #1의 정반대). route-chrome.ts에 없는 경로는
 * children을 그대로 통과시킨다 — §1.4 참고, 그 경로들은 원래도 AppChrome이 없었다.
 */
export function AppShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const resolved = resolveRouteChrome(pathname);
  // Hooks 규칙: 조건부 return보다 위에서 항상 호출한다.
  const override = useShellOverrideForRoute(pathname);

  if (!resolved) return <>{children}</>;

  const { chrome, params } = resolved;
  return (
    <AppChrome
      title={override.title ?? chrome.title}
      activeTab={chrome.activeTab}
      backHref={typeof chrome.backHref === 'function' ? chrome.backHref(params) : chrome.backHref}
      showSearch={chrome.showSearch}
      showNotifications={chrome.showNotifications}
      bottomNav={chrome.bottomNav}
      topBar={chrome.topBar}
      desktopHead={override.desktopHead ?? chrome.desktopHead}
      centerTitle={chrome.centerTitle}
      titleAsHeading={chrome.titleAsHeading}
      floatingSlot={override.floatingSlot}
      topbarActions={override.topbarActions}
      hasNewNotification={override.hasNewNotification ?? false}
    >
      {children}
    </AppChrome>
  );
}
```

### 1.9 동적 제목 4개 하위유형 — 실제로 어떻게 처리되는지 전부 답한다

정찰이 dynamic-title/dynamic-heavy로 묶은 것들이 실제로는 서로 다른 이유로 동적이다.
직접 파일을 열어 4가지로 나눴고, **넷 다 같은 override 메커니즘 하나로 풀린다**(새 개념
추가 없음) — 다만 "왜 동적인지"가 달라서 표로 구분해 둔다.

| 하위유형 | 왜 정적 테이블로 안 되는가 | 처리 | 실측 근거(file:line) |
|---|---|---|---|
| fetch된 제목 | 데이터가 서버 응답 이후에만 존재 | `useShellOverride({ title: data.title })`를 success 분기에서만 호출 | `tournament-detail-client.tsx:537` `title={data.title}`, `community-page.tsx:109` `title={model.title}`(채팅방 이름) |
| 결합 제목("OO 경기 일정") | 접두어가 fetch 데이터, 접미어는 고정 문구 | 동일 — 조합은 페이지 쪽 책임, override는 최종 문자열만 받음 | `schedule-page-client.tsx:59` `` combined.tournamentTitle ? `${combined.tournamentTitle} 경기 일정` : '경기 일정' `` |
| `ReactNode` 제목(뱃지 포함) | 문자열이 아니라 JSX(안읽음 카운트) | `ShellOverride.title`이 처음부터 `ReactNode` 타입이라 그대로 통과 | `community-page.tsx:253-257` `title={<span>알림 <span className="tm-notification-count...">{model.unreadCount}</span></span>}` |
| 커스텀 데스크톱 헤더로 대체(제목이 아니라 `desktopHead` 자체가 동적) | success 분기가 액션 버튼이 딸린 **자체** `tm-desktop-page-head`를 그려서, 제너릭 desktopHead를 꺼야 함(둘 다 켜지면 중복 렌더) | 테이블엔 `desktopHead:true`(로딩/에러 분기와 동일한 안전한 기본값), success 분기가 `useShellOverride({ desktopHead:false, ... })`로 끔 | `team-schedules-page.tsx:224,232`(desktopHead 있음) vs `:241`(없음, 대신 `:243-246`에서 직접 `tm-desktop-page-head` 렌더) — 동일 패턴이 `my-api-clients.tsx:399,407`(있음) vs `:613`(없음, `:614`에서 직접 렌더), `my-api-clients.tsx:1396,1406,1417`(있음) vs `:1479`(없음, 직접 렌더), `tournament-detail-client.tsx:515,524`(있음) vs `:537`(없음, 자식 `TournamentDetailView`가 `:1321`에서 직접 렌더)에서 **4/4 전부 동일하게** 확인됨(§4 R3, 정찰의 "불일치"를 재분류) |

floatingSlot(FAB/CTA, 6곳)과 `topbarActions`(알림 화면의 "모두 읽기" 버튼)도 정확히 같은
경로로 처리된다 — `useShellOverride({ floatingSlot: <MatchCreateFloatingButton/> })`.
새 슬롯 개념이 필요 없다: `ShellOverride`가 이미 그 필드를 갖고 있다(§1.3).

**공유 에러 뷰(`MatchStatePageView`/`TeamStatePageView`)에 대한 특별 규칙은 필요 없다.**
정찰은 이게 여러 물리적 라우트에서 재사용되는 컴포넌트라 테이블의 "라우트당 1개" 모델과
안 맞을까 걱정했지만, 확인해 보면 `title={model.title}`이 애초에 **에러 코드에 따라
달라지는 런타임 값**이다(`matches-page.tsx:165` — "정적 매핑 함수 값"이라도 그 함수의
입력은 런타임 에러 상태) — 그러니 원래도 override 대상이다. 테이블은 그 라우트의 **로딩
중 기본값**만 대면 되고(예: `/matches/:id` 테이블 행 = `title:'매치'`), `MatchStatePageView`가
렌더되는 순간 자기 `model.title`을 override로 밀어넣는다. "여러 라우트에서 재사용"이라는
사실 자체는 override 메커니즘에 아무 영향이 없다 — override는 **pathname 기준**으로
동작하지, "어느 컴포넌트가 렌더했는지"는 상관하지 않는다.

### 1.10 SSR 이점 (부가 확인)

`Providers`가 이미 `'use client'` 경계이므로 `AppShellFrame`도 서버에서 최초 1회 렌더된다
(Client Component라도 App Router는 첫 HTML을 서버에서 만든다). 이때 `usePathname()`은
요청 URL로 정확히 결정되므로, **정적 테이블 값은 최초 서버 렌더 HTML부터 이미 맞다** —
클라이언트 hydration 이후 `useEffect`를 기다릴 필요가 없다. 이게 옵션 (b) 단독안이
갖지 못하는 성질이다(순수 Context 모델은 첫 서버 페인트에 아무도 아직 register하지
않았으므로 빈/기본 셸만 나온다). 동적 제목(override)은 여전히 클라이언트 전용으로
남는다(§1.6 `getServerSnapshot` 주석) — 이건 **오늘과 동일한 동작**이다: 이 앱의 데이터
페칭은 전부 React Query 클라이언트 훅이라, 오늘도 신규 방문(하드 로드)에서 대회명 같은
동적 제목은 클라이언트 hydration 이후에만 나타난다. 승격 전/후 차이가 없으므로 회귀가
아니다.

---

## 2. 점진 이행 경로

44곳(≈59개 파일, ≈130개 호출 지점)을 한 커밋에서 바꾸면 회귀가 나도 어느 라우트 때문인지
찾기 어렵고, 리뷰도 사실상 불가능하다. 아래는 **왜 라우트 단위로 쪼개도 안전한지**를
먼저 증명하고, 그다음 순서(웨이브)와 커밋 규율을 정한다.

### 2.1 핵심 불변식 — "테이블에 없는 라우트는 100% 무영향"

`AppShellFrame`은 `resolveRouteChrome(pathname)`이 `null`이면 `children`을 그대로
통과시킨다(§1.4/§1.8). 즉:

- **테이블에 아직 행이 없는 라우트**는 `AppShellFrame`이 렌더에 전혀 관여하지 않는다 —
  그 페이지가 지금처럼 자기 `<AppChrome>`을 직접 렌더하면 그게 그대로 화면에 나간다.
  오늘과 픽셀 단위로 동일하다.
- **한 라우트에 행을 추가하는 것은 그 라우트만 건드린다.** 매처가 세그먼트 수를 정확히
  맞춰야 매치되므로(§1.4), `/matches` 행 추가가 `/matches/new`나 `/matches/[id]`에
  우연히 걸릴 수 없다(세그먼트 수부터 다르다).
- 그러므로 **행을 하나씩, 원하는 순서로, 리뷰 가능한 크기로** 추가할 수 있다. 잘못된 값을
  하나 넣어도 blast radius는 그 라우트 하나다(§2.5 롤백).

### 2.2 이중 셸 가드 — 테이블 등록과 페이지 정리 사이의 과도기를 안전하게

라우트 하나를 옮기는 "정상 절차"는 **테이블에 행 추가**와 **그 페이지 자신의
`<AppChrome>` 호출 제거**를 **같은 커밋**에서 함께 한다(§2.4). 하지만 실수로 순서가
어긋나거나(행만 추가하고 페이지 정리를 깜빡함), 리뷰 중 일부만 반영되는 등의 상황을
대비해 `AppChrome` 자신에 안전망을 심는다:

```diff
// apps/v1_web/src/components/v1-ui/shell.tsx
+ import { createContext, useContext } from 'react';
+
+ /**
+  * 상위(AppShellFrame)가 이미 AppChrome을 렌더했음을 하위의 또 다른 AppChrome 호출이
+  * 감지하는 신호. 마이그레이션 도중 아직 자체 <AppChrome> 래퍼를 못 걷어낸 페이지가
+  * 섞여 있어도 topbar/bottomnav가 두 번 그려지지 않게 하는 안전망이다. **정상 절차라면
+  * 이 분기가 실행될 일이 없다** — 테이블 등록과 페이지 자체 AppChrome 제거를 같은
+  * 커밋에서 하기 때문. 이 분기가 실행 중이라는 건 그 규율이 깨졌다는 신호이므로 오래
+  * 방치하면 안 된다 — 안쪽 호출에만 있던 floatingSlot/동적 title 같은 props는 여기서
+  * 조용히 버려진다(§4 R21).
+  */
+ export const ShellMountedContext = createContext(false);
+
  export function AppChrome(props: AppChromeProps) {
+   const alreadyMounted = useContext(ShellMountedContext);
+   if (alreadyMounted) {
+     return <>{props.children}</>;
+   }
+   return (
+     <ShellMountedContext.Provider value={true}>
+       <AppChromeInner {...props} />
+     </ShellMountedContext.Provider>
+   );
+ }
+
+ function AppChromeInner({
    title,
    children,
    floatingSlot,
    activeTab,
    showSearch = false,
    showNotifications = true,
    hasNewNotification = false,
    topbarActions,
    bottomNav = true,
    topBar = true,
    desktopHead = false,
    backHref,
    centerTitle = false,
    titleAsHeading = false,
  }: AppChromeProps) {
    // ... 기존 shell.tsx:87-155 로직 100% 그대로 (변경 없음)
  }
```

이 변경은 **셸 승격 이전에, 단독으로 먼저 머지**할 수 있다 — 오늘은 어떤 `AppChrome`도
다른 `AppChrome`의 하위에서 렌더되지 않으므로(`AppShellFrame`이 아직 없으므로)
`alreadyMounted`는 항상 `false`고 동작은 100% 동일하다. 즉 이 가드 자체가 **0-위험
사전 준비 커밋**이다.

### 2.3 웨이브 순서 — "셸 승격" 내부의 하위 웨이브 (전체 3웨이브 중 1웨이브의 세부)

| 하위웨이브 | 범위 | 이유 |
|---|---|---|
| **0** | `ShellMountedContext` 가드 (§2.2) 단독 커밋 | 0-위험 준비, 나머지 전부의 안전망 |
| **1a** | [static] 그룹 전체 (≈45~50개 호출 지점) | fetch·override 의존 없음 — 가장 안전. 테이블 행 추가 + 페이지 AppChrome 제거만 |
| **1b** | [dynamic-heavy] floatingSlot 6곳: `home-page.tsx`, `matches-page.tsx`(List), `team-matches-page.tsx`(List), `teams-page.tsx`(List), `team-schedules-page.tsx`(List), `community-page.tsx`(Notifications — ReactNode title도 겸함) | override 메커니즘을 처음 실전 투입 — floatingSlot이 사라지면(FAB 안 보임) 눈에 바로 띄어서 회귀를 빨리 잡는다 |
| **1c** | [dynamic-title] 10곳 + desktopHead-분기차 4곳(§1.9 표) | fetch 성공 이후에만 override가 뜨는 케이스 — 1b로 override 배관이 검증된 뒤 진행 |
| **1d** | 나머지: `MatchStatePageView`/`TeamStatePageView`(공유 에러뷰, §1.9 결론대로 override로 처리) · `/my` 루트(`MyHomePageView`, 아래 §2.3.1에서 소비 라우트 확정) · `RequireAuth` 4개 세그먼트(my/notifications/chat/onboarding) + `SessionFallback` `<main>`→`<div>` 수정(§4 R20)을 **같은 커밋**으로 | 정찰이 미결로 남긴 것들 + 부작용 있는 항목을 마지막에 몰아서, 앞 웨이브가 먼저 메커니즘을 검증하게 함 |

**#2.3.1 확정: `/my` 루트는 `MyHomePageView`를 쓴다.** 정찰이 미결로 남겼던 걸 직접 추적함
— `app/my/page.tsx:1-5`가 `MyHomePageClient`(`my-api-clients.tsx:160` `return
<MyHomePageView model={model} />`)를 렌더한다. 1d에서 이 파일을 테이블에 등록할 때
헷갈릴 요소가 없다.

각 하위웨이브는 **여러 라우트를 한 PR에 묶어도** 되지만(같은 성격이라 리뷰 부담이
비슷하다), **파일 하나(예: `matches-page.tsx`)에 여러 View가 있으면 그 파일 안의 모든
View를 같은 PR에서 끝낸다** — 파일을 열어 일부만 고치고 나머지를 남기면 그 파일 자체가
"이중 셸 가드가 상시 발동 중인 상태"로 방치되기 쉽다.

### 2.4 커밋 단위 규율

라우트 하나를 옮길 때 **한 커밋 안에서**:
1. `route-chrome.ts`에 해당 세그먼트 배열에 행 추가(또는 동적 그룹이면 override 필드까지
   포함해 어떤 필드가 override로 가는지 결정).
2. 그 라우트를 렌더하는 페이지/컴포넌트에서 `<AppChrome ...>{content}</AppChrome>`을
   `{content}`로 축소(동적 필드가 있으면 `useShellOverride({...})` 호출을 렌더 최상단
   근처에 추가).
3. (해당하면) §3.5 커버리지 테스트에 그 pathname 샘플 추가.

부분 적용 상태(1번만 하고 2번을 다음 커밋으로 미루는 것)로 커밋하지 않는다 — §2.2 가드가
있어서 화면이 깨지진 않지만, override가 아직 없는 동적 라우트라면 §2.2가 경고하는 대로
그 라우트는 **잘못된(테이블의 fallback) 제목을 보여주는 채로 방치**된다.

### 2.5 롤백 스토리

라우트 하나가 승격 후 문제를 일으키면: `route-chrome.ts`에서 그 행을 삭제하고, 페이지의
`<AppChrome>` 호출을 되살린다(git revert 한 커밋으로 충분 — §2.4가 원자 커밋을 강제한
이유). §2.1의 불변식 덕분에 이 되돌리기는 **그 라우트 하나만** 영향받는다 — 다른 라우트의
테이블 행이나 override 호출은 무관하다. 전역 배선(`providers.tsx`의 `AppShellFrame`
자체, `ShellMountedContext` 가드)은 손댈 필요가 없다.

---

## 3. 셸 지속성 검증법

### 3.1 기법 선택 — DOM 노드 참조 동일성, effect 카운터가 아니라

과제가 예시로 든 기법은 "BottomNav에 `useEffect` 카운터를 붙여 라우트 전환 후에도
1회인지"다. 이것도 유효하지만, **DOM 노드 참조 동일성**을 대신 쓴다 — 이유:

1. **프로덕션 코드를 전혀 건드리지 않는다.** effect 카운터는 테스트를 위해 `shell.tsx`에
   테스트 전용 계측을 영구히 심어야 한다. DOM 참조 비교는 `@testing-library/react`가
   돌려주는 실제 엘리먼트 객체를 그대로 쓴다.
2. **"리마운트"의 정의 그 자체다.** React가 컴포넌트를 리마운트하면 그 DOM 노드는
   반드시 새로 만들어진다(내용이 바이트 단위로 같아 보여도 객체 참조는 다르다) — 이건
   React의 재조정 알고리즘의 근본 성질이라 우회할 수 없다. effect 카운터는 "몇 번 마운트
   effect가 돌았나"라는 간접 신호인 반면, 참조 동일성은 사실 그 자체를 잰다.
3. 스크롤 위치·CSS 트랜지션 상태·이벤트 리스너 등 리마운트가 실제로 파괴하는 것들은
   전부 "그 DOM 노드가 그 DOM 노드인가"에 달려 있다 — 참조 동일성 검사가 사용자가
   체감하는 문제(diagnosis #1의 "받은 것이 유지되지 않는다")와 가장 가깝다.

### 3.2 테스트

```tsx
// apps/v1_web/src/components/v1-ui/app-shell-frame.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShellFrame } from './app-shell-frame';
import { AppChrome } from './shell';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(() => ({ data: { unreadCount: 0 } })),
}));

// AppShellFrame이 route-chrome.ts의 실제 테이블 내용에 의존하지 않도록 두 라우트만
// 고정 목킹한다 — 테이블 자체의 정확성은 route-chrome.test.ts(§3.5)가 따로 검증한다.
vi.mock('@/lib/route-chrome', () => ({
  resolveRouteChrome: (pathname: string) => {
    if (pathname === '/home') return { chrome: { title: 'teameet', activeTab: 'home' as const }, params: {} };
    if (pathname === '/tournaments') return { chrome: { title: '대회', activeTab: 'tournaments' as const }, params: {} };
    return null;
  },
}));

let mockPathname = '/home';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('AppShellFrame — 셸 지속성 (진단 #1의 반증)', () => {
  it('pathname이 바뀌어도 topbar/bottomnav/스크롤 컨테이너 DOM은 리마운트되지 않는다', () => {
    mockPathname = '/home';
    const { rerender } = render(
      <AppShellFrame><div data-testid="page-content">홈 콘텐츠</div></AppShellFrame>,
    );

    const topbarBefore = screen.getByRole('banner');                                  // <header class="tm-topbar">
    const bottomNavBefore = screen.getByRole('navigation', { name: '주요 메뉴' });      // <nav class="tm-bottom-nav">
    const scrollAreaBefore = screen.getByRole('main');                                 // <main class="tm-scroll-area">

    // 라우트 전환 시뮬레이션: 같은 AppShellFrame 인스턴스 아래에서 pathname과 children만
    // 바뀐다 — Next 라우터가 layout을 유지한 채 페이지 세그먼트만 바꾸는 상황과 동형이다.
    mockPathname = '/tournaments';
    rerender(<AppShellFrame><div data-testid="page-content">대회 콘텐츠</div></AppShellFrame>);

    expect(screen.getByRole('banner')).toBe(topbarBefore);
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBe(bottomNavBefore);
    expect(screen.getByRole('main')).toBe(scrollAreaBefore);
    // "셸이 안 바뀜"과 "아무것도 리렌더 안 됨"을 구분 — 콘텐츠는 실제로 갱신됐는지도 확인.
    expect(screen.getByTestId('page-content')).toHaveTextContent('대회 콘텐츠');
  });

  it('제목/활성 탭은 라우트 전환에 맞춰 실제로 바뀐다 (셸이 얼어붙은 게 아님을 확인)', () => {
    mockPathname = '/home';
    const { rerender } = render(<AppShellFrame><div /></AppShellFrame>);
    expect(screen.getByText('teameet')).toBeInTheDocument();

    mockPathname = '/tournaments';
    rerender(<AppShellFrame><div /></AppShellFrame>);
    expect(screen.getByText('대회')).toBeInTheDocument();
    const tournamentsTab = screen
      .getByRole('navigation', { name: '주요 메뉴' })
      .querySelector('[href="/tournaments"]');
    expect(tournamentsTab).toHaveAttribute('aria-current', 'page');
  });

  // 대조군 — 이 기법이 실제로 변별력이 있는지 확인한다(§3.3).
  it('[대조군] 페이지가 각자 AppChrome을 직접 렌더하던 예전 방식은 이 성질을 만족하지 못한다', () => {
    function OldStyleHomePage() {
      return <AppChrome title="teameet" activeTab="home"><div>홈</div></AppChrome>;
    }
    function OldStyleTournamentsPage() {
      return <AppChrome title="대회" activeTab="tournaments"><div>대회</div></AppChrome>;
    }

    const { rerender } = render(<OldStyleHomePage />);
    const bottomNavBefore = screen.getByRole('navigation', { name: '주요 메뉴' });

    // 컴포넌트 함수 자체가 바뀐다 — 오늘 실제로 라우트가 바뀔 때 Next가 하는 일과 같다
    // (HomePage와 TournamentsPage는 서로 다른 모듈의 서로 다른 함수다).
    rerender(<OldStyleTournamentsPage />);
    const bottomNavAfter = screen.getByRole('navigation', { name: '주요 메뉴' });

    expect(bottomNavAfter).not.toBe(bottomNavBefore);
  });
});
```

### 3.3 자가 점검 — 이 테스트가 실제로 red가 되는가

**(1) 셸을 다시 page로 되돌리면?** 위 "대조군" 테스트가 바로 이 시나리오를 미리
실행해 둔 것이다 — `OldStyleHomePage`/`OldStyleTournamentsPage`처럼 **서로 다른 컴포넌트
함수**가 각자 `<AppChrome>`을 렌더하면 `bottomNavAfter !== bottomNavBefore`가 **항상**
성립한다(React 재조정 규칙: 같은 트리 위치라도 컴포넌트 타입이 다르면 서브트리를 통째로
버리고 새로 만든다). 이 대조군은 계속 통과해야 정상인 테스트다 — "이 기법이 진짜로
리마운트를 잡아낸다"는 걸 증명하는 캘리브레이션이다. 한 가지 정직한 한계: 메인
테스트(3.2 첫 번째 `it`)처럼 **같은 JSX 리터럴 위치에서 prop 값만 바꿔** `rerender`하면,
그 안에 `<AppChrome>`을 직접 둔 예전 방식이라도 React가 "타입 동일"로 보고 재조정을
최적화해 버려 **참조가 유지된 것처럼 통과할 수 있다** — RTL의 `rerender()`는 "같은
컴포넌트 함수가 다른 pathname으로 다시 렌더됨"만 정확히 모사하고, "라우트가 바뀌면
Next가 완전히 다른 컴포넌트 함수를 마운트한다"는 사실은 대조군처럼 함수 자체를
바꿔야 재현된다. 그래서 메인 테스트는 `AppShellFrame`(승격 후 유일한 마운트 지점)을
직접 겨냥하고, 대조군이 "예전 구조는 애초에 이 성질이 없었다"는 걸 별도로 증명한다.

**(2) 승격 후 흔한 실수를 넣으면?** `app-shell-frame.tsx`의 `<AppChrome ...>`에
`key={pathname}`을 실수로 추가하면(흔한 오해: "라우트마다 새 인스턴스를 강제해야 안전할
것 같다") — `key`가 바뀌면 React는 타입이 같아도 **무조건** 언마운트 후 재마운트한다.
이 상태에서 메인 테스트를 돌리면 `topbarAfter !== topbarBefore` 등으로 **확실히 red가
된다.** 이게 이 테스트가 지키려는 바로 그 회귀다.

### 3.4 이중 셸 가드 테스트 (§2.2 메커니즘의 짝)

```tsx
// apps/v1_web/src/components/v1-ui/shell.test.tsx 에 추가 (기존 파일, 새 describe 블록)
describe('AppChrome 이중 마운트 가드 (§2.2 마이그레이션 안전망)', () => {
  it('AppChrome 안에 또 다른 AppChrome이 중첩되면 안쪽은 children만 통과시킨다', () => {
    render(
      <AppChrome title="바깥" activeTab="home" showNotifications={false}>
        <AppChrome title="안쪽(마이그레이션 잔재)" activeTab="matches" showNotifications={false}>
          <div data-testid="leaf">내용</div>
        </AppChrome>
      </AppChrome>,
    );

    // bottom nav가 정확히 1개 — 2개면 이중 셸이 실제로 렌더된 것(구조적 회귀).
    expect(screen.getAllByRole('navigation', { name: '주요 메뉴' })).toHaveLength(1);
    expect(screen.getByText('바깥')).toBeInTheDocument();
    expect(screen.queryByText('안쪽(마이그레이션 잔재)')).not.toBeInTheDocument();
    // 안쪽 children(leaf)은 그대로 화면에 나온다 — passthrough가 콘텐츠까지 지우지 않음.
    expect(screen.getByTestId('leaf')).toBeInTheDocument();
  });
});
```

이 테스트를 지우고(또는 가드 자체를 되돌리고) 돌리면 `getAllByRole(...)`이 길이 2를
반환해 `toHaveLength(1)`이 즉시 red가 된다 — 가드가 실제로 이중 렌더를 막고 있다는 증거.

### 3.5 (권장) 테이블 커버리지/충돌 회귀 테스트

```ts
// apps/v1_web/src/lib/route-chrome.test.ts
import { describe, expect, it } from 'vitest';
import { resolveRouteChrome } from './route-chrome';

describe('route-chrome — 골든 샘플', () => {
  it.each([
    ['/home', { title: 'teameet', activeTab: 'home' }],
    ['/tournaments', { title: '대회', activeTab: 'tournaments' }],
    ['/tournaments/t-1', { title: '대회 상세', activeTab: 'tournaments', backHref: '/tournaments' }],
    ['/tournaments/t-1/awards', { title: '시상·리뷰', activeTab: 'tournaments', backHref: '/tournaments/t-1/results' }],
    ['/tournaments/t-1/bracket', { title: '순위·브래킷', activeTab: 'tournaments', backHref: '/tournaments/t-1' }],
    ['/matches/m-1/applications', { title: '신청자 관리', activeTab: 'matches', backHref: '/matches/m-1' }],
    ['/teams/tm-1/tactics/g-1', { title: '우리 팀 전술', activeTab: 'teams', backHref: '/teams/tm-1' }],
  ] as const)('%s', (pathname, expected) => {
    expect(resolveRouteChrome(pathname)?.chrome).toMatchObject(expected);
  });

  it('테이블에 없는 라우트는 null — admin/auth 등은 원래도 AppChrome이 없었다(§1.4)', () => {
    expect(resolveRouteChrome('/admin/users')).toBeNull();
    expect(resolveRouteChrome('/login')).toBeNull();
    expect(resolveRouteChrome('/onboarding')).toBeNull();
  });

  it('세그먼트 수가 다르면 특이성 정렬과 무관하게 매치되지 않는다 — 오매칭 방지', () => {
    // /tournaments(테이블에 있음)가 /tournaments/campaigns/summer-cup(3세그먼트, 별개 엔트리)을
    // 삼키지 않는다 — 매처가 세그먼트 수부터 비교하기 때문(§1.4).
    expect(resolveRouteChrome('/tournaments')?.params).toEqual({});
    expect(resolveRouteChrome('/tournaments/campaigns/summer-cup')?.chrome.activeTab).toBe('tournaments');
  });
});
```

이건 "선택"이지만 비용 대비 값이 크다 — 매처를 리팩터링하거나 테이블 순서를 바꿀 때
우연한 특이성 역전(오매칭)을 커밋 전에 잡아준다. 파일 트리를 실제로 걸어서 "테이블에
없는 페이지 디렉터리"를 자동 탐지하는 더 강한 커버리지 테스트는 만들지 않는다 — §2.1의
불변식(테이블에 없으면 무영향) 덕분에 누락은 사고가 아니라 "아직 안 옮김"일 뿐이라
CI가 강제할 만큼 위험하지 않다(과잉 테스트 지양 — 전역 지침 24).

---

## 4. 위험 목록과 방어

정찰 3개 섹션(shell-inventory/route-taxonomy/scroll-and-nav)의 `⚠` 전부와, 이 설계를
만드는 과정에서 직접 코드를 읽다가 새로 찾은 것(R20/R21)까지 빠짐없이 담는다.
route-taxonomy·scroll-and-nav 쪽 상당수는 **셸 승격 자체로는 못 고친다** — 그런 항목은
"범위 밖"이라고 조용히 넘기지 않고, 이 설계가 다음 웨이브에 무엇을 준비해 두는지
명시한다(§5와 연결).

| # | 출처 | 위험 | 이 설계의 방어/처리 | 웨이브 |
|---|---|---|---|---|
| R1 | shell-inventory | `title`이 `ReactNode`(알림 안읽음 뱃지, `community-page.tsx:253-257`)라 정적 테이블(string)에 못 담음 | §1.6 `ShellOverride.title: ReactNode`가 그대로 수용 — 별도 메커니즘 불필요 | 1b |
| R2 | shell-inventory | `floatingSlot`이 페이지별 인터랙티브 JSX(FAB/CTA 6곳) | §1.6 `ShellOverride.floatingSlot`으로 수용 | 1b |
| R3 | shell-inventory | loading/error vs success 분기 간 `desktopHead` 불일치 4건 | **재진단**: 4/4 전부 "success가 자체 desktop head를 그려서 generic을 끔"이라는 동일한 의도된 패턴(§1.9 표에서 file:line 4건 전부 직접 확인, 정찰의 "불일치"는 실수가 아니었다). 테이블엔 loading/error 값(`desktopHead:true`)을 넣고 success가 `useShellOverride({desktopHead:false})`로 끔 | 1c |
| R4 | shell-inventory | fetch 데이터 의존 제목이 layout 마운트 시점엔 없어 헤더 깜빡임 우려 | §1.6 `useSyncExternalStore`의 렌더-중 자기교정 성질 덕분에 헤더가 **본문과 같은 커밋**에서 갱신됨 — 별도 깜빡임 프레임이 생기지 않음(§1.9 표) | 1c |
| R5 | shell-inventory | i18n(next-intl) 의존 제목이라 테이블 하드코딩 시 다국어 깨질 우려 (`my-inquiries-client.tsx`) | **반증**: 직접 열어 확인 — `t`는 그 파일에 하드코딩된 순수 한국어 상수 객체(`my-inquiries-client.tsx:14-45`), `next-intl` import 없음. 59개 AppChrome 소비 파일 전체 grep도 `next-intl` 0건. **결함 아님** — static string으로 취급 | 1a |
| R6 | shell-inventory | 검색(`/search`)이 `activeTab`을 안 넘겨 회귀로 오인될 수 있음 | **확인: 의도된 동작.** `shell.tsx:73-75` 주석이 명시("5개 탭 어디에도 안 속하는 화면이 home으로 떨어지지 않게 기본값을 안 둔다"). `/search` 테이블 행에 `activeTab` 필드 자체를 안 씀(undefined 유지) — §6 부록 A 명시 | 1a |
| R7 | shell-inventory | 공유 에러뷰(`MatchStatePageView`/`TeamStatePageView`)가 여러 물리 라우트에서 재사용돼 "라우트당 1행" 모델과 안 맞아 보임 | §1.9 결론: `title`이 원래도 런타임 에러코드 의존이라 override 대상일 뿐, 라우트 공유 여부는 override 메커니즘과 무관 — 특별 규칙 불필요 | 1d |
| R8 | shell-inventory | `/my` 루트가 정확히 어느 View를 쓰는지 정찰이 미확정으로 남김 | **확정**: `app/my/page.tsx:1-5` → `MyHomePageClient`(`my-api-clients.tsx:160`) → `MyHomePageView`(`my-page.tsx:73`) | 1d |
| R9 | route-taxonomy | `PageSkeleton`에 board(관리자 테이블·대진표 등 ≈30곳) variant 없음 | **범위 밖**(다음 웨이브: 전환+스켈레톤). 이 설계가 주는 인터페이스: `<main class="tm-scroll-area">` 위치가 고정되므로(§1.8) 스켈레톤은 그 안 `{children}`만 신경 쓰면 됨 | 다음 웨이브 |
| R10 | route-taxonomy | console(실시간 콘솔 ≈20곳) variant 없음 | 범위 밖, R9와 동일 인터페이스 | 다음 웨이브 |
| R11 | route-taxonomy | auth(온보딩/로그인 등 ≈12곳) variant 없음 | 범위 밖 — 게다가 이 라우트들은 애초에 `AppShellFrame` 스코프 밖(§1.4, AppChrome 사용 0건 직접 확인)이라 셸과 아예 무관 | 다음 웨이브 |
| R12 | route-taxonomy | form(멀티스텝 ≈25곳) variant 없음 | 범위 밖, R9와 동일 인터페이스 | 다음 웨이브 |
| R13 | route-taxonomy | barrel 컴포넌트 내부 분기가 그렙 신호로만 추정됨 | **부분 해소**: 이 설계 과정에서 `my-api-clients.tsx`(desktopHead 분기 2곳), `community-page.tsx`(ReactNode title, 채팅 3개 View), `my-inquiries-client.tsx`(i18n 반증)는 직접 열어 확정(R3/R5/R7/R8 근거가 이 검증 결과). 스켈레톤 관련 나머지 barrel 분기는 범위 밖 — 다음 웨이브가 직접 열어야 함 | 다음 웨이브(일부 완료) |
| R14 | scroll-and-nav | 채팅방이 `.tm-scroll-area`를 끄고 자체 스크롤러 사용 — 셸 레벨 스크롤 복원과 경쟁 우려 | **범위 밖**(다음 웨이브: 지속성+최적화). 이 설계가 주는 것: `.tm-scroll-area` DOM이 이제 라우트 전환에도 파괴되지 않음(§3 테스트로 직접 증명)이 스크롤 복원을 **가능하게 만드는 전제** 그 자체다 — 승격 전엔 매 전환마다 노드가 새로 생겨 scrollTop을 저장해도 복원할 대상이 없었다 | 다음 웨이브(전제 제공) |
| R15 | scroll-and-nav | `/tournaments`의 수동 `scrollIntoView`가 자동 스크롤 복원과 경쟁할 우려 | 범위 밖, R14와 동일 — 다음 웨이브가 스크롤 복원을 설계할 때 이 수동 호출과의 순서를 함께 정해야 한다(이 문서가 그 순서까지 못 박지는 않는다) | 다음 웨이브 |
| R16 | scroll-and-nav | View Transition 전체 스냅샷이 `.tm-fixed-cta` 등을 중복 캡처할 우려 | 범위 밖(다음 웨이브: 전환+스켈레톤). 이 설계는 View Transitions를 전혀 도입하지 않는다 — `view-transition-name:none` 제외 대상 목록을 정할 때 정찰의 라인 목록(`globals.css:2701-2733` 등)을 그대로 출발점으로 쓰면 됨 | 다음 웨이브 |
| R17 | scroll-and-nav | 데스크톱(≥1024px)은 스크롤 모델 자체가 다름(document vs `.tm-scroll-area`) | 범위 밖 — 다만 `AppChrome`(§1.8)은 모바일/데스크톱 분기 없는 동일 컴포넌트이므로 셸 승격 자체는 두 모드에 동일하게 적용된다(모바일에서만 검증되는 위험이 아니다). 데스크톱 전용 스크롤/트랜지션 설계는 다음 웨이브 | 다음 웨이브 |
| R18 | scroll-and-nav | `desktop/search.css`의 `!important` 스택 — 이전 우선순위 다툼 흔적 | 범위 밖. 이 설계는 `desktop/*.css`를 전혀 건드리지 않는다 — 다음 웨이브가 그 파일을 손대기 전 이 흔적을 먼저 인지하라는 경고만 남김 | 다음 웨이브 |
| R19 | scroll-and-nav | `RouteProgressBar`가 이미 layout 레벨 — 미래 View Transition과의 상호작용 미검증 | 범위 밖. `RouteProgressBar`는 이 설계로 **전혀 이동하지 않는다**(원래도 `layout.tsx`에 있었음, 전제 참고) — 셸 승격과는 상호작용이 없고, View Transition 도입 시점에만 재확인이 필요하다 | 다음 웨이브 |
| R20 | **설계 중 발견(신규)** | `RequireAuth`(my/notifications/chat/onboarding `layout.tsx`)가 인증 확인 중 렌더하는 `SessionFallback`이 `<main className="tm-auth-frame">`인데(`session-entry-gate.tsx:82`), 승격 후 `AppChrome`의 `<main class="tm-scroll-area">` **안에 중첩**된다 — `<main>` 랜드마크 중복(HTML 시맨틱 위반, `screen.getByRole('main')`이 2개 매치해 그 자체로 테스트가 깨질 수 있음) | `SessionFallback`의 루트를 `<main className="tm-auth-frame">` → `<div className="tm-auth-frame">`로 1줄 변경. **웨이브 1d에서 my/notifications/chat/onboarding 4개 세그먼트 테이블 등록과 반드시 같은 커밋**으로 처리한다(admin은 AppChrome을 아예 안 쓰므로 대상 아님, `grep -rl AppChrome apps/v1_web/src/app/admin` 0건으로 직접 확인, §1.2) | 1d (필수 동반) |
| R21 | **설계 중 발견(신규)** | §2.2 이중 셸 가드가 발동 중이면 안쪽 `<AppChrome>` 호출의 `floatingSlot`/동적 title 등 props가 조용히 버려진다(화면엔 옛/기본값이 보임) | 1차 방어: §2.4 원자 커밋 규율(테이블 등록 + 페이지 정리를 항상 같은 커밋)로 이 상태 자체가 생기지 않게 한다. 2차(잔여 위험을 있는 그대로 인정): 실수로 이 상태가 생겨도 **크래시나 이중 렌더는 없다** — "옛/기본 제목이 잠깐 보인다"는 눈에 띄지만 안전한 열화로 그친다. 오래 방치하면 안 된다는 경고를 가드 코드 주석(§2.2)에도 남겨 둔다 | 전 웨이브 공통 |

---

## 5. 다음 웨이브에 넘기는 인터페이스

이 설계(셸 승격)가 끝나면 다음 두 웨이브(전환+스켈레톤 / 지속성+최적화)는 아래를
**전제로 삼을 수 있다** — 굳이 재확인할 필요 없이 바로 위에 쌓으면 된다:

- **`AppChrome`은 라우트 전환에 리마운트되지 않는다**(§3 테스트로 증명, CI에 상시 존재).
  스크롤 위치 저장/복원(지속성 웨이브, R14/R15)은 이제 "저장할 대상 DOM이 항상 살아있다"는
  전제 위에서 설계할 수 있다.
- **`<main class="tm-scroll-area">`의 위치와 정체성이 고정**된다 — 페이지 전환 스켈레톤
  (R9~R12)은 그 안의 `{children}` 자리만 채우면 되고, 셸 자체의 마운트/언마운트 타이밍을
  신경 쓸 필요가 없다.
- **`route-chrome.ts`/`ShellOverride`가 "이 라우트가 지금 무엇을 보여주는가"의 단일
  진입점**이 된다 — View Transition을 붙일 때(R16) 페이지가 바뀌는 시점을 이 마운트
  지점(`AppShellFrame`) 하나에서 관찰하면 되고, 44곳 각각에서 따로 훅을 걸 필요가 없다.
- **admin/auth/login/signup/callback/onboarding/terms/account-deletion/landing/
  admin-content-preview는 이 설계의 영향 밖**이다(§1.4) — 이 세그먼트들의 화면 전환·로딩
  상태는 별도 조사가 필요하면 그건 이 문서가 다루지 않은 완전히 다른 작업이다(scope 확장
  금지 — 전역 지침 13).
- 이 설계가 **하지 않는 것**: 스크롤 복원 구현, View Transitions 도입, 서비스워커,
  `next/image` 전환, Android WebView 캐시 설정. 전부 다음 웨이브의 몫이다.

---

## 6. 부록

### 부록 A — `route-chrome.ts` 시드 테이블 (대표 샘플)

전체 130여 항목을 여기 다 옮기지 않는다 — 아래는 **모든 특이 케이스를 한 번씩 포함하는
대표 샘플**이다(단순 정적 / 파라미터 `backHref` / 폴백-후-override / 검색의 activeTab
누락 보존 / desktopHead 분기차). 나머지는 §2.3 웨이브를 따라 같은 패턴으로 채운다.

```ts
const HOME_ROUTES: RouteChromeEntry[] = [
  { pattern: '/home', chrome: { title: 'teameet', activeTab: 'home', showSearch: true } },
];

const MATCHES_ROUTES: RouteChromeEntry[] = [
  { pattern: '/matches', chrome: { title: '매치', activeTab: 'matches', topBar: false } },
  {
    pattern: '/matches/:id/applications',
    chrome: { title: '신청자 관리', activeTab: 'matches', bottomNav: false, backHref: (p) => `/matches/${p.id}` },
  },
  {
    pattern: '/matches/new/complete',
    chrome: { title: '매치 만들기 완료', activeTab: 'matches', bottomNav: false, backHref: '/matches' },
  },
];

const TEAMS_ROUTES: RouteChromeEntry[] = [
  { pattern: '/teams', chrome: { title: '팀', activeTab: 'teams', topBar: false } },
  {
    pattern: '/teams/:id/tactics/:gameId',
    chrome: { title: '우리 팀 전술', activeTab: 'teams', bottomNav: false, backHref: (p) => `/teams/${p.id}` },
  },
  {
    pattern: '/teams/:id/contact/settings',
    chrome: { title: '컨택 설정', activeTab: 'teams', bottomNav: false, backHref: (p) => `/teams/${p.id}`, desktopHead: true },
  },
];

const TOURNAMENTS_ROUTES: RouteChromeEntry[] = [
  { pattern: '/tournaments', chrome: { title: '대회', activeTab: 'tournaments' } },
  {
    // 폴백 — success 분기가 useShellOverride({ title: data.title, floatingSlot: <ApplyCTA/>,
    // desktopHead: false })로 덮어쓴다(§1.9 표, tournament-detail-client.tsx:537).
    pattern: '/tournaments/:id',
    chrome: { title: '대회 상세', activeTab: 'tournaments', bottomNav: false, backHref: '/tournaments', desktopHead: true },
  },
  {
    // 폴백 — success가 useShellOverride({ title: `${제목} 경기 일정` })로 덮어씀(schedule-page-client.tsx:59).
    pattern: '/tournaments/:id/schedule',
    chrome: { title: '경기 일정', activeTab: 'tournaments', backHref: (p) => `/tournaments/${p.id}`, desktopHead: true },
  },
  {
    pattern: '/tournaments/:id/bracket',
    chrome: { title: '순위·브래킷', activeTab: 'tournaments', backHref: (p) => `/tournaments/${p.id}`, desktopHead: true },
  },
  {
    pattern: '/tournaments/:id/results',
    chrome: { title: '최종결과', activeTab: 'tournaments', backHref: (p) => `/tournaments/${p.id}/bracket`, desktopHead: true },
  },
  {
    pattern: '/tournaments/:id/awards',
    chrome: { title: '시상·리뷰', activeTab: 'tournaments', backHref: (p) => `/tournaments/${p.id}/results`, desktopHead: true },
  },
  {
    pattern: '/tournaments/campaigns/:slug',
    // 폴백 — success가 useShellOverride({ title: result.campaign.tournament.title })로 덮어씀.
    chrome: { title: '대회 캠페인', activeTab: 'tournaments', showNotifications: false, desktopHead: true },
  },
];

const MY_ROUTES: RouteChromeEntry[] = [
  {
    // TODO(웨이브 1d): my-page.tsx:73 MyHomePageView가 실제로 넘기는 title 값을 열어 확정한다
    // — 정찰이 소비 라우트만 확인했고(§2.3.1) title 문자열 자체는 아직 안 읽었다. 추측해서
    // 채우지 않는다(전역 지침 5 — 모호함을 조용히 지나치지 않기).
    pattern: '/my',
    chrome: { title: '__TODO_CONFIRM__', activeTab: 'my' },
  },
  {
    pattern: '/my/inquiries',
    chrome: { title: '문의', activeTab: 'my', bottomNav: false, backHref: '/my', desktopHead: true },
  },
  {
    pattern: '/my/inquiries/new',
    chrome: { title: '문의하기', activeTab: 'my', bottomNav: false, backHref: '/my/inquiries', desktopHead: true },
  },
  {
    pattern: '/my/inquiries/:id',
    chrome: { title: '문의 상세', activeTab: 'my', bottomNav: false, backHref: '/my/inquiries', desktopHead: true },
  },
];

const COMMUNITY_ROUTES: RouteChromeEntry[] = [
  {
    pattern: '/chat',
    chrome: { title: '채팅', activeTab: 'my', bottomNav: false, backHref: '/home', showNotifications: false },
  },
  {
    // 폴백 — ChatRoomPageView가 useShellOverride({ title: model.title })로 채팅방 이름을 채움.
    pattern: '/chat/:id',
    chrome: { title: '채팅방', activeTab: 'my', bottomNav: false, backHref: '/chat', showNotifications: false },
  },
  {
    // 폴백 문자열일 뿐 — 실제로는 항상 NotificationsPageView가 useShellOverride({
    // title: <span>알림 <span class="tm-notification-count">{count}</span></span>,
    // topbarActions: <button>모두 읽기</button> })로 즉시 덮어쓴다(§1.9 표).
    pattern: '/notifications',
    chrome: { title: '알림', activeTab: 'my', bottomNav: false, backHref: '/home', showNotifications: false },
  },
];

const MISC_ROUTES: RouteChromeEntry[] = [
  { pattern: '/events', chrome: { title: '이벤트', activeTab: 'tournaments', showNotifications: true } },
  {
    pattern: '/users/:id/records',
    // 폴백 — success가 useShellOverride({ title: `${닉네임} 님의 활동 기록` })로 덮어씀.
    chrome: { title: '활동 기록', activeTab: 'teams', backHref: (p) => `/users/${p.id}`, desktopHead: true },
  },
  {
    // activeTab을 의도적으로 안 넣는다 — R6: search-experience.tsx:175가 원래도 activeTab을
    // 안 넘겼고(shell.tsx:73-75 주석이 그 이유를 설명), 이 필드를 채우면 엉뚱한 탭이
    // 활성으로 보이는 회귀가 된다.
    pattern: '/search',
    chrome: { title: '검색', topBar: false, showSearch: false, showNotifications: false, bottomNav: true },
  },
  { pattern: '/notices', chrome: { title: '공지사항', activeTab: 'home', bottomNav: false, backHref: '/home' } },
];

const ROUTE_CHROME_TABLE: RouteChromeEntry[] = [
  ...HOME_ROUTES, ...MATCHES_ROUTES, ...TEAMS_ROUTES, ...TOURNAMENTS_ROUTES,
  ...MY_ROUTES, ...COMMUNITY_ROUTES, ...MISC_ROUTES,
  // TEAM_MATCHES_ROUTES / LEAGUE_MATCHES_ROUTES 등 나머지 세그먼트는 §2.3 웨이브 순서대로 채운다.
];
```

**`not-found.tsx`는 테이블에 넣지 않는다 — 넣을 수가 없다.** Next의 전역 404는 정의상
**어떤 pathname으로도** 뜰 수 있어서(사용자가 실제로 친 잘못된 URL 그 자체가 pathname이다)
고정 패턴으로 매칭할 대상이 없다. `resolveRouteChrome`은 그 어떤 404 URL에도 `null`을
반환하므로 `AppShellFrame`은 children을 그대로 통과시키고, `not-found.tsx`(`app/not-found.tsx:9`)
자신의 `<AppChrome title="" showNotifications={false}>` 호출이 §2.2 가드에 막히지 않고
정상적으로 렌더된다 — **이 라우트는 마이그레이션 대상이 아니라 설계상 영구 예외**다. 새로
알아야 할 규칙이 아니라, §1.4/§2.2가 이미 만들어 둔 성질의 자연스러운 결과다.

### 부록 B — 라우트 1개 마이그레이션 체크리스트

1. `grep -n "AppChrome" <파일>`로 그 라우트의 모든 호출 지점을 찾는다.
2. 분기(loading/error/success)마다 넘기는 props를 나열해 diff한다 — 다르면 §1.9 규칙으로
   "실수인지 의도인지"부터 판정한다(추측 금지 — R3처럼 자식 컴포넌트가 자체 desktop head를
   그리는지 실제로 열어 확인).
3. 동적 필드(fetch 의존 title, floatingSlot, topbarActions, hasNewNotification,
   success-only desktopHead)를 분류한다.
4. `route-chrome.ts`의 해당 세그먼트 배열에 정적 필드만 담은 행을 추가한다. `backHref`가
   라우트 파라미터를 조합하면 함수형으로 쓴다(§1.3).
5. 동적 필드가 있으면 그 컴포넌트의 **success 분기 렌더 함수 최상단**(Hooks 규칙 준수 —
   조건부 return보다 위)에 `useShellOverride({...})`를 추가한다.
6. 그 컴포넌트의 모든 `<AppChrome ...>{content}</AppChrome>`을 `{content}`로 축소한다.
7. `route-chrome.test.ts`(§3.5)에 그 pathname의 골든 샘플 케이스를 추가한다.
8. `pnpm --filter v1_web test <바뀐 파일 경로>`로 좁게 검증한다(전체 스위트 재실행 금지 —
   사용자 전역 지침 24).
9. 시각 검증: alpha 배포 후 그 라우트로 실제 이동해 topbar 제목·활성 탭·backHref·데스크톱
   헤더가 승격 전과 동일한지 스크린샷으로 대조한다(로컬 next 서버 금지 — 이 저장소
   전역 지침, `docs/ops/...` 런북 참고).
10. 4~6번을 **한 커밋**으로 묶어 올린다(§2.4). 회귀가 나오면 그 커밋 하나만 되돌린다(§2.5).

