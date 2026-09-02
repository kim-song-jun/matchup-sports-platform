# 앱 지속성·최적화 설계 (Wave 3)

## 0. 문서 목적과 전제

이 문서는 앱 셸 모션 작업의 **세 번째이자 마지막 웨이브** — 지속성(persistence)과 최적화 —
를 구현 에이전트가 그대로 따라 만들 수 있는 수준까지 구체화한 설계다. 대상 코드베이스는
`apps/v1_web`(Next.js 16 App Router) + `apps/v1_ios`(WKWebView 셸) + `apps/v1_android`
(Android WebView 셸).

### 이미 확정된 진단 (재검증하지 않는다)

1. AppChrome(`apps/v1_web/src/components/v1-ui/shell.tsx`)이 `layout.tsx`가 아니라
   44개 page/컴포넌트 안에서 각각 렌더된다 → 전환마다 `.tm-scroll-area`가 통째로 리마운트.
2. `loading.tsx` 6개, `page.tsx` 182개 — 스켈레톤 커버리지 격차.
3. `template.tsx` 0개, View Transitions 0건 — 전환 애니메이션 없음.
4. React Query: `staleTime` 30초 + `refetchOnWindowFocus:true`, `gcTime` 기본값, persist 없음.
5. 실제 스크롤러는 `window`가 아니라 `.tm-scroll-area`인데 스크롤 저장/복원 코드 0건.
6. Android WebView `setCacheMode` 미설정, back/forward cache 미활성.
7. 정적 에셋 서비스워커 없음(`public/sw-push.js`는 푸시 전용).
8. `next/image` 4곳(임무 지시 '5곳'과 실측 1곳 차이 — 아래 §5.1), raw `<img>` 9곳(테스트 제외).

### 웨이브 순서와 이 문서의 의존 관계

- **Wave 1**(셸을 `layout.tsx`로 승격)이 먼저 나가야 §2(스크롤 복원)의 전제가 성립한다.
  Wave 1 이전에도 §2 코드는 안전하게 동작하지만(매번 `querySelector`로 새로 찾으므로) 리마운트가
  이미 스크롤을 0으로 리셋해 주기 때문에 이득이 없다 — 실질적 가치는 `.tm-scroll-area`가
  **리마운트되지 않는** Wave 1 이후에 나온다. §1(React Query)·§3(SW)·§4(네이티브)·§5(이미지)는
  Wave 1/2 와 독립적이며 지금 바로 착수할 수 있다.
- **Wave 2**(스켈레톤)와 §2(스크롤 복원)는 코드 계약을 공유하지 않는다 — §2.4 참고.

### 이 웨이브가 푸는 사용자 불만

"페이지 전환이 뚝뚝 끊기고, 로딩 중 빈 화면이 뜨고, 이미 받은 것이 유지되지 않는다"의 세 번째
절(이미 받은 것이 유지되지 않는다)이 이 웨이브의 직접 표적이다. §1에서 다루는
`refetchOnWindowFocus:true` + `staleTime` 30초 조합은 **네이티브 웹뷰의 잦은 포그라운드
복귀마다 전체 리페치를 강제**하므로, 셸 리마운트(Wave 1)와는 별개로 이 증상 자체의 원인일
가능성이 높다 — §1.2에서 근거와 함께 판정한다.

---

## 1. React Query 지속성

### 1.1 문제

`apps/v1_web/src/app/providers.tsx:16-30`의 전역 `QueryClient` 기본값:

```ts
staleTime: 30_000,
retry: 1,
refetchOnWindowFocus: true,
// gcTime 미지정 → react-query v5 기본값 5분
```

React Query v5에서 `refetchOnWindowFocus: true`(`'always'`가 아님)는 포커스 이벤트마다
무조건 리페치하지 않는다 — **현재 쿼리가 `staleTime` 기준으로 stale 일 때만** 리페치한다.
즉 `staleTime` 30초 + `refetchOnWindowFocus:true`의 실제 의미는: **앱을 30초 넘게
백그라운드에 두고 돌아올 때마다, 화면에 떠 있는 모든 쿼리가 일제히 리페치된다.** 카카오톡
답장하러 30~60초 다른 앱에 다녀오는 것은 네이티브 웹뷰 사용자에게 흔한 패턴이므로, 이 조합은
**포그라운드 복귀 = 전면 로딩 스피너**를 구조적으로 만든다. `alpha` 실측 없이도 코드만으로
인과가 명확하다.

### 1.2 새 기본값 — 판정: `refetchOnWindowFocus`는 전역 OFF, 필요한 곳만 opt-in

정찰이 찾은 "진짜 실시간이 필요한" 쿼리들을 다시 보면, **전부 이미 focus-refetch보다 정밀한
자기만의 메커니즘을 갖고 있다**:

| 쿼리 | 실시간성 메커니즘 | focus-refetch 필요? |
|---|---|---|
| notifications/notificationUnreadSummary | 소켓 invalidate (`use-v1-realtime-socket.ts:12-13`) | 아니오 |
| chatRoom/chatMessages | 소켓 invalidate (`use-v1-realtime-socket.ts:28-29`) | 아니오 |
| game(gameId) | 소켓 invalidate (`use-v1-game-operations-console.ts`) | 아니오 |
| adminOverview/adminHubInbox/adminOpsSummary/tournamentOperationsBoard | `refetchInterval` 폴링 | 아니오 |
| tournament bracket(`livePolling`) | 조건부 `refetchInterval` | 아니오 |
| useV1FixtureLineupRoster | 이미 `refetchOnWindowFocus:false` 명시(편집 세션 고정 의도) | 이미 꺼짐 |

즉 전역 `refetchOnWindowFocus:true`가 실제로 유일한 신선도 보장 수단인 쿼리를 정찰에서
**하나도 찾지 못했다.** 반대로 목록/상세 위주(매치·팀·대회 등)에는 이 옵션이 "포그라운드
복귀마다 로딩 깜빡임"이라는 순비용만 남긴다. 따라서:

```ts
// apps/v1_web/src/app/providers.tsx
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,   // 30_000 → 60_000
      gcTime: 10 * 60_000, // 기본 5분 → 10분(근거: §2.5 무한스크롤 복원과 연동)
      retry: 1,
      refetchOnWindowFocus: false, // true → false
    },
    mutations: { retry: false }, // 변경 없음
  },
});
```

- **`staleTime` 30초→60초**: `refetchOnWindowFocus`를 끄면 `staleTime`의 역할이 "포커스마다
  리페치할지"에서 "재마운트(리스트→상세→뒤로가기)할 때 리페치할지"로 좁아진다. 인앱 왕복은
  보통 수 초 단위이므로 60초면 대부분의 왕복에서 불필요한 재요청을 막으면서도, 실제로 바뀐
  서버 상태(참가자 수 변경 등)가 지나치게 오래 안 보이지 않는다.
- **`gcTime` 5분→10분**: 뒤로가기 시 §2.5의 스크롤 복원이 "이미 메모리에 남아 있는 페이지들"에
  기대는 설계라, gcTime이 짧으면 그 사이 캐시가 지워져 복원이 실패하기 쉽다. 10분은 카카오톡
  답장 등 일반적인 이탈 시간을 넉넉히 덮는 보수적 상향이며, 무제한은 아니라서 장시간 세션에서도
  메모리가 무한히 자라지 않는다.
- **`refetchOnWindowFocus: false`(전역)**: 위 표의 근거로 안전. 향후 "포커스 복귀마다 최신값이
  필요한" 새 쿼리가 생기면 그 훅에서만 개별적으로 켠다:
  ```ts
  useQuery({ queryKey: v1Keys.xxx(), queryFn: ..., refetchOnWindowFocus: true });
  ```

### 1.3 `persistQueryClient` 도입

**패키지 추가** (`apps/v1_web/package.json`, 이미 설치된 `@tanstack/react-query@^5.62.0`과
동일 v5 라인):

```
@tanstack/query-sync-storage-persister
@tanstack/react-query-persist-client
```

**신규 파일** `apps/v1_web/src/lib/query-persist.ts`:

```ts
import type { Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * persist 스냅샷이 저장되는 단일 localStorage 키. clearV1IdentityCache()
 * (query-keys.ts)가 계정 전환 시 이 키를 통째로 지운다.
 */
export const PERSIST_STORAGE_KEY = 'teameet.v1.rq-cache';

/**
 * Tier-1 응답 타입이 바뀔 때(필드 삭제/이름 변경 등) 개발자가 수동으로 올린다.
 * 값이 바뀌면 persistQueryClient가 저장된 스냅샷 전체를 무효화하고 빈 캐시로 시작한다.
 *
 * release-version-watcher.tsx 의 배포 감지와는 **의도적으로 분리**했다 — 매 alpha
 * 배포마다 이 캐시를 지우면 이 웨이브의 목적(재방문 즉시 로드)이 대부분 무력화된다.
 * Tier-1 데이터(마스터/공지/캠페인)는 스키마가 실제로 바뀌는 빈도가 낮으므로, 개발자가
  * "이 PR은 그 타입을 바꿨다"고 알 때만 올리는 수동 버스터가 더 정확하다.
 */
export const PERSIST_BUSTER = 'p1';

/** persistQueryClient의 maxAge — 이 기간을 넘긴 스냅샷은 buster 일치 여부와 무관하게
 * 통째로 버려진다(며칠씩 앱을 안 연 사용자의 옛 데이터를 무기한 신뢰하지 않기 위함). */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간

/**
 * localStorage 에 남겨도 되는 쿼리 화이트리스트 — **기본은 거부**.
 *
 * 아래 4개 도메인만 실제로 타입 확인을 거쳐 안전하다고 검증됐다(app-persistence-optimization.md
 * §1.3 참고):
 *  - master   : masterSports/masterRegions — V1MasterSportsResponse/V1MasterRegionsResponse,
 *               viewer 필드 없음. 스포츠/지역 분류표, 로그인 여부와 무관.
 *  - notices  : notices/notice — V1Notice, viewer 필드 없음. 공개 공지.
 *  - public   : publicKakaoMapsKey — 코드 주석이 이미 "공개돼도 안전"이라고 명시.
 *  - tournaments/campaigns 세그먼트 : tournamentCampaigns/tournamentCampaign(slug) —
 *               V1PublicTournamentCampaign(타입명 자체가 Public), viewer 필드 없음.
 *
 * **여기 도메인을 추가하기 전에 반드시**: 1) 그 쿼리의 응답 TS 타입을 열어
 * viewer/applicationId/participantId/canApply 류 개인화 필드가 없는지 확인하고,
 * 2) 이 배열과 위 문서의 표에 함께 추가한다. 예: `useV1Matches`/`useV1Match`는 얼핏
 * 공개 목록처럼 보이지만 `V1Match` 타입(apps/v1_web/src/types/api.ts:405-412)이
 * `viewer.applicationId`/`viewer.participantId`/`viewer.canApply`를 포함해서(실측
 * 확인됨) 이 화이트리스트에 넣지 않았다 — 계정을 바꿔도 캐시가 지워지지 않으면
 * 새 사용자 화면에 "이전 사용자가 신청한 매치" CTA가 잠깐 보일 수 있다.
 */
const PERSIST_ALLOWED_DOMAINS = new Set(['master', 'notices', 'public']);

/** 세그먼트 어디에라도 이 값이 나오면 도메인이 허용 목록에 있어도 무조건 거부한다 —
 * 화이트리스트가 실수로 넓어지는 미래 변경에 대비한 이중 방어선. */
const BLOCKED_SEGMENTS = new Set(['me', 'admin', 'auth']);

export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false; // 에러/로딩 상태는 저장할 이유가 없다.

  const key = query.queryKey as readonly unknown[];
  if (key[0] !== 'v1') return false; // v1Keys 밖의 독립 키 팩토리(resultReviewKeys 등)는
    // 이 조건에서 이미 걸러진다 — v1Keys 컨벤션을 따르지 않는 새 쿼리는 안전한 방향
    // (미persist)으로 기본 실패한다.

  if (key.some((seg) => typeof seg === 'string' && BLOCKED_SEGMENTS.has(seg))) return false;

  const domain = key[1];
  if (typeof domain === 'string' && PERSIST_ALLOWED_DOMAINS.has(domain)) return true;
  // tournaments 도메인은 campaigns 세그먼트만 허용 — tournament(id) 상세는 개인화
  // 가능성이 있어 제외한다(§1.3 표의 Tier 2 참고, 아직 미검증).
  if (domain === 'tournaments' && key[2] === 'campaigns') return true;

  return false;
}

export function createV1Persister() {
  return createSyncStoragePersister({
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    key: PERSIST_STORAGE_KEY,
    throttleTime: 1_000, // 연속 쓰기를 1초로 묶는다 — 목록 스크롤 중 매 페이지 로드마다
      // 동기 localStorage 쓰기가 걸리는 것을 막는다.
  });
}
```

**Tier 2 후보 (아직 미검증 — 승격 절차는 위 도메인 정의 주석과 동일)**: `publicTeamReviews`,
`useV1PublicGameRecordsPlayerRecords`(둘 다 정찰이 "후보"로만 표시, 응답 타입 미확인).
`matches`/`match`는 확인 결과 **불가로 확정**(위 주석 참고) — 후보 목록에서도 제외한다.

**`providers.tsx` 적용** — `QueryClientProvider`를 `PersistQueryClientProvider`로 교체
(선언적으로 `isRestoring` 상태를 함께 얻는다 — Wave 2 스켈레톤이 "복원 중" 프레임을 다루고
싶다면 `useIsRestoring()`을 그대로 쓸 수 있다):

```tsx
'use client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState } from 'react';
import { createV1Persister, shouldPersistQuery, PERSIST_BUSTER, PERSIST_MAX_AGE_MS } from '@/lib/query-persist';
// ...기존 import 유지...

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  const [persister] = useState(() => createV1Persister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: PERSIST_BUSTER,
        maxAge: PERSIST_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === 'success' && shouldPersistQuery(query),
        },
      }}
    >
      <ThemeProvider>{/* ...기존 트리 그대로... */}</ThemeProvider>
    </PersistQueryClientProvider>
  );
}
```

`localStorage`(세션스토리지 아님)를 쓰는 이유: 이 기능의 목적 자체가 **네이티브 앱이 OS에
의해 완전히 종료됐다가 재시작되는 콜드스타트**에서도 마스터 데이터·공지가 즉시 보이는 것이다.
`sessionStorage`는 WebView 인스턴스가 새로 만들어지는 콜드스타트에서 살아남는다는 보장이
없다(브라우징 컨텍스트 단위) — §2(스크롤 복원)가 정반대로 `sessionStorage`를 쓰는 것과 대비된다
(§2.2에서 그 이유를 별도로 설명한다: 스크롤 위치는 콜드스타트에서 오히려 **복원되면 안 된다**).

### 1.4 계정 전환·로그아웃 시 캐시 클리어

`clearV1IdentityCache`(`apps/v1_web/src/lib/query-keys.ts:214-216`)는 이미 로그아웃(3곳)·
카카오 콜백·회원가입·소셜가입·소셜가입 이탈(총 5개 호출부, 전부 정찰에서 확인됨) 전부에서
호출되는 **단일 진입점**이다. `shouldPersistQuery`의 화이트리스트 설계상 identity 스코프
데이터는애초에 localStorage에 쓰이지 않으므로(§1.3), 이론적으로는 5개 호출부에 손댈 필요가
없다 — 하지만 "화이트리스트가 나중에 실수로 넓어지는" 시나리오에 대한 방어 심도로, 이 **한
함수**에 로컬스토리지 스냅샷 자체를 지우는 코드를 추가한다(5개 호출부는 전부 이 함수 하나를
통해서만 호출되므로 여기 한 곳만 고치면 된다):

```ts
// apps/v1_web/src/lib/query-keys.ts
import { PERSIST_STORAGE_KEY } from './query-persist';

export function clearV1IdentityCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: v1Keys.all });
  // 방어적 이중 clear — shouldPersistQuery() 화이트리스트가 identity 스코프 데이터를
  // 애초에 persist 하지 않도록 설계돼 있지만(query-persist.ts 참고), 화이트리스트가
  // 실수로 잘못 넓어지는 미래 변경까지 대비해 저장된 스냅샷 자체를 통째로 지운다.
  // 이 한 줄이 없으면 removeQueries()는 **메모리** 캐시만 지우고, localStorage에
  // 남은 이전 계정의 persist 스냅샷은 다음 앱 기동 시 그대로 복원된다.
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PERSIST_STORAGE_KEY);
    } catch {
      // Safari 프라이빗 모드 등 localStorage 접근 자체가 던질 수 있다 — 무시해도
      // 안전하다(메모리 캐시는 이미 지워졌고, persist 스냅샷은 원래도 identity
      // 스코프 데이터를 담지 않도록 설계돼 있다).
    }
  }
}
```

호출부 5곳(`logout-button.tsx:28`, `email-login-client.tsx:52`, `kakao-callback-client.tsx:70`,
`signup-client.tsx:305`, `social-signup-client.tsx:137`, `use-social-signup-exit.tsx:46`)은
**변경 불필요**.

### 1.5 버전 버스터와 `release-version-watcher.tsx`의 관계

의도적으로 **분리**한다 (§1.3 `PERSIST_BUSTER` 주석 참고): `PERSIST_BUSTER`는 Tier-1 응답
타입이 실제로 바뀔 때만 개발자가 수동으로 올리는 문자열이고, alpha의 매 배포마다 발생하는
`x-teameet-release` 변경과는 연동하지 않는다. 매 배포마다 RQ persist 캐시를 지우면 "재방문 시
즉시 로드"라는 이 웨이브의 목적 자체가 대부분 무력화되기 때문이다. 대신 §3.3에서
`release-version-watcher.tsx`는 **정적 에셋 SW 캐시**(HTML/JS 청크 불일치 위험이 실재하는
계층)만 정밀 타격한다 — RQ persist 캐시는 그 계층과 성격이 다르다(내려받은 JSON 데이터일 뿐,
청크 해시와 무관).

### 1.6 테스트 전략

- `shouldPersistQuery`는 순수 함수라 유닛 테스트로 계약을 고정한다: Tier-1 4개 도메인 통과,
  `matches`/`match`(viewer 필드 보유) 거부, `me`/`admin`/`auth` 세그먼트를 가진 임의 키 거부,
  `v1` 이외의 루트를 가진 키 거부. — 이 테스트가 깨지면 실제로 개인정보가 localStorage에
  남을 수 있으므로 규칙 3(품질 게이트)의 "진짜 테스트" 기준을 충족한다.
- `clearV1IdentityCache`가 `localStorage.removeItem`을 호출하는지는 기존 `query-keys` 관련
  테스트가 있다면 거기 한 케이스만 추가한다(신규 스위트 불필요 — 변경 규모에 비례, 글로벌
  규칙 24).
- `providers.tsx` 자체의 렌더 스모크 테스트(기존에 있다면) 갱신.

---

## 2. 스크롤 복원

### 2.1 저장 메커니즘

**연속 저장**(클릭/popstate 시점에만 저장하지 않는다) — 프로그램적 네비게이션(결제 완료 후
`router.push`, 폼 제출 후 리다이렉트 등)은 `<a>` 클릭 캡처로 잡히지 않으므로, 클릭 시점에만
저장하면 그런 경로에서 이탈 직전 스크롤 위치를 놓친다. 대신 스크롤 이벤트 자체를 디바운스
저장한다(150ms) — 이것이 브라우저 네이티브 스크롤 복원이 쓰는 것과 같은 방식이다.

**저장소: `sessionStorage`** (§1.3의 `localStorage`와 반대 선택 — 이유가 다르다). 스크롤
위치는 "이 브라우징 컨텍스트에서 뒤로가기 했을 때만" 의미가 있고, **콜드스타트(앱을 완전히
새로 켬)에서는 절대 복원되면 안 된다** — 다시 켠 사용자는 항상 그 라우트의 "새 진입"이지
"뒤로가기"가 아니다. `sessionStorage`는 WebView가 새 프로세스로 뜨면 자연히 비어 있으므로 이
불변식을 코드 없이 공짜로 보장한다.

**신규 파일** `apps/v1_web/src/lib/scroll-positions.ts`:

```ts
const SCROLL_POSITIONS_KEY = 'teameet.v1.scrollPositions';
const MAX_ENTRIES = 30; // 무제한 증가 방지 — 한 세션에 30개 라우트 이상 방문하면 가장
  // 오래된 것부터 버린다(LRU 근사: 삽입 순서 = 접근 순서로 취급, JS 객체 키 순서 보장 이용).

type PositionMap = Record<string, number>;

function readAll(): PositionMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SCROLL_POSITIONS_KEY);
    return raw ? (JSON.parse(raw) as PositionMap) : {};
  } catch {
    return {}; // 손상된 JSON·프라이빗 모드 등 — 빈 맵으로 시작해도 안전(그냥 복원 안 됨).
  }
}

function writeAll(map: PositionMap) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(map));
  } catch {
    // 쿼터 초과 등 — 스크롤 복원은 순수 UX 개선이라 실패해도 앱 동작에 영향 없다.
  }
}

export function saveScrollPosition(routeKey: string, top: number) {
  const map = readAll();
  delete map[routeKey]; // 재삽입으로 "가장 최근" 자리로 옮긴다(LRU 근사).
  map[routeKey] = top;
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) delete map[keys[0]];
  writeAll(map);
}

export function readScrollPosition(routeKey: string): number | null {
  const map = readAll();
  return routeKey in map ? map[routeKey] : null;
}
```

라우트 키는 `apps/v1_web/src/lib/session-storage.ts:111-114`의 기존
`getCurrentRedirectPath()`(`pathname+search+hash`)를 그대로 재사용한다 — 이 파일이 이미
정립한 "라우트 정체성 = pathname+search+hash" 컨벤션과 새 코드를 갈라 두지 않기 위함이다.

### 2.2 방향 감지 — `popstate` 기반, Navigation API 는 배제

**Navigation API(`window.navigation`, `navigate` 이벤트의 `navigationType`)는 쓰지 않는다.**
이 API는 Chromium 계열 전용이고, iOS 셸이 쓰는 WKWebView는 WebKit/Safari 엔진이라 지원하지
않는다(2026-01 기준). 대신 오래되고 두 엔진 모두 지원하는 `popstate`로 "뒤로/앞으로"만
구분하고, 그 외 모든 pathname 변경은 "새 진입(push)"으로 취급한다.

이 방식은 이 셸의 실제 뒤로가기 경로 세 가지를 전부 커버한다(실측 확인):
- iOS 엣지 스와이프 제스처: `WebShellViewController.swift:94`의
  `webView.allowsBackForwardNavigationGestures = true` — 브라우저 네이티브 뒤로가기이므로
  `popstate` 발화.
- Android 하드웨어 뒤로가기 버튼: `MainActivity.java:588`의
  `if (webView.canGoBack()) webView.goBack();` — `goBack()`은 히스토리 탐색이므로 `popstate` 발화.
- 인앱 뒤로가기 링크(`AppBackLink`): `<Link>` 기반이라 사실 `pushState`를 만들지만, 이 컴포넌트
  자체가 "새 목적지로의 이동"이지 히스토리 탐색이 아니므로 push로 취급되는 것이 맞다(그 목적지가
  이전에 저장해 둔 스크롤 위치를 가진 라우트라면, 다음에 그 라우트로 다시 popstate 로 돌아올 때
  정상 복원된다 — `AppBackLink`가 "뒤로가기"처럼 보여도 브라우저 히스토리 관점에서는 새 진입이며,
  이는 §2.6의 "새 진입에는 복원하면 안 된다" 요구와 일치한다).

`RouteProgressBar`(`route-progress.tsx:53-84`)가 이미 같은 클릭 캡처 + popstate 패턴으로 "내부
네비게이션 시작"을 감지하고 있다 — 아래 컴포넌트는 그 컨벤션을 그대로 따른다.

### 2.3 전체 구현

**신규 파일** `apps/v1_web/src/components/v1-ui/scroll-restoration.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentRedirectPath } from '@/lib/session-storage';
import { readScrollPosition, saveScrollPosition } from '@/lib/scroll-positions';

const DESKTOP_QUERY = '(min-width: 1024px)'; // desktop/_shell.css 의 breakpoint 와 동일해야
  // 한다 — 이 값이 어긋나면 두 스크롤 모델(문서 vs .tm-scroll-area)이 서로 다른 지점에서
  // 전환돼 스크롤 대상이 어긋난다.
const SAVE_DEBOUNCE_MS = 150;
const RESTORE_TIMEOUT_MS = 1500;

type ScrollHost = Element | (Window & typeof globalThis);

function getScrollElement(): ScrollHost | null {
  if (typeof window === 'undefined') return null;
  if (window.matchMedia(DESKTOP_QUERY).matches) return window;
  return document.querySelector('.tm-scroll-area') ?? window;
}

function getScrollTop(el: ScrollHost): number {
  return el === window ? window.scrollY : (el as Element).scrollTop;
}
function setScrollTop(el: ScrollHost, top: number) {
  if (el === window) window.scrollTo(0, top);
  else (el as Element).scrollTop = top;
}
function getScrollHeight(el: ScrollHost): number {
  return el === window ? document.documentElement.scrollHeight : (el as Element).scrollHeight;
}
function getClientHeight(el: ScrollHost): number {
  return el === window ? window.innerHeight : (el as Element).clientHeight;
}

/**
 * 저장된 목표 위치까지 스크롤 가능한 높이가 아직 안 나왔으면(예: 무한스크롤 목록이
 * 첫 페이지만 렌더된 상태) ResizeObserver 로 콘텐츠가 자라는 것을 기다렸다가 복원한다.
 *
 * 스켈레톤→콘텐츠 전환(Wave 2)의 구체적 구현을 몰라도 동작한다 — 무엇이 높이를
 * 만들었는지 상관하지 않고 **실제로 측정된 scrollHeight**만 본다. 그래서 이 컴포넌트는
 * Wave 2 스켈레톤 컴포넌트와 별도 연동 코드가 필요 없다.
 *
 * RESTORE_TIMEOUT_MS 안에 목표 높이에 도달하지 못하면(예: 캐시가 비어 첫 페이지
 * 20개만 있는데 5,000px 지점을 복원하려는 경우) 지금 도달 가능한 최댓값으로 클램프하고
 * 포기한다 — 사용자를 무작정 맨 위로 되돌리는 것보다 보던 지점에 더 가깝다.
 */
function restoreWhenTallEnough(el: ScrollHost, target: number): void {
  const clientHeight = getClientHeight(el);
  let settled = false;
  let observer: ResizeObserver | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const finish = (finalTop: number) => {
    if (settled) return;
    settled = true;
    observer?.disconnect();
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    setScrollTop(el, finalTop);
  };

  const tryRestore = () => {
    const maxScrollable = Math.max(0, getScrollHeight(el) - clientHeight);
    if (maxScrollable >= target) finish(target);
  };

  tryRestore();
  if (settled) return;

  const node = el === window ? document.documentElement : (el as Element);
  observer = new ResizeObserver(tryRestore);
  observer.observe(node);

  timeoutId = window.setTimeout(() => {
    const maxScrollable = Math.max(0, getScrollHeight(el) - clientHeight);
    finish(Math.min(target, maxScrollable));
  }, RESTORE_TIMEOUT_MS);
}

/** 층위 §0 참고: layout.tsx 레벨에 마운트되는 부수효과 전용 컴포넌트. 항상 null 렌더. */
export function ScrollRestoration() {
  const pathname = usePathname();
  const navTypeRef = useRef<'push' | 'pop'>('push');
  const firstRenderRef = useRef(true);

  // ① 저장 — 스크롤할 때마다(디바운스) 현재 라우트에 현재 위치를 적는다.
  useEffect(() => {
    const el = getScrollElement();
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveScrollPosition(getCurrentRedirectPath(), getScrollTop(el));
      }, SAVE_DEBOUNCE_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ② 방향 감지 — popstate 만 "뒤로/앞으로"다. RouteProgressBar 와 동일한 클릭 캡처 패턴.
  useEffect(() => {
    const onPopState = () => { navTypeRef.current = 'pop'; };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      navTypeRef.current = 'push';
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // ③ 적용 — pathname 이 실제로 바뀌면 방향에 따라 top=0 또는 복원.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false; // 최초 마운트(새로고침/콜드스타트)는 브라우저 기본에 맡긴다.
      return;
    }
    const el = getScrollElement();
    if (!el) return;

    if (navTypeRef.current === 'pop') {
      const saved = readScrollPosition(getCurrentRedirectPath());
      if (saved != null) restoreWhenTallEnough(el, saved);
      // 저장된 값이 없으면(예: 딥링크로 직접 진입) 아무 것도 하지 않는다 — 이미 0이다.
    } else {
      setScrollTop(el, 0);
    }
    navTypeRef.current = 'push'; // 소비했으니 기본값으로 되돌린다 — 다음 pathname 변경이
      // popstate 없이 일어나면(프로그램적 router.push 등) push 로 취급한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
```

**`layout.tsx` 적용**(`apps/v1_web/src/app/layout.tsx:52-54`):

```tsx
<RouteProgressBar />
<ReleaseVersionWatcher />
<ScrollRestoration />
<Providers>{children}</Providers>
```

### 2.4 왜 Wave 2(스켈레톤)와 별도 연동이 필요 없는가

§2.3의 `restoreWhenTallEnough`는 "무엇이 콘텐츠를 그렸는지" 모른다 — 오직 실제 DOM
`scrollHeight`만 관찰한다. 스켈레톤이 먼저 그려지고 실제 목록이 나중에 대체하든, 스트리밍
SSR로 조금씩 채워지든, 이 메커니즘은 동일하게 동작한다. 이것이 "복원 타이밍이 핵심 —
콘텐츠가 그려지기 전에 복원하면 아무 일도 안 일어난다"는 요구를 만족하는 방식이다: 복원을
시도하는 **시점**을 스켈레톤 API와 맞추는 대신, 복원이 **성공하는 조건**(충분한 높이)을
직접 관찰해 스켈레톤의 존재 자체를 무관하게 만들었다.

### 2.5 무한 스크롤 엣지 케이스 — "20개만 남았는데 5,000px 복원"

이 상황은 두 경로로 나뉜다.

1. **React Query 캐시가 아직 따뜻함(일반적인 경우)**: §1.2에서 `gcTime`을 10분으로 올렸으므로,
   목록 상세로 들어갔다가 몇 분 안에 돌아오면 `useInfiniteQuery`의 `data.pages`가 이미 이전에
   불러온 페이지 전부(예: 3페이지 × 20개 = 60개)를 메모리에 가진 채로 리마운트된다. 네트워크
   왕복 없이 첫 렌더부터 `scrollHeight`가 충분히 크므로 `restoreWhenTallEnough`의 첫
   `tryRestore()` 호출에서 바로 성공한다.
2. **캐시가 비었음(오래 이탈했거나 `gcTime`이 지남)**: 목록은 첫 페이지(20개)만 렌더되고,
   `restoreWhenTallEnough`는 `ResizeObserver`로 대기하다가 `RESTORE_TIMEOUT_MS`(1.5초) 안에
   목표에 도달하지 못하면 **그 시점 도달 가능한 최댓값으로 클램프**한다 — 즉 목록 맨 아래로
   스크롤하고 멈춘다. "5,000px까지 자동으로 계속 `fetchNextPage()`를 반복 호출해 강제로
   따라잡는" 방식은 **의도적으로 채택하지 않았다** — 사용자가 스크롤을 재개하면 어차피
   `useInfiniteScroll`(`use-infinite-scroll.ts`)이 자연스럽게 다음 페이지를 이어 받으므로,
   복원 로직이 대신 수십 페이지를 미리 당겨오는 것은 불필요한 네트워크 비용과 복잡도만
   더한다(트레이드오프: 정확한 위치 복원을 100% 보장하지 못하지만, 실패 시에도 "맨 위로
   리셋"보다 훨씬 덜 어색하고 구현이 단순하다).

### 2.6 데스크톱/모바일 통일과 "새 진입엔 복원 금지"

`getScrollElement()`의 `matchMedia('(min-width: 1024px)')` 분기가 `desktop/_shell.css:27-90`의
동일 breakpoint와 맞물려 데스크톱에서는 `window`, 모바일/태블릿에서는 `.tm-scroll-area`를
스크롤 대상으로 삼는다 — 두 모드를 하나의 함수로 추상화했으므로 §2.3의 나머지 로직은 어느
쪽인지 몰라도 된다.

"새 진입(앞으로 가기 포함)에는 복원하면 안 된다"는 §2.2의 `navTypeRef`가 기본값을
`'push'`로 유지하는 것으로 보장된다 — `popstate`가 명시적으로 발화한 경우에만 `'pop'`으로
바뀌고, 적용 직후 다시 `'push'`로 리셋된다. 브라우저의 "앞으로 가기"도 `popstate`를 발화하므로
이 구현은 사실 뒤로/앞으로를 구분하지 않고 **둘 다 "히스토리 탐색"으로 취급해 복원을
시도한다** — 이는 의도된 동작이다: 앞으로 가기로 도달한 라우트도 이전에 그 라우트를 방문했던
적이 있다면(즉 `sessionStorage`에 저장된 값이 있다면) 그 위치로 복원하는 것이 사용자 기대와
맞다. "새 진입"이란 히스토리 탐색이 아닌 **모든** pathname 변경(클릭한 링크, 프로그램적
리다이렉트)을 의미하며, 그 경우엔 애초에 `sessionStorage`에 해당 라우트의 저장값이 없거나
있어도 `push`로 분류돼 top=0으로 리셋된다.

### 2.7 다루지 않은 것 (미결 §8 참고)

- 데스크톱↔모바일 브레이크포인트를 넘나드는 **뷰포트 리사이즈**(폴더블·아이패드 멀티태스킹)
  중 스크롤 리스너 재부착은 이번 스코프에서 제외했다 — `[pathname]` 의존성이라 리사이즈만으로는
  재평가되지 않는다. 네이티브 웹뷰 셸의 실제 뷰포트는 거의 고정폭이라 영향이 낮다고 판단했다.

### 2.8 테스트 전략

- `readScrollPosition`/`saveScrollPosition`/`MAX_ENTRIES` 캡 로직은 순수 함수라 유닛 테스트로
  고정(30개 초과 시 가장 오래된 항목 제거, 손상된 JSON에서 빈 맵 폴백).
  `restoreWhenTallEnough`는 `ResizeObserver`를 모킹해 "즉시 충분", "지연 후 충분",
  "타임아웃까지 부족 → 클램프" 세 케이스를 검증한다(불가피한 브라우저 API mock — 글로벌 규칙 3 예외).
- 실제 스크롤 동작은 유닛 테스트가 못 잡으므로(글로벌 규칙 4) Wave 3 완료 보고 전 **라이브
  스크린샷/조작 검증** 필수: 목록 스크롤 → 상세 진입 → 뒤로가기 시 위치 복원, 새 목록 진입 시
  top=0.

---

## 3. 정적 에셋 서비스워커

### 3.1 `sw-push.js`를 확장한다 — 별도 파일을 만들지 않는 이유

`apps/v1_web/src/hooks/use-v1-push-registration.ts:132`가
`navigator.serviceWorker.register('/sw-push.js')`를 **scope 미지정**으로 호출한다 — scope
미지정은 파일 위치 기준 기본값(`/`, origin 전체)이 된다. 같은 origin의 같은 scope(`/`)에
새 SW 파일을 등록하려는 시도는 **나중 등록이 이전 등록을 완전히 교체**한다(한 scope에는
활성 SW가 하나뿐이라는 것이 스펙이다) — 별도 `/sw-cache.js`를 등록하면 `sw-push.js`가
사라지고 푸시 알림이 죽는다. 하위 scope(`/static/`)로 등록해 충돌을 피하는 방법도 있지만,
캐싱 대상 정적 에셋이 `/fonts`, `/brand`, `/_next/static` 등 여러 최상위 경로에 흩어져 있어
하위 scope로는 원하는 요청을 가로챌 수 없다(SW의 fetch 가로채기는 그 scope 하위 경로에서
시작된 요청에만 적용된다). **결론: `sw-push.js` 자기 자신에 `install`/`activate`/`fetch`
핸들러를 추가하는 것이 유일하게 안전한 공존 경로다.**

### 3.2 캐시 전략

| 경로 패턴 | 전략 | 이유 |
|---|---|---|
| `/_next/static/*` | cache-first | 콘텐츠 해시 파일명이라 불변 — 캐시가 낡을 수 없다. |
| `/fonts/*`, `/brand/*`, `/favicon.png` | cache-first + 7일 backstop | 파일명이 안정적(재배포해도 URL 불변) — release-version-watcher 신호(§3.3)가 없는 환경(production)을 위한 시간 기반 안전망 병행. |
| HTML 네비게이션(`request.mode === 'navigate'`) | 절대 캐시 안 함(가로채지 않음) | 배포마다 `/_next/static` 청크 파일명이 바뀐다. 캐시된 옛 HTML이 그 옛 청크 URL을 계속 요청하면, 서버는 새 빌드에서 그 파일을 이미 지웠으므로 **하드 404로 앱이 깨진다** — 단순히 "오래된 화면을 보여주는" 정도가 아니라 로드 자체가 실패하는 심각한 실패 모드다. |
| RSC 페이로드, `/api/*` | 절대 캐시 안 함 | 매 배포마다 바뀌고, `/api/*`는 동적 데이터(뮤테이션 포함) — 캐시하면 오래된 응답을 실제 서버 상태로 오인시킨다. |
| `/uploads/*` | 캐시 안 함(그대로 network) | 사용자 콘텐츠, 개수 무한 증가 가능(캐시 쿼터 위험), 삭제/변경 가능성 있는 동적 데이터에 가깝다. |

**신규 코드 — `apps/v1_web/public/sw-push.js` 상단에 추가** (기존 `push`/`notificationclick`/
`pushsubscriptionchange` 핸들러는 그대로 유지):

```js
// ── 정적 에셋 캐싱 (Wave 3 추가) ──────────────────────────────────────────
// 이 SW 는 원래 푸시 전용이었다. 캐싱을 별도 SW 파일로 추가하면 같은 origin·
// scope('/')에 두 번째 controller 를 등록하려는 시도가 되어 **나중 등록이 이
// 파일을 통째로 교체**한다 — 한 scope 에는 활성 SW 가 하나뿐인 것이 스펙이다.
// 그래서 캐싱 핸들러를 이 파일 자체에 얹는다(app-persistence-optimization.md §3.1).
const STATIC_CACHE_NAME = 'teameet-static-v1'; // 파일명이 안정적인 에셋(폰트·브랜드
  // 이미지 등)을 교체 배포했는데 URL 로는 무효화가 안 될 때, 이 문자열을 수동으로
  // 올리면(v1→v2) 아래 activate 핸들러가 구 캐시를 지운다.
const STATIC_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일 — x-teameet-release
  // 헤더가 없는(=아래 message 무효화가 오지 않는) 환경(production)을 위한 backstop.

const PRECACHE_URLS = [
  '/fonts/PretendardVariable.woff2',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/brand/apple-touch-icon.png',
  '/favicon.png',
]; // public/ 전체가 아니라 실제로 자주 쓰이는 것만 명시적으로 고른다 — mock/ 등 개발용
   // 픽스처는 애초에 포함하지 않는다.

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  // skipWaiting()은 부르지 않는다 — 기존 탭이 갑자기 새 SW 로 전환되면 그 탭의 진행
  // 중이던 fetch 가로채기가 순간 바뀔 수 있다. 새 SW 는 다음 탐색부터 자연스럽게 activate.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('teameet-static-') && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
});

function isStaticAssetRequest(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.png'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // 뮤테이션은 절대 가로채지 않는다.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부 요청(유튜브 썸네일 등) 불간섭.
  if (request.mode === 'navigate') return; // HTML — 위 표의 이유로 캐시 안 함.
  if (url.pathname.startsWith('/api/')) return;
  if (!isStaticAssetRequest(url)) return; // /uploads/* 등 나머지는 그대로 network.

  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        const cachedAt = Number(cached.headers.get('x-teameet-cached-at') ?? 0);
        if (Date.now() - cachedAt < STATIC_CACHE_MAX_AGE_MS) return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) {
          const stamped = new Response(response.clone().body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
          });
          stamped.headers.set('x-teameet-cached-at', String(Date.now()));
          cache.put(request, stamped);
        }
        return response;
      } catch (err) {
        if (cached) return cached; // 네트워크 실패(오프라인 등) — 낡아도 캐시가 최선.
        throw err;
      }
    }),
  );
});

// ── 배포 시 캐시 무효화 (release-version-watcher.tsx 연계, §3.3) ─────────
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'TEAMEET_RELEASE_CHANGED') return;
  event.waitUntil(caches.delete(STATIC_CACHE_NAME));
});
```

이 코드는 참고 구현이다 — 구현 시 실제 SW 테스트 환경(Workbox 미사용, 순수 Cache Storage
API)에서 동작을 재검증할 것.

### 3.3 버전 무효화 — `release-version-watcher.tsx` 연계

`apps/v1_web/src/components/v1-ui/release-version-watcher.tsx:43-47`의 `checkVersion` 함수가
`x-teameet-release` 변경을 감지해 `reload()`하는 지점에 SW 캐시 삭제 메시지를 추가한다:

```tsx
if (release !== baselineRef.current) {
  reloadingRef.current = true;
  setUpdating(true);
  // 새 배포다 — SW 정적 캐시도 함께 버려야 다음 로드가 새 에셋을 받는다. 컨트롤러가
  // 없으면(SW 미등록/미제어) 그냥 넘어간다 — reload() 자체는 항상 실행된다.
  navigator.serviceWorker?.controller?.postMessage({ type: 'TEAMEET_RELEASE_CHANGED' });
  window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
}
```

또한 bfcache(뒤로/앞으로 캐시 — Safari/WebKit도 오래전부터 지원하는 표준 기능, §4.1의
Android `WebSettingsCompat.setBackForwardCacheEnabled`와는 별개)로 복원된 페이지는
`setInterval`이 멈췄다 재개되므로 최대 `CHECK_INTERVAL_MS`(3분)만큼 버전 확인이 지연될 수
있다. `pageshow` + `event.persisted`로 즉시 재확인한다:

```tsx
const onPageShow = (event: PageTransitionEvent) => {
  if (event.persisted) checkVersion();
};
window.addEventListener('pageshow', onPageShow);
// cleanup 에도 removeEventListener('pageshow', onPageShow) 추가
```

이 두 추가 모두 **이 컴포넌트가 alpha 전용으로 no-op되는 기존 범위를 그대로 물려받는다** —
`x-teameet-release` 헤더가 없는 환경(production, 아직 미설정)에서는 `baselineRef`가 계속
`null`이라 `checkVersion` 자체가 아무 것도 안 하므로, SW 캐시 무효화 메시지도 전송되지 않는다.
production은 §3.2의 7일 backstop만으로 방어한다.

### 3.4 등록 시점을 앱 부트스트랩으로 이동

기존 `register()` 호출은 `use-v1-push-registration.ts`의 `subscribe()`(사용자가 "알림
켜기"를 눌러야 실행) 안에만 있다. 정적 캐싱은 푸시 여부와 무관하게 모든 방문자에게
적용돼야 하므로, 별도 신규 컴포넌트로 부트스트랩 시점에 무조건 등록한다:

**신규 파일** `apps/v1_web/src/components/v1-ui/static-cache-bootstrap.tsx`:

```tsx
'use client';
import { useEffect } from 'react';

/**
 * sw-push.js 를 앱 부트스트랩 시점에 등록한다.
 * register()는 같은 URL+scope 에 대해 멱등이라(이미 등록된 스크립트를 다시 등록하면
 * 새 워커를 만들지 않고 기존 등록을 반환한다) use-v1-push-registration.ts 의 기존
 * register() 호출과 공존해도 안전하다 — 그 파일은 손대지 않는다.
 */
export function StaticCacheBootstrap() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-push.js').catch(() => {
      // 등록 실패는 조용히 넘어간다 — 정적 캐싱은 순수 최적화이고, 실패해도 앱은
      // 평소대로(네트워크 직행) 동작한다.
    });
  }, []);
  return null;
}
```

`layout.tsx`에 추가:

```tsx
<RouteProgressBar />
<ReleaseVersionWatcher />
<ScrollRestoration />
<StaticCacheBootstrap />
<Providers>{children}</Providers>
```

### 3.5 푸시가 죽지 않는다는 것을 검증하는 방법

1. **구독 영속성**: Push 구독은 SW **등록(registration, scope 단위)**에 묶이지 그 순간 활성인
   스크립트 버전에는 묶이지 않는다 — `install`/`fetch` 핸들러를 추가해도 scope(`/`)를 바꾸지
   않는 한 기존 구독은 그대로 유효하다. 배포 후 `pushManager.getSubscription()`이 여전히
   값을 반환하는지 확인.
2. **회귀 스모크**: `notificationclick`(기존 탭 재사용/`openWindow` 폴백)과
   `pushsubscriptionchange`(재구독 → 서버 갱신) 핸들러는 이번 변경에서 건드리지 않지만, 같은
   파일을 편집하므로 실수로 손상되지 않았는지 수동 트리거로 확인한다.
3. **alpha 실측**(`CLAUDE.md` 운영 워크플로 규칙 7): SW lifecycle(특히 `activate` 시점 구
   캐시 정리)은 환경 의존적이므로 로컬 포렌식에 매몰되지 말고 dev 머지 → alpha 배포 후 실제
   iOS/Android 빌드에서 재확인한다.

---

## 4. 네이티브 셸

### 4.1 Android (`apps/v1_android/app/src/main/java/kr/co/teameet/MainActivity.java`)

| 항목 | 결정 | 근거 |
|---|---|---|
| `setCacheMode` | **변경 안 함**(현행 `LOAD_DEFAULT` 암묵 유지) | `LOAD_CACHE_ELSE_NETWORK`는 리소스 타입을 구분하지 못하는 blunt 정책이라, §3의 SW가 정밀하게 배제하는 HTML/RSC/`/api/*`까지 함께 캐시-우선으로 만들어 "배포했는데 구버전이 뜬다"를 직접 유발할 수 있다. `LOAD_DEFAULT`는 이미 Next.js가 내려주는 `Cache-Control`을 표준 HTTP 시맨틱으로 존중한다 — 캐싱 강화는 §3의 SW(리소스 타입 인지)가 맡는다. |
| `WebSettingsCompat.setBackForwardCacheEnabled` | **활성화** | `androidx.webkit:webkit:1.17.0`(`build.gradle.kts:100`)이 요구 버전(≥1.13.0)을 충족한다. 인앱 SPA 전환(`pushState` 기반)에는 영향 없고(같은 문서 로드 안에서의 히스토리 변경이라 WebView 레벨 탐색이 아님), **origin 밖으로 나갔다 돌아오는 경우**(카카오/네이버 OAuth 리다이렉트 완료 후 복귀 등)에 즉시 스냅샷 복원을 제공한다. `activate`(§3.2)가 캐시를 스코프별로 관리하므로 "구버전 서빙"과 충돌하지 않는다 — bfcache 스냅샷은 페이지 레벨 상태일 뿐 정적 에셋 캐시와 별개다. |
| `setOffscreenPreRaster` | **설정 안 함** | 이 플래그는 "화면 밖이지만 곧 보일 예정인 WebView"(예: 리스트 안의 여러 WebView)를 미리 래스터화하는 용도다. 이 앱은 **항상 화면에 보이는 WebView 인스턴스 하나**뿐이라 해당 시나리오가 없다 — 켜면 메모리만 추가로 쓰고 체감 이득이 없다. |
| 포그라운드 복귀 시 리로드 방지 | **이미 올바름 — 변경 없음** | `onResume()`(`MainActivity.java:527-532`)은 push 상태 동기화만 하고 WebView를 건드리지 않는다. `onCreate`(`L102-104`)는 `webView.restoreState()` 성공 시 재로드하지 않는다. `onNewIntent`(`L593-600`)는 명시적 route가 있는 intent(FCM/딥링크)에서만 `loadUrl`한다 — 정찰 확인, 수정 대상 아님. |
| `onPause()` 부재(JS 타이머 미정지) | **이번 스코프 아님** | 정찰이 이미 "배터리/성능 최적화이지 모션/지속성과 무관"으로 범위 밖 명시. 이 문서도 동일하게 손대지 않는다 — 별도 후속 과제로 남긴다. |

`setBackForwardCacheEnabled` 적용 위치: `configureWebView()`의 기존 `WebSettings` 블록
(`L192-201`) 바로 아래, `WebViewFeature.isFeatureSupported(WebViewFeature.BACK_FORWARD_CACHE)`
가드로 감싼다. **정확한 메서드 시그니처는 androidx.webkit 1.17.0 레퍼런스로 구현 시점에
재확인할 것** — 이 문서 작성 시점에 공식 문서 페이지를 직접 열람하지 못해(WebFetch가 색인
페이지만 반환) 대략적 형태만 제시한다:

```java
if (WebViewFeature.isFeatureSupported(WebViewFeature.BACK_FORWARD_CACHE)) {
    WebSettingsCompat.setBackForwardCacheEnabled(webView.getSettings(), true);
}
```

### 4.2 iOS (`apps/v1_ios/Teameet/WebShell/`)

| 항목 | 결정 | 근거 |
|---|---|---|
| URLCache 용량 지정 | **스킵 — 공개 API 없음** | `WKWebViewConfiguration`에는 `urlCache` 프로퍼티가 없다(Android의 `WebSettings`와 달리). `WKWebsiteDataStore`는 데이터 **삭제**(`removeData(ofTypes:modifiedSince:)`) API만 제공하고 용량 **지정** API는 없다 — WebKit이 NetworkProcess 안에서 자동 관리한다. 페이지 리소스 캐싱에 대해 앱이 직접 제어할 수 있는 유일한 지점은 §3의 Service Worker다(WKWebView는 iOS 14+에서 SW를 지원). |
| 프로세스 풀(`processPool`) | **낮은 우선순위 — 이번 웨이브 보류** | `grep` 결과 iOS 프로젝트 전체에 `WKWebView(` 인스턴스 생성이 `WebShellViewController.swift` 단 한 곳뿐이고, `ASWebAuthenticationSession`/`SFSafariViewController` 등 별도 WebView 계열 컴포넌트도 없다(OAuth도 같은 WKWebView 안에서 처리). `processPool` 공유는 **여러 WKWebView 인스턴스** 사이의 렌더러 프로세스·쿠키 공유를 위한 것이라, 지금처럼 WKWebView가 하나뿐인 구조에서는 명시적으로 설정해도 체감 효과가 없다. 향후 두 번째 WKWebView(예: 인앱 브라우저)가 생기면 재검토. |
| 수명주기 처리 | **현재 구현이 이미 올바름 — 네이티브 변경 없음** | `observeBackgrounding()`(`WebShellViewController.swift:60-68`)은 `willResignActive`에서만 `persistSession()`을 호출한다. 이는 iOS 수명주기의 표준 지점(백그라운드 전환·인터럽트·Control Center 등 "곧 비활성"이 되는 모든 경로에서 호출됨)이라 이미 올바르다. 앱이 완전히 종료되지 않는 일반적인 백그라운드↔포그라운드 전환에서는 WKWebView 자체가 살아있는 UIView라 JS 힙·DOM·React Query 인메모리 캐시가 그대로 유지되므로, 포그라운드 복귀 시 별도 네이티브 개입이 필요 없다. |

**웹 레이어에서 보완**: §3.3의 `pageshow`/`event.persisted` 추가는 Safari/WebKit의 표준
bfcache 지원(Chromium 전용 Navigation API와 달리 오래전부터 두 엔진 모두 지원)에 기대는
것이라 iOS에도 그대로 적용된다 — 이것으로 "외부 리다이렉트(OAuth) 후 복귀 시 배포 버전
확인"의 웹 쪽 절반은 채워진다.

**온디바이스 검증 필요(§8 미결)**: WKWebView가 iOS 앱의 포그라운드 복귀 시
`visibilitychange`/`focus` DOM 이벤트를 실제로 발화하는지는 정적 코드 읽기로 확인할 수 없다
— `release-version-watcher.tsx`의 기존 리스너가 이 경로에서도 동작하는지 실기기 QA로
확인할 것(표준 WebKit 동작이라 발화할 것으로 예상되나, 확정하지 않는다).

### 4.3 웹만으로 되는 것 vs 네이티브가 꼭 필요한 것

| 개선 | 필요한 작업 위치 | 스토어 심사 필요? |
|---|---|---|
| 정적 에셋 즉시 로드(재방문) | 웹(§3, `sw-push.js`) | 아니오 — SW는 WKWebView(iOS14+)·Android WebView(Chromium 기반) 둘 다 지원 |
| React Query persist(이미 받은 데이터 유지) | 웹(§1) | 아니오 — `localStorage`는 두 WebView 모두 정상 지원 |
| 스크롤 위치 복원 | 웹(§2) | 아니오 |
| 배포 후 구버전 서빙 방지 강화(pageshow) | 웹(§3.3) | 아니오 |
| 외부 리다이렉트 복귀 시 즉시 스냅샷 복원(bfcache) | **Android만** 네이티브(`WebSettingsCompat`) | 예 — Android 앱 업데이트 필요. iOS는 opt-in 스위치 자체가 없어 WebKit이 알아서 관리(추가 작업 불가능하지도, 필요하지도 않음). |

이 웨이브에서 체감 개선의 대부분은 **웹 배포(dev→alpha, 스토어 심사 불필요)만으로 두 플랫폼에
동시 적용된다.** 네이티브 코드 변경이 실제로 필요한 항목은 Android의 bfcache 스위치 하나뿐이다.

---

## 5. 이미지·폰트 최적화

### 5.1 raw `<img>` 9곳 개별 판정

정찰의 "5곳"과 실측 "4곳" 차이: `<Image` 문자열 grep에 `lucide-react`의 `ImagePlus` 아이콘
컴포넌트가 오탐으로 잡혔다 — 실제 `next/image` 사용 파일은 4개(`cover-image-uploader.tsx`,
`competition-card.tsx`, `rich-content-renderer.tsx`, `tournament-sponsor-logo-strip.tsx`)다.

| # | 파일:라인 | 용도 | 소스 | 전환 가능? | 필요 조치 |
|---|---|---|---|---|---|
| 1 | `admin/tournaments/[id]/reviews-tab.tsx:273` | 리뷰 작성자 프로필 사진 | `publicAssetPath(authorProfileImageUrl)` — 업로드 이미지, `/uploads/*` 패턴과 동일 계열 | 가능 | 그대로 전환(같은 origin이라 `remotePatterns` 불필요) |
| 2 | `admin/tournaments/[id]/reviews-tab.tsx:332` | 리뷰 첨부 사진 | 동일 | 가능 | `<a target="_blank">` 래핑 유지, 56×56 고정 |
| 3 | `tournaments/[id]/awards/awards-page-client.tsx:592` | 수상 게시물 **편집 화면**의 사진 첨부 미리보기 | `photoUrls`(업로드 직후 서버 URL인지, 로컬 `blob:` 미리보기인지 **미확인**) | **확인 필요** | `blob:`/`data:` 미리보기라면 `next/image`의 기본 로더가 서버에서 fetch를 시도해 깨진다(`unoptimized` prop으로 우회 가능하나 그러면 최적화 이득이 없음) — 구현 착수 전 `photoUrls` state가 채워지는 시점을 반드시 확인 |
| 4 | `tournaments/[id]/awards/awards-page-client.tsx:679` | 수상 게시물 **뷰어**의 사진(게시 완료된 것) | 서버 저장 URL(확정 게시물이므로) | 가능 | `<a target="_blank">` 래핑 유지 |
| 5 | `v1-ui/brand-logo.tsx:26`(`BrandMark`) | 브랜드 마크, 192w/512w 수동 `srcSet` | 로컬 정적(`/brand/icon-*.png`) | 가능(우선순위 낮음) | 이미 수동 반응형 `srcSet`으로 정상 동작 — 전환은 컨벤션 정리 목적일 뿐 시급성 없음 |
| 6 | `v1-ui/team-avatar.tsx:162` | 팀 로고(없으면 SVG identicon 폴백) | `publicAssetPath(logoUrl)` | 가능(조건부) | `onLoad`로 opacity 0→1 페이드인(깨진 이미지 아이콘 깜빡임 방지, 코드 주석에 이유 명시)하는 기존 동작을 `next/image`의 `onLoad` prop으로 **반드시 재구현** — 없으면 회귀. SVG 폴백 분기(로고 없을 때)는 `<img>`가 아니므로 그대로 둔다 |
| 7 | `tournaments/match-videos.tsx:91` | 유튜브 썸네일 | `youtubeThumbnailUrl()`(`lib/video-utils.ts:33`) → `https://i.ytimg.com/vi/${id}/mqdefault.jpg` | `remotePatterns` 추가 후 가능 | 아래 §5.2 |
| 8 | `tournaments/tournament-campaign-media.tsx:42` | 대회 캠페인 미디어(순수 이미지, 비디오 아님 — 확인됨) | 서버 URL 또는 로컬 `/mock/generated/*.webp` 폴백 | 가능 | 3단계 `onError` 폴백 체인(원본 실패→스포츠별 로컬 이미지→그마저 실패시 숨김)을 `next/image`의 `onError`로 재구현 |
| 9 | `tournament-ops/tournament-ops-shell.tsx:57` | 대회 운영 콘솔 커버 이미지 | 임의 외부 URL 가능성 — 기존 `eslint-disable` 주석이 "도메인 화이트리스트 밖일 수 있다"고 명시 | **전환 보류(현행 유지)** | 이미 의도적으로 내린 결정을 재검토하지 않는다 — 임의 외부 URL을 안전하게 `remotePatterns`로 화이트리스트할 수 없다(관리자가 URL을 직접 입력하는 필드라면 무한히 늘어나는 화이트리스트가 필요해진다) |

### 5.2 `next.config.ts` `images` 설정 신설

현재 `images` 블록 자체가 없다(`remotePatterns`/`domains` 미설정 — 원격 이미지 최적화가
원천 봉쇄된 상태). 위 표의 #7(유튜브)만 외부 호스트가 필요하므로 최소 추가:

```ts
// apps/v1_web/next.config.ts
const nextConfig: NextConfig = {
  // ...기존 설정 유지...
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
  },
};
```

`/uploads/*`(같은 origin, `next.config.ts:92-98` rewrite로 프록시), `/brand/*`·`/fonts/*`
(로컬 정적)는 같은 origin이라 `remotePatterns` 없이도 `next/image`가 그대로 동작한다.

### 5.3 폰트 로딩 전략

`PretendardVariable.woff2`(2.0MB, `public/` 전체의 절반 이상)는 이미
`layout.tsx:40-46`에서 `rel="preload"` + `crossOrigin="anonymous"`, `globals.css:17-23`에서
`font-display: swap`으로 표준적인 최적화가 돼 있다. **추가 서브셋은 권장하지 않는다** — 한글은
음절 조합이 방대해(Noto Sans KR 등 다른 한글 웹폰트도 통상 서브셋하지 않는 이유와 동일)
의미 있는 크기 절감이 어렵고, 이 앱은 사용자 닉네임·팀명 등 UGC 텍스트가 한글 전반에 걸쳐
나타나므로 부분 서브셋은 깨진 글자 위험이 더 크다. 대신 **§3의 SW cache-first 계층이
"한 번 받으면 재요청 없음"을 보장**해 2MB의 실질적 비용(반복 다운로드)을 없앤다 — 이것이
Pretendard에 대해 이번 웨이브가 취하는 실질적 최적화다.

`Saira Condensed`(Bold/ExtraBold, 각 ~12KB, `globals.css:7147-7158`)는 이미
`unicode-range: U+0000-00FF`로 라틴 숫자 전용 서브셋이 적용돼 있다 — 변경 불필요.

### 5.4 `lucide-react` import 방식

134개 import 사이트 전부 named import(`import { X } from 'lucide-react'`)이고,
`next.config.ts:57`의 `experimental.optimizePackageImports`에는 `'@tanstack/react-query'`만
있다. `'lucide-react'`를 추가한다:

```ts
experimental: {
  optimizePackageImports: ['@tanstack/react-query', 'lucide-react'],
},
```

이 한 줄만으로 기존 134개 호출부는 **전혀 수정할 필요가 없다** — Next.js가 빌드 시점에 named
import를 자동으로 개별 아이콘 딥 임포트로 변환한다. Next 16이 이미 `lucide-react`류 아이콘
라이브러리를 내장 기본 목록으로 최적화하고 있을 가능성도 있으나(확인 못 함), 명시적으로
추가해 두면 향후 Next 메이저 업그레이드로 기본 목록이 바뀌어도 이 설정이 의존성을 명확히
드러내고 안전하게 유지된다 — 이미 최적화 대상이라면 중복 추가는 무해하다.

---

## 6. 변경 파일 목록 요약

| 파일 | 종류 | 웨이브 섹션 |
|---|---|---|
| `apps/v1_web/package.json` | 의존성 추가(`@tanstack/query-sync-storage-persister`, `@tanstack/react-query-persist-client`) | §1.3 |
| `apps/v1_web/src/lib/query-persist.ts` | 신규 | §1.3 |
| `apps/v1_web/src/app/providers.tsx` | 수정(`QueryClientProvider`→`PersistQueryClientProvider`, 기본값 3종) | §1.2, §1.3 |
| `apps/v1_web/src/lib/query-keys.ts` | 수정(`clearV1IdentityCache`에 localStorage clear 추가) | §1.4 |
| `apps/v1_web/src/lib/scroll-positions.ts` | 신규 | §2.1 |
| `apps/v1_web/src/components/v1-ui/scroll-restoration.tsx` | 신규 | §2.3 |
| `apps/v1_web/src/app/layout.tsx` | 수정(`<ScrollRestoration />`, `<StaticCacheBootstrap />` 추가) | §2.3, §3.4 |
| `apps/v1_web/public/sw-push.js` | 수정(install/activate/fetch/message 핸들러 추가, 기존 push 핸들러 3종 유지) | §3.2, §3.3 |
| `apps/v1_web/src/components/v1-ui/release-version-watcher.tsx` | 수정(SW postMessage + `pageshow` 리스너 추가) | §3.3 |
| `apps/v1_web/src/components/v1-ui/static-cache-bootstrap.tsx` | 신규 | §3.4 |
| `apps/v1_android/.../MainActivity.java` | 수정(`setBackForwardCacheEnabled` 추가) | §4.1 |
| `apps/v1_web/next.config.ts` | 수정(`images.remotePatterns`, `optimizePackageImports`) | §5.2, §5.4 |
| `apps/v1_web/src/app/admin/tournaments/[id]/reviews-tab.tsx` | 수정(2곳 `<img>`→`next/image`) | §5.1 |
| `apps/v1_web/src/app/tournaments/[id]/awards/awards-page-client.tsx` | 수정(1곳, #3 확인 후 조건부) | §5.1 |
| `apps/v1_web/src/components/v1-ui/team-avatar.tsx` | 수정(`onLoad` 페이드인 보존) | §5.1 |
| `apps/v1_web/src/components/tournaments/tournament-campaign-media.tsx` | 수정(`onError` 폴백 체인 보존) | §5.1 |
| `apps/v1_ios/...` | **변경 없음**(§4.2 근거로 스킵) | §4.2 |

---

## 7. 결정 로그 / 트레이드오프

| 결정 | 얻는 것 | 잃는 것(트레이드오프) | 그럼에도 이 선택인 이유 |
|---|---|---|---|
| `refetchOnWindowFocus` 전역 OFF | 포그라운드 복귀마다의 전면 리로딩 제거 | 정말로 focus 시 최신값이 필요한 미래의 새 쿼리가 opt-in을 깜빡하면 잠깐 낡은 값을 보여줄 수 있음 | 현재 실시간성이 필요한 쿼리 전부가 이미 소켓/폴링으로 더 정밀하게 커버됨(§1.2 표) — 전역 옵션은 순비용만 남았었다 |
| `PERSIST_BUSTER`를 배포 신호와 분리 | 매 alpha 배포마다 persist 캐시가 날아가지 않음(웨이브 목적 유지) | Tier-1 응답 타입을 바꾸고 버스터 올리는 걸 개발자가 깜빡하면, 아주 드물게 옛 캐시 값이 새 타입 기대와 어긋날 수 있음 | Tier-1은 스키마 변경 빈도가 가장 낮은 데이터로 신중하게 좁혀 뽑았다(§1.3) — 위험의 발생 빈도 자체가 낮다 |
| Persist 화이트리스트를 매우 좁게(4개 도메인) | `matches` 응답의 `viewer.applicationId` 같은 개인화 필드 유출 위험을 구조적으로 차단 | "이미 받은 데이터 유지" 체감이 마스터데이터·공지·캠페인에 한정되고, 매치/팀 목록처럼 사용자가 가장 자주 보는 화면에는 이번 웨이브에서 적용 안 됨 | 검증 없이 넓히면 Critical 보안 결함(CLAUDE.md) — 좁은 확정 세트로 시작하고 §1.3의 승격 절차로 점진 확장하는 편이 안전(글로벌 규칙 22 skeleton-first) |
| 무한스크롤 복원 실패 시 "재요청 반복"이 아니라 "클램프 후 포기" | 구현 단순, 불필요한 네트워크 비용 없음 | 캐시가 식은 상태로 아주 먼 스크롤 위치에서 뒤로가기하면 정확한 위치가 아니라 "그 시점 도달 가능한 최댓값"에 멈춤 | 사용자가 스크롤을 재개하면 기존 무한스크롤이 자연히 이어받는다 — 완벽한 위치 복원보다 구현 리스크를 낮추는 쪽을 택함 |
| Android `setCacheMode` 미변경 | "배포했는데 구버전 뜬다"를 유발할 수 있는 blunt 정책을 도입하지 않음 | Android 고유의 캐싱 강화 이득은 없음(전부 SW 계층에 위임) | SW가 이미 리소스 타입별로 정밀하게 캐싱하므로 WebView 레벨의 뭉뚱그린 캐시 모드는 위험 대비 이득이 없다 |
| iOS 네이티브 코드 변경 없음(processPool/URLCache 스킵) | 불필요한 네이티브 변경·스토어 심사 없이 이번 웨이브 대부분을 웹 배포만으로 완결 | iOS 전용 캐시 최적화가 이번 웨이브에 포함되지 않음 | 확인 결과 두 API 모두 실질 효과가 없거나(단일 WKWebView) 아예 공개 API가 없음(URLCache) — 없는 지렛대를 만들어내지 않았다 |

---

## 8. 미결 사항 (사용자 확인·후속 검증 필요)

1. **Tier 2 persist 후보 승격 여부**: `publicTeamReviews`, `useV1PublicGameRecordsPlayerRecords`는
   응답 타입 미검증 상태로 이번 화이트리스트에서 제외했다. `matches`/`match`는 `V1Match.viewer`
   필드 실측으로 **불가 확정**(추가 검증 불필요, 승격 후보 목록에서도 제외). Tier 2를 이번
   웨이브에서 함께 검증할지, 후속으로 미룰지는 사용자 결정 필요.
2. **Android `WebSettingsCompat.setBackForwardCacheEnabled` 정확한 시그니처**: 이 문서 작성
   시점에 공식 문서 실시간 열람이 제한적이었다 — 구현 착수 시 androidx.webkit 1.17.0 레퍼런스로
   재확인.
3. **iOS `visibilitychange`/`focus` 발화 여부 온디바이스 검증**: WKWebView가 iOS 앱 포그라운드
   복귀 시 이 DOM 이벤트를 실제로 쏘는지 정적 코드로는 확정할 수 없다(§4.2) — 실기기 QA 항목.
4. **`awards-page-client.tsx:592`의 `photoUrls`가 `blob:` 미리보기인지 서버 URL인지**: §5.1 #3 —
   next/image 전환 여부를 좌우하므로 구현 착수 전 확인.
5. **뷰포트 브레이크포인트를 넘나드는 리사이즈 시 스크롤 리스너 재부착**: §2.7에서 낮은
   우선순위로 스코프 제외 — 네이티브 셸의 실사용 패턴상 필요성이 낮다고 판단했으나, 폴더블/
   아이패드 대응이 로드맵에 있다면 재검토 필요.
6. **`gcTime` 개별 상향**: §1.2는 전역 10분으로 시작하고, 무한스크롤 목록(matches/teams 등)에
   더 긴 개별 `gcTime`(예: 30분)이 필요한지는 실측(뒤로가기 시 재요청 빈도) 기반으로 후속
   조정한다 — 20여 개 훅을 이번 문서에서 개별적으로 재단하지 않았다(skeleton-first).
