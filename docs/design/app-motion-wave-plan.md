# 앱 모션·셸 3웨이브 통합 구현 계획

> 세 설계 문서 — `docs/design/app-shell-promotion.md`(셸 승격) ·
> `docs/design/app-motion-system.md`(전환+스켈레톤) ·
> `docs/design/app-persistence-optimization.md`(지속성+최적화) — 를 **한 실행 계획**으로
> 통합한다. 세 문서는 각자 독립적으로 완결돼 있지만, 실제로 병렬 에이전트에게 나눠주려면
> **어느 파일을 누가 언제 건드리는지**가 파일 단위로 정리돼 있어야 한다 — 이 문서가 하는 일이
> 그것이다.
>
> 작성 중 세 설계 문서의 파일 경로·라인 번호를 실제 코드와 전수 대조했고(아래 §0.3),
> 그 과정에서 설계 문서에 없던 사실 5가지를 새로 발견해 이 계획에 반영했다(§0.4).
>
> 이 문서의 작업 단위(§2)는 **다음 워크플로가 그대로 실행**한다. "적절히 처리한다"는
> 문장은 없다 — 정확한 파일 경로가 없는 경우(예: 정찰이 개수만 세고 실제 목록을 남기지
> 않은 176개 loading.tsx 중 다수)는 "grep으로 직접 찾아라"는 명령형 지시로 대체했다.
> 있는 사실을 없는 것처럼 다루지 않는다(추측 금지 — 전역 지침 5).

## 목차

0. [전제와 새로 발견한 사실](#0-전제와-새로-발견한-사실)
1. [아키텍처 결정 — route-chrome을 왜 14개 파일로 쪼갰는가](#1-아키텍처-결정--route-chrome을-왜-14개-파일로-쪼갰는가)
2. [작업 단위 40개](#2-작업-단위-40개)
3. [실행 스케줄 — 배치별 병렬 그룹](#3-실행-스케줄--배치별-병렬-그룹)
4. [웨이브 간 순서 근거](#4-웨이브-간-순서-근거)
5. [테스트 계획](#5-테스트-계획)
6. [롤백 가능성](#6-롤백-가능성)
7. [네이티브 분리](#7-네이티브-분리)
8. [미결 사항](#8-미결-사항)

---

## 0. 전제와 새로 발견한 사실

### 0.1 세 설계 문서의 최종 결정 (재검증하지 않는다)

- **셸 승격**: route-meta는 정적 테이블(`route-chrome.ts`) + 런타임 override(`useShellOverride`,
  `useSyncExternalStore` 기반) 하이브리드. 마운트 지점은 `app/layout.tsx`가 아니라
  `providers.tsx` 내부 `AppShellFrame` 컴포넌트 하나. 이중 셸 가드(`ShellMountedContext`)로
  점진 이행 중 안전망 확보. 44개 페이지의 `<AppChrome>` 자체 호출을 라우트 단위 원자 커밋으로
  걷어낸다.
- **전환+스켈레톤**: `template.tsx` + 수동 `document.startViewTransition()` 채택(Next
  `experimental.viewTransition`은 하드웨어 백버튼을 못 잡아 기각). 셸은 `view-transition-name`으로
  VT에서 배제. 스켈레톤은 기존 두 시스템(`.tm-skeleton` 소비자용 / Tailwind `animate-pulse`
  어드민용)을 7개 taxonomy 그룹에 배정. motion 라이브러리는 Bottom Sheet 1건만 dynamic import로
  채택.
- **지속성+최적화**: React Query `refetchOnWindowFocus` 전역 OFF, `staleTime` 60s·`gcTime` 10분.
  `persistQueryClient`는 master/notices/public/tournament-campaigns 4개 도메인만 화이트리스트
  (matches/match는 `viewer.applicationId` 등 개인화 필드 보유로 명시 배제). 스크롤 복원은
  `sessionStorage`(콜드스타트 시 복원 안 됨을 코드 없이 보장) + `popstate` 기반. 정적 에셋
  서비스워커는 기존 `sw-push.js`를 확장(별도 파일 불가 — scope 충돌). Android만 bfcache
  네이티브 변경 필요, iOS는 코드 변경 없음.

### 0.2 세 웨이브의 매핑

이 문서의 "웨이브"는 **어느 설계 문서에서 나온 작업인지**를 가리키는 라벨이다 — 실행 순서를
강제하는 라벨이 아니다. 실제 실행 순서는 각 작업 단위의 `depends_on`(§2)이 결정한다. 세
설계 문서 스스로 이미 "이 부분은 Wave 1과 무관하게 바로 시작 가능"이라고 명시한 부분들이
있고(motion 문서 §5, persistence 문서 §1/§3/§4/§5), 이 계획은 그 구분을 그대로 살렸다.

| 웨이브 | 설계 문서 | 핵심 산출물 |
|---|---|---|
| 1 | app-shell-promotion.md | route-chrome.ts, shell-override.ts, app-shell-frame.tsx, 44개 페이지 정리 |
| 2 | app-motion-system.md | template.tsx, PageTransitionController, 스켈레톤 7종, BottomSheet |
| 3 | app-persistence-optimization.md | RQ persist, 스크롤 복원, SW 캐싱, 네이티브, 이미지 |

### 0.3 실제 코드와 대조해 확인한 것 (이 문서 작성 중 직접 grep/Read)

- `page.tsx` 182 / `loading.tsx` 6 / `template.tsx` 0 / `layout.tsx` 25 — 정찰 수치와 일치.
- `<AppChrome` 호출: **58개 파일**(`components/v1-ui/shell.test.tsx`의 테스트 픽스처 4곳,
  `app/not-found.tsx`의 영구 예외 1곳 제외하면 실제 마이그레이션 대상은 **56개 파일**).
  세그먼트별 실측 분포: `app/tournaments` 20 · `components/my` 7 · `app/teams` 4 ·
  `app/league-matches` 4 · `components/users` 2 · `components/teams` 2 ·
  `components/team-matches` 2 · `app/team-matches` 2 · `app/matches` 2 · `components/v1-ui` 1
  (shell.test.tsx, 제외) · `components/team-schedules` 1 · `components/search` 1 ·
  `components/reviews` 1 · `components/notices` 1 · `components/matches` 1 ·
  `components/home` 1 · `components/community` 1 · `components/auth` 1 · `app/users` 1 ·
  `app/not-found.tsx` 1(제외) · `app/home` 1 · `app/events` 1.
- `providers.tsx`(51줄) / `layout.tsx`(58줄) / `shell.tsx`(269줄) / `route-progress.tsx`(104줄) /
  `page-skeleton.tsx`(53줄) / `admin-skeleton.tsx`(74줄) / `sw-push.js`(122줄) /
  `next.config.ts`(115줄, `images` 블록 없음 확인) — 전부 설계 문서가 인용한 라인과 실제 내용이
  일치함을 직접 읽어 확인.
- `apps/v1_android/app/build.gradle.kts:100`에 `androidx.webkit:webkit:1.17.0` 존재 확인.
  `apps/v1_ios/Teameet/WebShell/WebShellViewController.swift` 존재 확인.
  `use-v1-push-registration.ts:132`의 `register('/sw-push.js')` 확인.
  `query-keys.ts:214-216`의 `clearV1IdentityCache` 확인(현재 `removeQueries`만 호출, `localStorage`
  clear 없음 — 설계 문서 설명과 일치).

### 0.4 설계 문서에 없던 것 — 이 문서에서 새로 발견해 반영한 사실 5가지

1. **기존 `loading.tsx` 6개가 전부 자체적으로 `<AppChrome>`을 이미 감싸고 있다.**
   `app/home/loading.tsx`·`app/matches/loading.tsx`·`app/team-matches/loading.tsx`·
   `app/teams/loading.tsx`·`app/tournaments/loading.tsx`·`app/tournaments/[id]/loading.tsx`
   전부 `<AppChrome title="..." activeTab="...">`로 `<PageSkeleton/>`을 감싼다. 셸 승격 후
   이 6개도 다른 44곳과 똑같이 자체 AppChrome 호출을 걷어내야 한다(안 그러면 이중 셸 가드가
   상시 발동한다) — 이 작업은 각 세그먼트의 Wave-1 단위에 포함시켰다(§2 U25/U27/U28/U29/U32).
   Wave-2의 loading.tsx 대량 생성(U22~U24)은 원래 설계대로 이 6개를 건드리지 않는다(variant는
   이미 올바르다 — 건드릴 필요가 있는 건 "AppChrome 제거"뿐이고 그건 Wave-1 소관이다).
2. **`SessionFallback`의 실제 위치는 `components/providers/session-entry-gate.tsx`가 아니라
   `apps/v1_web/src/components/auth/session-entry-gate.tsx`다.** 설계 문서(app-shell-promotion.md
   §0/§4 R20)의 경로 표기가 틀렸다 — 직접 열어 확인했다. `SessionFallback`은 이 파일 하나에서
   `<main className="tm-auth-frame">`으로 정의되고, `RequireAuth`(`components/auth/require-auth.tsx:54`)와
   `PendingSocialSignupGate`(`components/auth/pending-social-signup-gate.tsx:66-67`, 2곳)
   총 3개 호출부가 전부 이 함수 하나를 쓴다 — 1곳만 고치면 3곳 다 고쳐진다.
3. **`/my` 루트의 실제 title은 `"마이페이지"`이고, `hasNewNotification`이라는 런타임 override가
   필요하다.** `components/my/my-page.tsx:77`: `<AppChrome title="마이페이지" activeTab="my"
   hasNewNotification={model.hasNewNotification} centerTitle>`. 설계 문서가 `__TODO_CONFIRM__`으로
   남겼던 title은 이걸로 확정하고, 부록에 없던 `hasNewNotification`(런타임 값)과 `centerTitle`
   (정적 값)까지 함께 옮긴다 — U36에 반영.
4. **`components/reviews/reviews-page.tsx`와 `components/team-schedules/team-schedules-page.tsx`는
   단일 세그먼트가 아니라 두 세그먼트에 걸친 교차 파일이다.** `reviews-page.tsx`는
   `app/my/reviews/page.tsx`와 `app/tournaments/[id]/reviews/page.tsx` 양쪽에서 쓰인다(리뷰
   목록/작성/받은리뷰 4개 뷰). `team-schedules-page.tsx`는 팀 일정 상세(`teams` 세그먼트
   URL)뿐 아니라 `activeTab="my"`·`backHref="/my"`인 "내 일정" 뷰(910행)도 갖고 있어 `/my/schedule`
   과도 연결된다. 두 파일 모두 **파일이 하나이므로 유닛도 하나**(U30/U35)로 두고, 그 유닛이
   두 세그먼트 몫의 route-chrome 등록을 동시에 책임진다.
5. **`app/tournaments/[id]/awards/awards-page-client.tsx`는 Wave-1과 Wave-3가 동시에 건드리는
   유일한 파일이다.** Wave-1은 이 파일의 `<AppChrome>` 3곳(975/984/993행)을 제거하고, Wave-3
   `§5.1 #3/#4`는 이 파일의 `<img>` 2곳(592/679행)을 `next/image`로 전환한다. 같은 파일이므로
   두 유닛(U32, U16)을 병렬로 두지 않고 U16이 U32에 의존하도록 체인으로 묶었다(§2).

---

## 1. 아키텍처 결정 — route-chrome을 왜 14개 파일로 쪼갰는가

`app-shell-promotion.md`는 `route-chrome.ts` 단일 파일(130여 항목, 250~350줄 추정)을
기본으로 제안하면서, "400줄 넘게 자라면 `route-chrome/<segment>.ts`로 쪼개고
`route-chrome/index.ts`가 합친다"는 대안을 이미 각주로 인정해 뒀다(§1.5).

이 통합 계획은 **그 대안을 크기가 아니라 병렬-안전성 때문에 처음부터 채택**한다. 이유:
44개 페이지(56개 파일)를 여러 에이전트에게 동시에 나눠주려면 각 에이전트가 **자기만의
새 파일**에만 쓰고 기존 공유 파일은 절대 건드리지 않아야 한다(전역 지침이자 이 과제의
명시적 전제 — "다른 단위와 같은 파일을 동시에 편집하지 않는다"). `route-chrome.ts`가
단일 파일이면 56개 파일을 나눠 옮기는 모든 유닛이 결국 그 한 파일에 자기 라우트 행을
추가해야 해서 병렬성이 전부 사라진다.

**해법**: `route-chrome/` 디렉터리 아래

```
apps/v1_web/src/lib/route-chrome/
  types.ts          — RouteParams / RouteChromeConfig / RouteChromeEntry (신규)
  matcher.ts         — matchPattern / literalSegmentCount / resolveRouteChrome (신규,
                        app-shell-promotion.md §1.4 코드 그대로)
  index.ts            — 위 둘을 재노출 + 아래 14개 fragment를 import해 ROUTE_CHROME_TABLE로 합침
  index.test.ts       — matcher 단위 테스트(app-shell-promotion.md §3.5 그대로)
  fragments/
    home.ts / misc.ts / matches.ts / team-matches.ts / teams.ts / team-schedules.ts /
    league-matches.ts / tournaments-core.ts / tournaments-extra.ts / community.ts /
    reviews.ts / my-home.ts / my-settings.ts / my-secondary.ts
```

**핵심 규칙**: 14개 fragment 파일은 **U02(§2) 한 유닛이 전부 빈 배열(`export const
X_ROUTES: RouteChromeEntry[] = [];`)로 미리 만들고 barrel에 전부 import해 둔다.** 그 뒤
Wave-1의 각 세그먼트 유닛(U25~U38)은 **자기 몫의 fragment 파일 하나만** 채운다 — barrel
(`index.ts`)은 U02 이후 다시는 편집되지 않는다. 이렇게 하면:

- 14개 세그먼트 유닛이 완전히 파일 충돌 없이 병렬 실행된다(각자 새/전용 fragment 파일 하나 +
  자기 소관 페이지 파일들만 건드림).
- `resolveRouteChrome`은 어느 fragment에서 왔는지 상관하지 않고 `ROUTE_CHROME_TABLE`(모든
  fragment 배열의 concat)을 선형 매칭하므로 기능적으로 단일 테이블과 100% 동일하게 동작한다
  — §2.1의 "테이블에 없으면 무영향" 불변식도 그대로 유지된다(빈 배열 = 아직 아무것도
  매칭 안 됨).
- `@/lib/route-chrome`을 import하는 기존 계획(`app-shell-frame.tsx`)은 코드 변경이 필요
  없다 — TS/webpack이 디렉터리를 `index.ts`로 자동 해석한다.

이 결정 자체도 트레이드오프가 있다: 파일이 1개에서 16개(types+matcher+index+14 fragments)로
늘어 "라우트 하나 찾으려면 어느 fragment인지부터 알아야" 하는 탐색 비용이 생긴다. 이건
`route-chrome/index.ts`의 fragment import 목록 자체가 목차 역할을 하도록 주석을 달아
완화한다(각 import 줄에 그 fragment가 담당하는 URL 프리픽스를 적는다).

---

## 2. 작업 단위 40개

**공통 규칙(모든 유닛에 적용, 반복 기술하지 않음)**:
- 커밋은 그 유닛이 만든/수정한 파일만 pathspec으로(전역 지침).
- `<AppChrome ...>{content}</AppChrome>` → `{content}`로 축소할 때, 동적 필드(fetch 의존
  title·floatingSlot·topbarActions·hasNewNotification·success-only desktopHead)가 있으면
  `useShellOverride({...})`를 렌더 최상단(Hooks 규칙 — 조건부 return보다 위)에 추가한다 —
  정확한 판정 기준은 `app-shell-promotion.md §1.9` 표를 따른다.
- 완료 후 `grep -n '<AppChrome' <이 유닛이 다룬 파일들>`이 0건이어야 한다(제거 확인).
- 개별 유닛의 완료 기준은 **구조적 정확성**(tsc/lint/targeted test)까지다. 라이브 스크린샷
  시각 검증은 유닛마다 하지 않고 **웨이브 경계에서 한 번에** 한다(§5, §6 — 전역 지침 24의
  "검증은 변경 크기에 비례" + 이 저장소의 "로컬 next 서버 금지, alpha 배포 후 검증" 규칙을
  함께 따른 결과).

### 2.0 전체 표

| id | wave | 제목 | 의존 |
|---|---|---|---|
| U01 | 0(공통) | 의존성 설치(RQ persist 2종 + motion) | — |
| U02 | 1 | route-chrome 코어 모듈(types+matcher+barrel+14 fragment 스텁) | — |
| U03 | 1 | 셸 마운트 메커니즘(가드+override+AppShellFrame+테스트) | U02 |
| U04 | 1·3 | providers.tsx 통합 개편(AppShellFrame 마운트 + RQ persist 교체) | U03, U06 |
| U05 | 1 | SessionFallback 랜드마크 수정 | — |
| U06 | 3 | query-persist.ts 신규 | U01 |
| U07 | 3 | query-keys.ts clearV1IdentityCache 확장 | U06 |
| U08 | 3 | scroll-positions.ts + scroll-restoration.tsx 신규 | — |
| U09 | 3 | sw-push.js 정적 캐싱 확장 | — |
| U10 | 3 | release-version-watcher.tsx SW 무효화 연동 | — |
| U11 | 3 | static-cache-bootstrap.tsx 신규 | — |
| U12 | 3 | layout.tsx 1차 배선(ScrollRestoration+StaticCacheBootstrap) | U08, U11 |
| U13 | 3 | next.config.ts(images+optimizePackageImports) | — |
| U14 | 3 | Android bfcache 활성화 | — |
| U15 | 3 | 이미지 전환 3건(reviews-tab×2, team-avatar, campaign-media) | — |
| U16 | 3 | 이미지 전환 — awards-page-client.tsx(조건부) | U32 |
| U17 | 2 | useNavigationIntent 신규 + route-progress 리팩터 + AppBackLink 마커 | — |
| U18 | 2 | page-skeleton.tsx 변형 확장(console/auth/form) | — |
| U19 | 2 | admin-skeleton.tsx AdminBoardListSkeleton | — |
| U20 | 2 | globals.css+tokens.css 전환 CSS 일괄 추가 | — |
| U21 | 2 | BottomSheet 컴포넌트(motion) | U01 |
| U22 | 2 | loading.tsx 대량생성 — 소비자/커뮤니티 세그먼트 | U18 |
| U23 | 2 | loading.tsx 대량생성 — admin board 세그먼트 | U19 |
| U24 | 2 | loading.tsx 대량생성 — auth-shell 세그먼트 | U18 |
| U25 | 1 | home 세그먼트 이관 | U04, U05 |
| U26 | 1 | misc(events+notices+search+users) 세그먼트 이관 | U04, U05 |
| U27 | 1 | matches 세그먼트 이관 | U04, U05 |
| U28 | 1 | team-matches 세그먼트 이관 | U04, U05 |
| U29 | 1 | teams 세그먼트 이관 | U04, U05 |
| U30 | 1 | team-schedules(teams+my 교차) 이관 | U04, U05 |
| U31 | 1 | league-matches 세그먼트 이관 | U04, U05 |
| U32 | 1 | tournaments-core(list/detail/schedule/bracket/results/awards/campaigns) 이관 | U04, U05 |
| U33 | 1 | tournaments-extra(apply/my/matches/registrations/reviews) 이관 | U04, U05 |
| U34 | 1 | community(chat+notifications) 이관 | U04, U05 |
| U35 | 1 | reviews(my+tournaments 교차) 이관 | U04, U05 |
| U36 | 1 | my-home(my-page.tsx) 이관 | U04, U05 |
| U37 | 1 | my-settings(my-api-clients.tsx, 대형) 이관 | U04, U05 |
| U38 | 1 | my-secondary(inquiries/leagues/staff-fixtures/tournament-staff/team-contacts/phone-verify) 이관 | U04, U05 |
| U39 | 1 | Wave-1 통합 확인(barrel 최종 점검+골든샘플+not-found 예외 문서화) | U25~U38 전부 |
| U40 | 2 | template.tsx+PageTransitionController 신규 + layout.tsx 2차 배선 | U39, U12, U17, U20 |

### 2.1 U01 — 의존성 설치

**파일**: `apps/v1_web/package.json`(수정, 유일한 npm 의존성 추가 지점 — 이후 어떤 유닛도
package.json을 건드리지 않는다).

**지시**: `dependencies`에 3개 추가 — `@tanstack/query-sync-storage-persister`,
`@tanstack/react-query-persist-client`(`@tanstack/react-query@^5.62.0`과 동일 v5 라인,
persistence 문서 §1.3), `motion`(공식 패키지명, `framer-motion` 아님 — motion 문서 §4.1).
`pnpm --filter v1_web add @tanstack/query-sync-storage-persister
@tanstack/react-query-persist-client motion` 실행 후 lockfile 커밋.

**검증**: `pnpm --filter v1_web exec tsc --noEmit`(새 import 없으므로 무변화 확인).

### 2.2 U02 — route-chrome 코어 모듈

**파일(전부 신규)**: `apps/v1_web/src/lib/route-chrome/types.ts`,
`.../route-chrome/matcher.ts`, `.../route-chrome/index.ts`, `.../route-chrome/index.test.ts`,
`.../route-chrome/fragments/{home,misc,matches,team-matches,teams,team-schedules,
league-matches,tournaments-core,tournaments-extra,community,reviews,my-home,my-settings,
my-secondary}.ts`(14개, 전부 빈 배열 스텁).

**지시**:
1. `types.ts`에 `app-shell-promotion.md §1.3`의 `RouteParams`/`RouteChromeConfig` 그대로 옮기고,
   `RouteChromeEntry = { pattern: string; chrome: RouteChromeConfig }`를 추가한다.
2. `matcher.ts`에 `§1.4`의 `matchPattern`/`literalSegmentCount`/`resolveRouteChrome` 코드를
   그대로 옮긴다(단, `ROUTE_CHROME_TABLE`은 이 파일이 아니라 `index.ts`에서 조립 — matcher는
   테이블을 인자로 안 받고 모듈 스코프 상수를 참조하던 원안과 달리, `index.ts`가 export하는
   `ROUTE_CHROME_TABLE`을 import해서 쓰도록 한 겹 분리한다).
3. 14개 fragment 파일 각각에 `export const <SEGMENT>_ROUTES: RouteChromeEntry[] = [];`
   (예: `export const HOME_ROUTES: RouteChromeEntry[] = [];`) 한 줄 + 상단 주석으로 "이 fragment는
   U25가 채운다"처럼 담당 유닛 id를 적어 둔다(다음 사람이 왜 비어 있는지 헷갈리지 않도록).
4. `index.ts`가 14개 fragment를 전부 import하고 `export const ROUTE_CHROME_TABLE = [
   ...HOME_ROUTES, ...MISC_ROUTES, ... ]`로 concat, `export { resolveRouteChrome } from
   './matcher'`(matcher가 `ROUTE_CHROME_TABLE`을 이 index.ts에서 import하는 순환을 피하려면,
   `resolveRouteChrome(pathname)`을 index.ts에 두고 matcher.ts는 순수 `matchPattern`/
   `literalSegmentCount`만 export하는 편이 깔끔하다 — 구현 시 이 형태로 조정해도 된다,
   순환 import만 피하면 됨), `RouteChromeConfig`/`RouteParams` 타입도 재노출한다.
5. `index.test.ts`에 `§3.5`의 매처 테스트를 옮기되, 골든 샘플은 **로컬 테스트 전용 목 테이블**로
   교체한다(진짜 `ROUTE_CHROME_TABLE`은 아직 전부 비어 있으므로) — "세그먼트 수가 다르면
   매치 안 됨" 같은 매처 자체의 순수 로직만 지금 검증하고, 실제 골든 샘플 회귀 테스트는 U39가
   전 세그먼트가 채워진 뒤에 추가한다.

**검증**: `pnpm --filter v1_web exec vitest run src/lib/route-chrome/index.test.ts` +
`pnpm --filter v1_web exec tsc --noEmit`.

### 2.3 U03 — 셸 마운트 메커니즘

**파일**: `apps/v1_web/src/components/v1-ui/shell.tsx`(수정, `ShellMountedContext` 가드만
추가 — 기존 `AppChromeInner` 로직 100% 그대로, `app-shell-promotion.md §2.2` 코드),
`.../shell.test.tsx`(기존 파일에 새 `describe` 블록, `§3.4` 코드), `.../shell-override.ts`(신규,
`§1.6` 코드 그대로), `.../app-shell-frame.tsx`(신규, `§1.8` 코드 그대로 — `import {
resolveRouteChrome } from '@/lib/route-chrome'`가 U02의 `index.ts`를 가리킨다), `.../
app-shell-frame.test.tsx`(신규, `§3.2` 코드 — 단 `vi.mock('@/lib/route-chrome', ...)`로
매처를 목킹하므로 U02의 실제 fragment 내용과 무관하게 독립 실행된다).

**지시**: 4개 코드 블록을 각 설계 문서 섹션에서 그대로 옮긴다 — 이 유닛은 순수 이식이고
새로운 설계 판단이 없다. 유일한 주의점: `shell.tsx`의 가드는 "이 변경 자체는 0-위험 단독
커밋"(§2.2 원문)이므로 U04보다 먼저 랜드해도 무방하지만, 이 계획에서는 같은 유닛(U03) 안에서
override/frame과 함께 처리한다(3개 파일이 개념적으로 "셸 마운트 메커니즘" 하나라 쪼개봐야
얻는 병렬성이 없다).

**검증**: `pnpm --filter v1_web exec vitest run src/components/v1-ui/shell.test.tsx
src/components/v1-ui/app-shell-frame.test.tsx` — **이 테스트가 잡는 버그**: 라우트 전환 시
topbar/bottomnav/스크롤영역 DOM이 리마운트되는 회귀(대조군 테스트가 이 기법 자체의 변별력도
증명), 그리고 마이그레이션 도중 이중 셸이 실제로 두 번 그려지는 회귀. `pnpm --filter v1_web
run lint`.

### 2.4 U04 — providers.tsx 통합 개편

**파일**: `apps/v1_web/src/app/providers.tsx`(수정, 이 계획에서 이 파일을 건드리는 **유일한
유닛** — Wave-1의 AppShellFrame 마운트와 Wave-3의 RQ persist 교체가 원래 서로 다른 설계
문서 소관이지만 같은 파일이라 하나로 합쳤다).

**지시**: 두 변경을 한 커밋으로:
1. (Wave 1, `app-shell-promotion.md §1.2`) `import { AppShellFrame } from
   '@/components/v1-ui/app-shell-frame'` 추가, `<PendingSocialSignupGate>` 내부의
   `{children}`을 `<AppShellFrame>{children}</AppShellFrame>`로 감싼다. `<GlobalPopup/>`·
   `<PhoneVerificationRequiredModal/>`는 그대로 형제로 둔다(AppShellFrame 밖).
2. (Wave 3, `app-persistence-optimization.md §1.3`) `QueryClientProvider`를
   `PersistQueryClientProvider`(`@tanstack/react-query-persist-client`)로 교체하고,
   `createV1Persister`/`shouldPersistQuery`/`PERSIST_BUSTER`/`PERSIST_MAX_AGE_MS`를
   `@/lib/query-persist`(U06)에서 import한다. `QueryClient` 생성자의 `defaultOptions.queries`를
   `staleTime: 60_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false`로 바꾼다
   (기존 `staleTime: 30_000, refetchOnWindowFocus: true`에서 변경, `retry: 1`은 유지).
   `persistOptions`는 `§1.3` 코드의 `persister`/`buster`/`maxAge`/
   `dehydrateOptions.shouldDehydrateQuery` 그대로.

**검증**: `pnpm --filter v1_web run lint`. 이 유닛 착수 시점에는 route-chrome 테이블이 아직
비어 있으므로(U25~U38 전부 미착수) `AppShellFrame`은 모든 라우트에서 `children`을 그대로
통과시킨다 — **화면상 아무 변화도 없어야 한다**(§2.1 불변식). 이 무변화 자체가 검증 방법:
alpha 배포 후 아무 페이지나 열어 이전과 픽셀 단위로 동일한지 확인(스크린샷 1장이면 충분,
전수 검증은 U39에서).

### 2.5 U05 — SessionFallback 랜드마크 수정

**파일**: `apps/v1_web/src/components/auth/session-entry-gate.tsx`(수정, §0.4-2에서 확인한
실제 경로 — 설계 문서의 `components/providers/` 표기는 틀렸다).

**지시**: `SessionFallback` 함수의 루트 엘리먼트를 `<main className="tm-auth-frame">`에서
`<div className="tm-auth-frame">`로 1줄 변경. CSS 클래스명·내부 구조는 무변경(`tm-auth-frame`
셀렉터는 태그와 무관하게 동작). **왜 필요한가**: `RequireAuth`(my/chat/notifications 세그먼트의
`layout.tsx`가 씀)가 인증 확인 중 렌더하는 이 컴포넌트가, 셸 승격 후 `AppChrome`의
`<main class="tm-scroll-area">` 안에 중첩된다 — `<main>` 랜드마크가 중복되면 HTML 시맨틱
위반이자 `getByRole('main')` 계열 테스트가 다중 매치로 깨질 수 있다.

**검증**: `pnpm --filter v1_web run lint`. 이 파일을 쓰는 3개 호출부(`require-auth.tsx:54`,
`pending-social-signup-gate.tsx:66,67`) 전부 회귀 없는지 `grep -rn "SessionFallback"
apps/v1_web/src/components/auth`로 호출부 3곳 그대로인지 확인.

### 2.6 U06 — query-persist.ts 신규

**파일**: `apps/v1_web/src/lib/query-persist.ts`(신규), `.../query-persist.test.ts`(신규).

**지시**: `app-persistence-optimization.md §1.3` 코드를 그대로 옮긴다 —
`PERSIST_STORAGE_KEY`/`PERSIST_BUSTER`/`PERSIST_MAX_AGE_MS`/`PERSIST_ALLOWED_DOMAINS`(
`master`/`notices`/`public` 3개, `tournaments`는 `campaigns` 세그먼트만 별도 분기)/
`BLOCKED_SEGMENTS`(`me`/`admin`/`auth`)/`shouldPersistQuery`/`createV1Persister`.

**테스트(신규, 이 저장소 규칙상 반드시 필요 — 보안 성격)**: `shouldPersistQuery`는 순수 함수라
계약을 고정한다 — ① `['v1','master','sports']` 등 4개 허용 도메인 통과 ② `['v1','matches']`/
`['v1','match','m1']` 거부(설계 문서가 `V1Match.viewer` 필드 실측으로 확정한 배제 대상)
③ `['v1','my','profile']`처럼 `me`/`admin`/`auth` 세그먼트를 포함한 임의 키 거부(도메인이
허용 목록에 있어도) ④ `['other','master']`처럼 `v1` 이외 루트 거부 ⑤ `status !== 'success'`인
쿼리 거부. **이 테스트가 잡는 버그**: 화이트리스트가 실수로 넓어져 `viewer.applicationId` 같은
개인화 필드가 `localStorage`에 새는 것 — 이건 CLAUDE.md 기준 Critical 보안 결함이라 전역
지침 24("사소한 변경엔 테스트 생략")의 예외에 해당한다.

**검증**: `pnpm --filter v1_web exec vitest run src/lib/query-persist.test.ts`.

### 2.7 U07 — query-keys.ts clearV1IdentityCache 확장

**파일**: `apps/v1_web/src/lib/query-keys.ts`(수정, 기존 `clearV1IdentityCache` 함수 한 곳만),
기존 `query-keys.test.ts`(수정, 케이스 1개 추가 — 신규 스위트 아님, 전역 지침 24).

**지시**: `app-persistence-optimization.md §1.4` 코드 그대로 — `import {
PERSIST_STORAGE_KEY } from './query-persist'` 추가, 기존 `queryClient.removeQueries({
queryKey: v1Keys.all })` 다음 줄에 `typeof window !== 'undefined'` 가드 안에서
`window.localStorage.removeItem(PERSIST_STORAGE_KEY)`를 try/catch로 감싸 추가. 호출부
5곳(`logout-button.tsx`/`email-login-client.tsx`/`kakao-callback-client.tsx`/
`signup-client.tsx`/`social-signup-client.tsx`/`use-social-signup-exit.tsx`)은 **무변경**.

**검증**: `pnpm --filter v1_web exec vitest run src/lib/query-keys.test.ts`. **이 테스트가
잡는 버그**: 로그아웃/계정 전환 후에도 이전 계정의 persist 스냅샷이 `localStorage`에 남아
다음 기동 시 복원되는 것.

### 2.8 U08 — scroll-positions.ts + scroll-restoration.tsx 신규

**파일**: `apps/v1_web/src/lib/scroll-positions.ts`(신규), `.../scroll-positions.test.ts`(신규),
`apps/v1_web/src/components/v1-ui/scroll-restoration.tsx`(신규) — **이 유닛은 컴포넌트를
만들기만 하고 `layout.tsx`에 배선하지 않는다**(배선은 U12).

**지시**: `app-persistence-optimization.md §2.1`(`scroll-positions.ts`, `sessionStorage` 기반,
`MAX_ENTRIES=30` LRU 근사)과 `§2.3`(`scroll-restoration.tsx` 전체 — `getScrollElement`/
`restoreWhenTallEnough`(`ResizeObserver` 기반, `RESTORE_TIMEOUT_MS=1500`)/`ScrollRestoration`
컴포넌트) 코드를 그대로 옮긴다. `DESKTOP_QUERY = '(min-width: 1024px)'`가
`desktop/_shell.css`의 브레이크포인트와 일치해야 한다는 주석을 유지한다.

**테스트**: `readScrollPosition`/`saveScrollPosition`의 30개 캡·손상된 JSON 폴백을 유닛
테스트로 고정(`§2.8`). `restoreWhenTallEnough`은 `ResizeObserver`를 목킹해 "즉시 충분"/
"지연 후 충분"/"타임아웃까지 부족→클램프" 3케이스(불가피한 브라우저 API mock — 전역 지침 3
예외).

**검증**: `pnpm --filter v1_web exec vitest run src/lib/scroll-positions.test.ts`. 실제 스크롤
동작(리마운트되지 않는 `.tm-scroll-area` 위에서의 복원)은 유닛 테스트로 못 잡으므로 U40 이후
라이브 검증 대상(§5).

### 2.9 U09 — sw-push.js 정적 캐싱 확장

**파일**: `apps/v1_web/public/sw-push.js`(수정, 기존 `push`/`notificationclick`/
`pushsubscriptionchange` 핸들러 3종과 `urlBase64ToUint8Array` 헬퍼는 위치·내용 무변경).

**지시**: `app-persistence-optimization.md §3.2` 코드를 **파일 최상단**(기존 `push` 리스너
앞)에 `STATIC_CACHE_NAME`/`STATIC_CACHE_MAX_AGE_MS`/`PRECACHE_URLS`/`install`/`activate`/
`isStaticAssetRequest`/`fetch` 핸들러로 추가하고, **파일 최하단**(기존
`pushsubscriptionchange` 핸들러 뒤)에 `message` 리스너(`TEAMEET_RELEASE_CHANGED` 수신 시
`caches.delete(STATIC_CACHE_NAME)`)를 추가한다. 캐시 대상은 `/_next/static/*`·`/fonts/*`·
`/brand/*`·`/favicon.png`뿐 — HTML 네비게이션(`request.mode === 'navigate'`)·`/api/*`·
`/uploads/*`는 명시적으로 가로채지 않는다(캐시하면 배포 후 하드 404 위험, §3.2 표 근거).

**검증**: 정적 분석뿐(`node --check apps/v1_web/public/sw-push.js`로 구문 검증 — 이 파일은
빌드 파이프라인 밖의 순수 JS라 vitest 대상이 아니다). 실제 lifecycle 검증(캐시 히트/구버전
정리)은 U40 이후 alpha 실측(§5) — 이 저장소 규칙상 SW는 로컬 포렌식보다 alpha가 ground truth.

### 2.10 U10 — release-version-watcher.tsx SW 무효화 연동

**파일**: `apps/v1_web/src/components/v1-ui/release-version-watcher.tsx`(수정, 기존 43~63행
내부만).

**지시**: `checkVersion` 함수의 `if (release !== baselineRef.current) { ... }` 블록(현재
43~47행) 안, `setUpdating(true)` 다음 줄에
`navigator.serviceWorker?.controller?.postMessage({ type: 'TEAMEET_RELEASE_CHANGED' })`를
추가한다(컨트롤러 없으면 옵셔널 체이닝으로 조용히 스킵, `reload()`는 그대로 실행됨).
같은 `useEffect`(현재 51~56행) 안에 `pageshow` 리스너를 추가한다: `const onPageShow = (event:
PageTransitionEvent) => { if (event.persisted) checkVersion(); }; window.addEventListener
('pageshow', onPageShow);` — cleanup(현재 58~63행)에도 `window.removeEventListener('pageshow',
onPageShow)`를 짝지어 추가한다.

**검증**: `pnpm --filter v1_web run lint`. U09와 파일이 다르므로 병렬 가능하지만, **기능적으로는
짝**(SW가 메시지를 받아야 이 postMessage가 의미가 있다) — 라이브 검증(§5)에서 함께 확인한다.

### 2.11 U11 — static-cache-bootstrap.tsx 신규

**파일**: `apps/v1_web/src/components/v1-ui/static-cache-bootstrap.tsx`(신규).

**지시**: `app-persistence-optimization.md §3.4` 코드 그대로 — `useEffect`에서
`navigator.serviceWorker.register('/sw-push.js')`를 무조건 호출(실패는 조용히 catch). 기존
`use-v1-push-registration.ts`의 `register()` 호출은 **건드리지 않는다**(같은 URL+scope에
대한 멱등 등록이라 공존 안전).

**검증**: `pnpm --filter v1_web exec tsc --noEmit`.

### 2.12 U12 — layout.tsx 1차 배선

**파일**: `apps/v1_web/src/app/layout.tsx`(수정 — 이 계획에서 이 파일을 건드리는 첫 번째
유닛. 두 번째는 U40).

**지시**: `<body>` 안, 기존 `<RouteProgressBar /><ReleaseVersionWatcher />` 다음, `<Providers>`
앞에 `<ScrollRestoration />`(U08)과 `<StaticCacheBootstrap />`(U11) 두 줄을 추가하고 상단
import 2개를 추가한다. 순서는 `ReleaseVersionWatcher` 다음, `Providers` 이전이면 무관(둘 다
`null`을 렌더하는 부수효과 컴포넌트).

**검증**: `pnpm --filter v1_web run lint`. Wave 1이 아직 진행 중이어도 안전 — `.tm-scroll-area`가
리마운트되는 동안에는 스크롤 복원이 그냥 "이득 없음"(§0의 persistence 문서 전제)일 뿐 회귀가
아니다.

### 2.13 U13 — next.config.ts

**파일**: `apps/v1_web/next.config.ts`(수정).

**지시**: `app-persistence-optimization.md §5.2`/`§5.4` — `images: { remotePatterns: [{
protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' }] }` 블록 신설,
`experimental.optimizePackageImports` 배열(현재 `['@tanstack/react-query']`)에
`'lucide-react'` 추가.

**검증**: `pnpm --filter v1_web run build`(이 파일은 vitest 대상이 아니라 실제 Next 빌드로
설정 유효성을 확인하는 게 유일한 실질적 검증 — 무겁지만 전역 지침 24의 "고위험 변경"에
해당하지 않으므로 로컬에서 1회면 충분, 반복 재실행 금지).

### 2.14 U14 — Android bfcache 활성화

**파일**: `apps/v1_android/app/src/main/java/kr/co/teameet/MainActivity.java`(수정,
`configureWebView()`의 기존 `WebSettings` 블록 바로 아래).

**지시**: `app-persistence-optimization.md §4.1` — `WebViewFeature.isFeatureSupported
(WebViewFeature.BACK_FORWARD_CACHE)` 가드 안에서
`WebSettingsCompat.setBackForwardCacheEnabled(webView.getSettings(), true)` 호출.
**정확한 메서드 시그니처는 androidx.webkit 1.17.0 공식 레퍼런스로 구현 착수 시 재확인**
(§8 미결 1번 — 이 세션은 색인 페이지만 확인했다). `setCacheMode`는 변경하지 않는다(현행
`LOAD_DEFAULT` 유지 — SW가 더 정밀한 캐싱 계층을 이미 제공하므로 blunt한 WebView 레벨 정책은
불필요, §4.1 표 근거).

**검증**: Android Studio 빌드(`./gradlew assembleDebug` 등, 이 저장소 CI 범위 밖) + 실기기/
에뮬레이터에서 OAuth 리다이렉트 후 앱 복귀 시 즉시 스냅샷 복원 확인. **네이티브 릴리스
사이클**(§7)이라 웹 PR과 분리.

### 2.15 U15 — 이미지 전환 3건

**파일**: `apps/v1_web/src/app/admin/tournaments/[id]/reviews-tab.tsx`(수정, 2곳),
`apps/v1_web/src/components/v1-ui/team-avatar.tsx`(수정, 1곳),
`apps/v1_web/src/components/tournaments/tournament-campaign-media.tsx`(수정, 1곳).

**지시**: `app-persistence-optimization.md §5.1` 표 #1/#2/#6/#8 — `<img>`를 `next/image`의
`<Image>`로 교체. `team-avatar.tsx`는 기존 `onLoad`로 opacity 0→1 페이드인하는 동작(깨진
이미지 아이콘 깜빡임 방지)을 `next/image`의 `onLoad` prop으로 **반드시 재구현**(없으면 회귀).
SVG identicon 폴백 분기는 `<img>`가 아니므로 그대로 둔다. `tournament-campaign-media.tsx`는
3단계 `onError` 폴백 체인(원본→스포츠별 로컬 이미지→숨김)을 `next/image`의 `onError`로
재구현. `admin/tournaments/[id]/reviews-tab.tsx`의 2곳은 같은 origin(`/uploads/*` 계열)이라
`remotePatterns` 불필요, `<a target="_blank">` 래핑 유지.

**검증**: `pnpm --filter v1_web run lint`. **이 테스트가 아니라 시각 검증이 필요한 이유**:
`onLoad`/`onError` 재구현 누락은 tsc로 안 잡히고 화면에서만 보인다 — U15는 라이브 스크린샷
대상(§5)에 포함한다(팀 로고 없는 팀 카드, 깨진 캠페인 이미지 폴백 화면 각 1장).

### 2.16 U16 — 이미지 전환 — awards-page-client.tsx

**파일**: `apps/v1_web/src/app/tournaments/[id]/awards/awards-page-client.tsx`(수정, 2곳:
592/679행).

**지시**: `§5.1` 표 #3/#4. **679행(뷰어, 게시 완료된 사진)은 그대로 전환** — 서버 저장 URL이
확실하므로. **592행(편집 화면 첨부 미리보기)은 착수 전 `photoUrls` state가 서버 업로드 URL로
채워지는지 `blob:`/`data:` 로컬 미리보기인지 그 파일을 직접 열어 확인한 뒤 결정한다**(§8 미결
4번, 추측 금지 — 전역 지침 5). `blob:`이면 `next/image`의 기본 로더가 서버 fetch를 시도해
깨지므로 `unoptimized` prop으로 우회하거나(최적화 이득 없음을 인지한 채) 이 한 곳만 `<img>`로
남긴다.

**의존**: U32(tournaments-core)가 이 파일의 `<AppChrome>` 3곳을 먼저 제거한 뒤에 진행한다
(같은 파일 — §0.4-5).

**검증**: `pnpm --filter v1_web run lint`. 시각 검증 대상(수상 게시물 편집/뷰어 화면 각 1장).

### 2.17 U17 — useNavigationIntent + route-progress 리팩터 + AppBackLink 마커

**파일**: `apps/v1_web/src/components/v1-ui/use-navigation-intent.ts`(신규),
`.../route-progress.tsx`(수정, 기존 클릭/popstate 캡처 블록을 훅 호출로 치환 — 동작 무변경),
`.../app-back-link.tsx`(수정, `<Link>` 2곳에 `data-nav-back="true"` 추가).

**지시**: `app-motion-system.md §2.2` 코드 그대로 — `useNavigationIntent`가 `kind` 판별
순서(① `.tm-bottom-nav` 안 클릭→`tab` ② `data-nav-back="true"` 클릭→`pop` ③ 그 외 내부
앵커→`push` ④ `popstate`→`pop`)를 갖는다. `route-progress.tsx`는 이 훅을 `useNavigationIntent({
onIntent: () => start() })` 한 줄로 소비하도록 리팩터하고, `start()`/`finish()`/trickle/failsafe
로직은 그대로 둔다.

**검증**: 기존에 `route-progress.tsx`용 테스트가 있으면 그대로 통과해야 한다(순수 추출,
동작 무변경) — `find apps/v1_web/src -iname "route-progress*.test.*"`로 존재 확인 후 있으면
`pnpm --filter v1_web exec vitest run <그 경로>`, 없으면 `pnpm --filter v1_web run lint`만.
라이브 검증: 진행바가 여전히 클릭/뒤로가기에 반응하는지 alpha에서 1회 확인(U40 이후 함께).

### 2.18 U18 — page-skeleton.tsx 변형 확장

**파일**: `apps/v1_web/src/components/v1-ui/page-skeleton.tsx`(수정, 기존 `list`/`detail`
분기 무변경, 3개 분기 추가).

**지시**: `app-motion-system.md §3.2.2~3.2.4` 코드 그대로 — `PageSkeleton`의 `variant` prop
타입을 `'list' | 'detail' | 'console' | 'auth' | 'form'`로 확장하고 각 분기를 추가한다.
`console` 변형의 정확한 픽셀은 이 시점에 실측 안 됨(§8 미결) — 설계 문서 스케치값(연결상태 바
32px + 스코어블록 88px + 액션버튼 3x2 56px)을 그대로 쓰고 구현 후 실제 콘솔 화면과 대조해
필요시 후속 보정.

**검증**: `pnpm --filter v1_web run lint`. 기존 `list`/`detail` 렌더 결과가 바뀌지 않았는지
(추가만 했는지) 시각 확인은 U22 이후 스켈레톤 일괄 검증에 포함.

### 2.19 U19 — admin-skeleton.tsx AdminBoardListSkeleton

**파일**: `apps/v1_web/src/components/admin/admin-skeleton.tsx`(수정, 기존 4개 export
무변경, 신규 export 1개 추가).

**지시**: `app-motion-system.md §3.2.1` 코드 그대로 — `AdminBoardListSkeleton({ rows = 8,
cols = 5 })` 추가(제목 블록 + 필터 버튼 3개 + `AdminTableSkeleton` 재사용, KPI 그리드 없음).
기존 `AdminPageSkeleton`(KPI 포함)은 무변경으로 `admin/page.tsx`(대시보드) 전용으로 남긴다.

**검증**: `pnpm --filter v1_web run lint`.

### 2.20 U20 — globals.css + tokens.css 전환 CSS 일괄 추가

**파일**: `apps/v1_web/src/app/globals.css`(수정, 전부 신규 선택자 추가 — 기존 규칙 무변경),
`apps/v1_web/src/app/tokens.css`(수정, 주석만 — 값 무변경).

**지시**: `app-motion-system.md §2.4`(`tm-page-slide`/`tm-page-fade` keyframe +
`::view-transition-old/new(page-content)` + `data-nav-kind` 분기 + CSS 폴백
`tm-page-fallback-*`), `§2.7`(셸 4종 `view-transition-name` 배제 + z-index 100 그룹),
`§2.8`(`::view-transition-*` 유사요소 전용 `prefers-reduced-motion` 오버라이드) 코드를
`globals.css`에 그대로 추가한다. `tokens.css`에는 `§1.2` 표의 "용도 확장 매핑"을 기존
duration 5종/easing 3종 정의 옆에 주석으로 남긴다(**값은 1도 바꾸지 않는다** — 신규 토큰
0개가 이 문서의 명시적 결론).

**검증**: `pnpm --filter v1_web run lint`(정의 안 된 CSS 토큰 검사가 `scripts/
v1-pattern-check.mjs`에 있음 — 새 규칙이 기존 토큰만 재사용하는지 이 검사가 자동으로
확인해 준다). VT는 U40 전까지 아무 데도 트리거되지 않으므로(어떤 코드도 아직
`startViewTransition`을 호출하지 않음) 이 유닛은 시각적으로 죽은 CSS를 추가하는 것 — 위험 0.

### 2.21 U21 — BottomSheet 컴포넌트

**파일**: `apps/v1_web/src/components/v1-ui/bottom-sheet.tsx`(신규, motion import 없음),
`.../bottom-sheet-motion-body.tsx`(신규, 여기서만 `motion` 패키지 import).

**지시**: `app-motion-system.md §4.1` 코드 그대로 — `bottom-sheet.tsx`는 `lazy(() =>
import('./bottom-sheet-motion-body'))`로 motion 청크를 지연 로드하고, `open=false`면
`null`을 렌더해 아예 마운트 안 함. `bottom-sheet-motion-body.tsx`가 `motion.div drag="y"
dragConstraints dragElastic onDragEnd` + `role="dialog"` `aria-modal="true"` + ESC 핸들러 +
focus trap(`confirm-modal.tsx`/`use-modal-a11y.ts`의 기존 패턴 재사용)을 구현한다. **기존
5개 필터 UI 소비처(`matches-page.tsx` 등)로의 실제 교체는 이 유닛 범위 밖**(§8 미결 3번 —
UI 착수 규칙 A·B·C 3안 대상 여부 판단 필요).

**검증**: `pnpm --filter v1_web run lint`. 컴포넌트만 만들고 아무 데서도 안 쓰므로 번들
영향은 0(dynamic import라 진입점이 없으면 청크 자체가 안 만들어짐) — `ANALYZE=true pnpm
--filter v1_web run build`로 실측(1회, 전역 지침 24의 "고위험 변경 아니면 반복 금지").

### 2.22 U22 — loading.tsx 대량생성: 소비자/커뮤니티 세그먼트

**파일(신규, 다수)**: `app/{home,matches,team-matches,teams,tournaments,league-matches,
my,chat,notifications,notices,events,users,search}/**/loading.tsx` 중 U25~U38이 자체적으로
다루는 **기존 6개**(§0.4-1)를 **제외한 나머지 전부**.

**지시**: 이 유닛은 기계적 생성 작업이다(전역 지침 24 — 사소·기계적 변경은 컨트롤러가 직접
편집). 절차:
1. `find apps/v1_web/src/app -name page.tsx | grep -vE '/(admin|onboarding|login|signup|
   auth|callback|terms|account-deletion|landing|admin-content-preview)/'`로 대상 라우트
   전수 목록을 뽑는다(약 140여 개 예상).
2. 이미 `loading.tsx`가 있는 6개 경로는 제외한다.
3. 각 라우트에 대해 `app-motion-system.md §3.2` 표(list/detail/console/form 그룹 특징 —
   list: 검색/필터 + 카드 목록, detail: 히어로 + 본문 블록, console: 실시간 콘솔류, form:
   멀티스텝 폼)를 기준으로 그 라우트의 실제 페이지 컴포넌트(주로 `-client.tsx`)를 열어
   variant를 판정한다(추측 금지 — 폴더명만으로 단정하지 말고 실제 UI 구조를 5초라도 훑는다).
4. `§3.4`의 3개 예시(`notices/loading.tsx`, `onboarding/sport/loading.tsx`는 U24 소관이므로
   이 유닛에서는 list/detail/console/form 예시만) 형태로 `loading.tsx`를 생성한다:
   ```tsx
   import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
   export default function Loading() {
     return <PageSkeleton variant="list" />; // list/detail/console/form 중 판정값
   }
   ```
5. 같은 라우트의 실제 콘텐츠 루트 엘리먼트(그 라우트가 위임하는 `-client.tsx`의 최상위
   반환 엘리먼트)에 `className="tm-content-enter"`를 추가한다(`§3.3` 1단 — 콘텐츠 마운트 시
   짧은 페이드인, U20이 이미 이 클래스를 정의해 뒀다).

**의존**: U18(console/auth/form variant 존재해야 함 — list/detail만 쓰는 라우트는 이미
있으므로 기술적으로는 U18 없이도 그 부분만 먼저 시작 가능하지만, 한 유닛으로 묶어 순서
혼선을 없앤다).

**검증**: `pnpm --filter v1_web run lint`(신규 파일 전부 유효한 TSX인지). 개수 확인:
생성된 `loading.tsx` 개수 + 기존 6개 + U23(admin) + U24(auth) = `find apps/v1_web/src/app
-name loading.tsx | wc -l`이 182(page.tsx 총수)에 근접해야 한다(정찰의 "static 그룹 ~6곳은
의도적으로 안 만듦"이므로 정확히 182는 아니고 176 안팎).

### 2.23 U23 — loading.tsx 대량생성: admin board 세그먼트

**파일(신규, 다수)**: `apps/v1_web/src/app/admin/**/loading.tsx`(약 30곳, `admin/page.tsx`
1곳 제외).

**지시**: U22와 같은 절차, 단 이 세그먼트는 전부 `AdminBoardListSkeleton`(U19)을 쓴다(대시보드
`admin/page.tsx`만 예외 — `AdminPageSkeleton` 이미 존재 여부 확인 후 없으면 이 유닛에서
`admin/loading.tsx` 1개 추가). `app-motion-system.md §3.2.1`: 각 admin 페이지를 열어 실제로
KPI 그리드가 없는지 확인(있는데 빠뜨리면 레이아웃 튐 재발 — 설계 문서가 8곳 이상만 직접
확인했고 나머지는 미확인으로 남겼다, §8 미결).

**의존**: U19.

**검증**: `pnpm --filter v1_web run lint`. KPI 유무 오판이 나올 수 있는 항목이라 U23 완료 후
admin 화면 스크린샷 대조는 §5 시각 검증에 포함(대표 3~4개 라우트).

### 2.24 U24 — loading.tsx 대량생성: auth-shell 세그먼트

**파일(신규, ~12곳)**: `apps/v1_web/src/app/{onboarding,login,signup,terms,
account-deletion,callback}/**/loading.tsx`.

**지시**: U22와 같은 절차, 전부 `PageSkeleton variant="auth"`(U18) 사용 — 중앙정렬 아이콘 +
제목/부제 2줄 + CTA 1개 골격. 이 세그먼트는 route-chrome 테이블(Wave 1) 대상이 **아니다**
(AppChrome을 원래도 안 씀, §1.4) — `loading.tsx`는 그것과 완전히 별개 축이라 영향 없다.

**의존**: U18.

**검증**: `pnpm --filter v1_web run lint`.

### 2.25~2.38 — Wave-1 세그먼트 이관 14개 (U25~U38)

아래 14개는 전부 같은 패턴을 따른다 — **공통 절차**(`app-shell-promotion.md` 부록 B 10단계를
이 계획의 fragment 구조에 맞게 조정):

1. 나열된 파일들에서 `grep -n '<AppChrome'`로 모든 호출 지점을 다시 확인한다(이 문서의
   §0.3 수치는 스냅샷이다 — 착수 시점에 다른 유닛이 먼저 손대지 않았다면 그대로일 것이다).
2. 분기(loading/error/success)마다 다른 props를 diff해 정적/동적을 가른다 — `§1.9` 표의
   4가지 패턴(fetch 제목/결합 제목/ReactNode 제목/desktopHead 분기)에 해당하면 그 처리를
   따르고, 표에 없는 새로운 분기차를 발견하면 **추측하지 말고** 그 컴포넌트를 직접 열어
   "실수인지 의도인지" 판정한다.
3. 자기 몫의 `fragments/<name>.ts`(U02가 이미 빈 배열로 만들어 둠)에 정적 필드만 담은 행을
   추가한다. `backHref`가 라우트 파라미터를 조합하면 함수형(`(p) => ...`)으로.
4. 동적 필드가 있으면 그 컴포넌트의 success 분기 렌더 함수 최상단(Hooks 규칙 준수)에
   `useShellOverride({...})`를 추가한다.
5. 모든 `<AppChrome ...>{content}</AppChrome>`을 `{content}`로 축소한다.
6. (해당 세그먼트에 U22/U23/U24가 건드리지 않은 **기존** `loading.tsx`가 있으면) 그 파일의
   자체 `<AppChrome>` 래핑도 벗겨내 `<PageSkeleton .../>`만 남긴다(§0.4-1).
7. `pnpm --filter v1_web exec vitest run <이 유닛이 바꾼 테스트 파일들>`로 좁게 검증.
8. `grep -n '<AppChrome' <이 유닛의 파일들>`이 0건인지 확인.

각 유닛의 **파일 목록**과 **이 세그먼트만의 특이사항**:

- **U25 home**: `components/home/home-page.tsx`(1곳, `§1b` floatingSlot 대상 — 정찰의
  `home-page.tsx`가 그 6곳 중 하나), `app/home/loading.tsx`(자체 AppChrome 제거).
  `fragments/home.ts`.
- **U26 misc**(events+notices+search+users): `app/events/page.tsx`(1곳, 정적),
  `components/notices/notices-page.tsx`(2곳, 목록/상세 정적), `components/search/
  search-experience.tsx`(1곳 — **`activeTab`을 절대 넣지 않는다**, `§4 R6`, `shell.tsx:73-75`
  주석 근거), `app/users/[id]/records/user-records-page-client.tsx`(3곳, 동적 제목 —
  "OO 님의 활동 기록" fetch 의존), `components/users/public-profile-client.tsx`(3곳, 정적
  "프로필"), `components/users/player-card-share-client.tsx`(1곳, 정적 "선수 카드").
  `fragments/misc.ts`.
- **U27 matches**: `app/matches/loading.tsx`(자체 AppChrome 제거), `app/matches/[id]/
  applications/client.tsx`(3곳, 동일 정적 props — 신청자 관리), `components/matches/
  matches-page.tsx`(5곳 — 목록 뷰는 `§1b` floatingSlot 대상 + 동적 제목 fallback,
  나머지 필터/생성·수정/완료 화면은 정적). `fragments/matches.ts`.
- **U28 team-matches**: `app/team-matches/loading.tsx`(자체 AppChrome 제거),
  `app/team-matches/[id]/lineup/lineup-client.tsx`(4곳, 동일 정적 props — "라인업"),
  `components/team-matches/team-match-result-client.tsx`(10곳 — **주의**: "경기 결과"/
  "경기 결과 입력"/"경기 결과 승인" 3개 문자열이 `/team-matches/:id/result`와
  `/team-matches/:id/result/approval` 두 URL에 걸쳐 나타난다. 어느 문자열이 어느 URL의
  어느 상태에 대응하는지 **이 파일을 직접 열어 모드/상태 분기를 확인한 뒤** 2개 URL 각각에
  대해 "로딩 시 기본 제목" 행을 만들고 나머지는 override로 처리한다 — `§1.9`의 R7 원칙
  ["문자열이 고정이어도 어느 분기가 렌더될지가 런타임 의존이면 override 대상"]을 그대로
  적용), `components/team-matches/team-matches-page.tsx`(5곳, matches-page.tsx와 동일
  패턴 — 목록 뷰 floatingSlot+동적 제목 fallback). `fragments/team-matches.ts`.
- **U29 teams**: `app/teams/loading.tsx`(자체 AppChrome 제거), `app/teams/[id]/contact/
  settings/team-contact-settings-client.tsx`(1곳, 정적 "컨택 설정"), `app/teams/[id]/records/
  team-records-page-client.tsx`(3곳, 정적 "팀 전적"), `app/teams/[id]/tactics/[gameId]/
  tactics-board-client.tsx`(3곳, 정적 "우리 팀 전술"), `components/teams/teams-page.tsx`
  (6곳 — 목록 뷰 floatingSlot+동적 제목 fallback, 필터/상세/생성수정/멤버관리는 정적),
  `components/teams/team-contact-new-client.tsx`(1곳, 정적 "컨택 보내기"). `fragments/teams.ts`.
- **U30 team-schedules**(teams+my 교차, §0.4-4): `components/team-schedules/
  team-schedules-page.tsx`(8곳 — 목록/상세 뷰(teams 도메인 URL, 일부 desktopHead 분기차는
  `§1.9` 표에서 이미 "동일 패턴"으로 검증됨) + 910행의 "내 일정"(`activeTab="my"
  backHref="/my"`, `/my/schedule` 추정 — 이 파일을 열어 실제 소비 라우트를 `grep -rln
  "TeamSchedulesPage\|team-schedules-page" apps/v1_web/src/app`로 전부 확인한 뒤 등록).
  `fragments/team-schedules.ts`.
- **U31 league-matches**: `app/league-matches/page.tsx`(1곳, 정적 "정규 리그"),
  `app/league-matches/[leagueId]/page.tsx`(1곳, 정적), `app/league-matches/[leagueId]/
  fixtures/[fixtureId]/page.tsx`(1곳, 정적 "리그 경기"), `app/league-matches/[leagueId]/
  awards/page.tsx`(1곳, 정적 "시즌 결산"). 4곳 전부 `activeTab="tournaments"`(대회 탭
  안에서 리그를 표시하는 통합 설계 — `shell.tsx` 상단 주석 근거, 임의 변경 금지).
  `fragments/league-matches.ts`.
- **U32 tournaments-core**: `app-shell-promotion.md` 부록 A의 `TOURNAMENTS_ROUTES` 7개
  패턴(list/detail/schedule/bracket/results/awards/campaigns) 그대로 시드로 쓰고, 실제
  파일은 `app/tournaments/page.tsx`, `app/tournaments/loading.tsx`(자체 AppChrome 제거),
  `app/tournaments/[id]/loading.tsx`(자체 AppChrome 제거), `app/tournaments/[id]/
  tournament-detail-client.tsx`(3곳, 동적 제목 fallback), `app/tournaments/[id]/schedule/
  schedule-page-client.tsx`(3곳, 동적 결합 제목 fallback), `app/tournaments/[id]/bracket/
  bracket-page-client.tsx`(3곳, 정적 "순위·브래킷"), `app/tournaments/[id]/results/
  results-page-client.tsx`(3곳, 정적 "최종결과"), `app/tournaments/[id]/awards/
  awards-page-client.tsx`(3곳, 정적 "시상·리뷰" — **U16이 이 파일에 의존하므로 먼저 완료**),
  `app/tournaments/campaigns/[slug]/page.tsx`(동적 제목 fallback), 그리고 4개
  `not-found.tsx`(campaigns/[id]/schedule/results/bracket/reviews 각각의 not-found —
  `§1.4`의 전역 예외와 달리 이들은 **특정 세그먼트 안의 not-found**이므로 route-chrome
  테이블 대상이다 — `app/not-found.tsx`(전역 404)만 예외임에 유의). `fragments/
  tournaments-core.ts`.
- **U33 tournaments-extra**: `app/tournaments/[id]/apply/tournament-apply-client.tsx`
  (5곳, 정적 "참가 신청"), `app/tournaments/[id]/matches/[fixtureId]/match-page-client.tsx`
  (3곳, 정적 "경기 기록"), `app/tournaments/[id]/my/my-registration-client.tsx`(5곳, 정적
  "내 신청"), `app/tournaments/[id]/registrations/[registrationId]/roster/
  tournament-roster-client.tsx`(3곳, 정적 "선수 명단"), `app/tournaments/[id]/reviews/
  reviews-page-client.tsx`(1곳 — **주의**: 이 파일은 `components/reviews/reviews-page.tsx`와
  다른 파일이다, 이름이 비슷해 혼동 주의). `fragments/tournaments-extra.ts`.
- **U34 community**(chat+notifications): `components/community/community-page.tsx`(3곳 —
  채팅 목록(정적)/채팅방(동적 제목 fallback, `§1b` 대상)/알림(ReactNode 제목 — 안읽음
  카운트 뱃지 + `topbarActions` "모두 읽기" 버튼, `§1b` 대상)). `fragments/community.ts`.
  **U05(SessionFallback 수정) 완료 후 진행 권장** — chat/notifications 둘 다
  `RequireAuth` 산하.
- **U35 reviews**(my+tournaments 교차, §0.4-4): `components/reviews/reviews-page.tsx`
  (4곳 — 리뷰 목록(`/my/reviews`)/리뷰 남기기(`/my/reviews/new`? — 실제 라우트는
  `app/tournaments/[id]/reviews/page.tsx` 등에서 어떻게 진입하는지 파일을 열어 확인)/
  받은 리뷰/에러). `fragments/reviews.ts`.
- **U36 my-home**: `components/my/my-page.tsx`(8곳 — 마이페이지 홈은 **정적 title
  "마이페이지" + 동적 override `hasNewNotification`**(§0.4-3, 새로 발견) + `centerTitle:
  true`, 내 매치/내 팀/받은 초대/보낸 가입 신청/멤버 관리/동적 제목(`model.title`)/약관 및
  정책은 각각 정적 또는 override). `fragments/my-home.ts`. **`app/my/page.tsx`가
  `MyHomePageClient`(`my-api-clients.tsx`)를 거쳐 이 파일의 `MyHomePageView`를 렌더한다 —
  U37과 렌더 경로가 얽혀 있으니 두 유닛 다 완료된 뒤 `/my` 라우트를 통합 시각 검증한다.**
- **U37 my-settings**(대형): `components/my/my-api-clients.tsx`(2560줄, ~20곳 — 프로필
  수정/운동 정보/위치 및 활동 지역/알림 설정(titleAsHeading)/경기 기록 공개/대회 기록
  실명 표시/선수 카드/화면 테마/회원 탈퇴). 전부 정적 title(하드코딩 문자열), 파일이 하나라
  쪼갤 수 없어 이 계획에서 가장 큰 단일 유닛이다 — 착수 전 `grep -c '<AppChrome'
  my-api-clients.tsx`로 정확한 개수를 다시 세고, 뷰 단위(각 `export function`)로 순서대로
  처리한다(한 번에 파일 전체를 열어 두고 뷰마다 커밋을 나눠도 됨 — 단 최종 PR은 이 파일
  하나 기준 원자적으로 올린다, `§2.4`). `fragments/my-settings.ts`.
- **U38 my-secondary**: `components/my/my-inquiries-client.tsx`(5곳, i18n 아님 —
  `§4 R5`에서 이미 하드코딩 한국어 상수임을 확인함, 안심하고 정적 처리), `components/my/
  my-leagues-client.tsx`(1곳, 정적 "내 리그", `activeTab="tournaments"`— 리그가 대회 탭에
  속하는 것과 일관), `components/my/my-staff-fixtures-client.tsx`(1곳, 동적 제목 `{title}`),
  `components/my/my-tournament-staff-client.tsx`(2곳, 정적 "담당 대회 운영"),
  `components/my/my-team-contacts-client.tsx`(4곳, 정적 "팀 컨택함"/"컨택 상세"),
  `components/auth/phone-verification/phone-verify-page-client.tsx`(1곳, 정적 "휴대폰
  본인인증" — `/my/phone-verify`). `fragments/my-secondary.ts`.

**의존**: 14개 전부 `[U04, U05]`. 서로에 대한 의존은 없다 — **완전 병렬 가능**(단, U30이
`team-schedules-page.tsx` 안에서 등록하는 `/my/schedule` 관련 행과 U36/U37/U38이 등록하는
다른 `/my/*` 행이 서로 다른 pathname 패턴이라 겹치지 않는지 U39가 최종 확인).

**검증(공통)**: `pnpm --filter v1_web run lint` + 각 유닛이 바꾼 테스트 파일(있는 경우)
`vitest run`.

### 2.39 U39 — Wave-1 통합 확인

**파일**: `apps/v1_web/src/lib/route-chrome/index.test.ts`(수정, 골든 샘플 대량 추가),
그 외 수정 없음(코드 변경이 아니라 검증 유닛).

**지시**:
1. `grep -rl '<AppChrome' apps/v1_web/src --include='*.tsx' | grep -v -e
   'components/v1-ui/shell.tsx' -e 'components/v1-ui/shell.test.tsx' -e 'app/not-found.tsx'`
   가 **빈 결과**여야 한다 — 이게 Wave 1 완료의 기계적 정의다.
2. `index.test.ts`에 14개 fragment 전부를 아우르는 골든 샘플을 추가한다 —
   `app-shell-promotion.md §3.5`의 스타일로, 특히 **패턴 충돌 가능성이 있는 쌍**을 의도적으로
   테스트한다: `/teams/:id` vs `/teams/new`(정적이 동적을 이겨야 함), `/my` vs
   `/my/inquiries`(세그먼트 수 다름), `/tournaments` vs `/tournaments/campaigns/:slug`
   (세그먼트 수 다름), `/my/schedule`(U30이 등록) vs `/my/settings`류(U37이 등록) 겹침 없음.
3. `app/not-found.tsx`가 여전히 자기 `<AppChrome>`을 직접 렌더하는 영구 예외임을
   `route-chrome/index.ts` 상단 주석에 명시(이미 §1.4/§2.2 성질로 자연히 안전하지만, 다음
   사람이 "왜 여기만 옛날 방식이지"를 다시 조사하지 않도록).
4. `useShellOverride` 호출이 있는 모든 라우트를 한 번씩 alpha에서 열어 제목/탭/backHref/
   floatingSlot이 승격 전과 동일한지 스크린샷 대조(§5).

**검증**: `pnpm --filter v1_web exec vitest run src/lib/route-chrome/index.test.ts` — **이
테스트가 잡는 버그**: 세그먼트 유닛들이 병렬로 작성한 패턴들이 우연히 서로를 오매칭하는
회귀(예: 한 유닛이 `:id` 파라미터 이름을 다른 유닛과 다르게 써서 특이성 정렬이 예상과
다르게 동작하는 경우).

### 2.40 U40 — template.tsx + PageTransitionController + layout.tsx 2차 배선

**파일**: `apps/v1_web/src/app/template.tsx`(신규), `apps/v1_web/src/components/v1-ui/
page-transition-controller.tsx`(신규), `apps/v1_web/src/app/layout.tsx`(수정, 두 번째이자
마지막 편집 — `<PageTransitionController />` 추가).

**지시**: `app-motion-system.md §2.3`(`PageTransitionController`, `MAX_PENDING_MS=150`)과
`§2.9`(`template.tsx` — `viewTransitionName: 'page-content'`) 코드 그대로. `layout.tsx`에는
기존 `<RouteProgressBar />` 옆에 `<PageTransitionController />` 한 줄만 추가(순서 무관).
**이 유닛은 Wave 1이 전부 끝난 뒤에만 착수한다** — 그 전에 하면 아직 자기 AppChrome을 직접
렌더하는 페이지의 셸까지 `template.tsx`의 리마운트+애니메이션 대상이 되어(§5 원문의
"이 wrapper가 AppChrome 전체가 돼버려 셸까지 매 네비게이션마다 리마운트+애니메이션
대상이 된다"), 지금 고치려는 문제가 셸 레벨에서 재발한다.

**검증**: `pnpm --filter v1_web run lint`. 라이브 검증(alpha, §5): 하단 탭 전환이 crossfade만
(슬라이드 없음), push(예: 목록→상세)가 old 24%/new 100% 비대칭 슬라이드, pop(뒤로가기)이
반대 방향, 셸(topbar/bottom-nav)이 전환 중 슬라이드에 끌려가지 않는지, VT 미지원 환경
시뮬레이션(Chrome DevTools에서 `document.startViewTransition` 임시 제거 등)에서 CSS 폴백이
자연스럽게 재생되는지, `prefers-reduced-motion: reduce`에서 전환이 즉시 컷되는지 — 6가지
전부 스크린샷/화면녹화로 확인.

---

## 3. 실행 스케줄 — 배치별 병렬 그룹

의존 그래프(§2.0)를 그대로 위상정렬하면 아래 6개 배치가 나온다. **같은 배치 안의 유닛은
전부 동시에(서로 다른 에이전트에게) 배정해도 파일 충돌이 없다.**

| 배치 | 유닛 | 비고 |
|---|---|---|
| 배치 0 | U01, U02, U05, U08, U09, U10, U11, U13, U14, U15, U17, U18, U19, U20 | 14개, 전부 새 파일이거나 유일 소유 파일 — 최대 병렬 |
| 배치 1 | U03(←U02), U06(←U01), U21(←U01), U22(←U18), U23(←U19), U24(←U18) | 6개 |
| 배치 2 | U04(←U03,U06), U07(←U06), U12(←U08,U11) | 3개 — U04가 이 배치의 병목(providers.tsx 단독 소유) |
| 배치 3 | U25~U38(←U04,U05) | 14개, 완전 병렬 — 이 계획에서 병렬성이 가장 큰 지점 |
| 배치 4 | U16(←U32), U39(←U25~U38 전부) | 2개 |
| 배치 5 | U40(←U39,U12,U17,U20) | 1개 — 전체 계획의 마지막 유닛 |

총 6개 배치로 40개 유닛을 소화한다. 배치 3(세그먼트 이관)이 유닛 수(14개)와 총 작업량
양쪽에서 가장 크므로, 여유 인력이 있다면 배치 0~2를 최대한 빨리 통과시켜 배치 3에 자원을
집중하는 것이 전체 완료 시점을 가장 크게 당긴다.

---

## 4. 웨이브 간 순서 근거

**"웨이브 1이 웨이브 2·3의 전제"라는 명제는 부분적으로만 참이다** — 정확히는 아래와 같다.

**진짜로 웨이브 1 완료를 기다려야 하는 것은 U40 단 하나다.** `template.tsx`가 전역
루트(`app/template.tsx`, 라우트 그룹 분리가 없는 이 저장소 특성상 단일 파일이 182개 라우트
전부에 적용됨)이기 때문에, 단 하나의 라우트라도 아직 자기 `<AppChrome>`을 직접 렌더하고
있으면 그 라우트의 셸까지 `template.tsx`의 전환 애니메이션에 휩쓸린다 — "부분 적용"이
불가능한 전역 스위치라서다. 이게 §2.1의 "테이블에 없는 라우트는 무영향" 불변식과 정반대
성질이라는 점이 중요하다: route-chrome 테이블은 라우트 단위로 점진 적용 가능하지만,
template.tsx는 그럴 수 없다.

**나머지는 전부 웨이브 1과 무관하게 즉시 시작 가능하다** — 세 설계 문서 스스로도 이렇게
결론 내렸다(persistence 문서 §0: "§1(React Query)·§3(SW)·§4(네이티브)·§5(이미지)는 Wave
1/2와 독립적", motion 문서 §5: "Wave 1과 무관하게 바로 시작 가능" 목록). 이 계획은 그
결론을 배치 0/1(§3)에 그대로 반영했다 — U08(스크롤 복원 코드)조차 Wave 1 이전에 배선해도
**안전**하다(단지 `.tm-scroll-area`가 아직 매 전환마다 리마운트돼 "저장할 게 없어 이득이
없을 뿐", persistence 문서 §0 원문). 유일하게 진짜 위험한 조합은 U40을 Wave 1보다 먼저
하는 것뿐이다 — 그래서 이 계획은 그 한 지점에만 하드 게이트를 걸고, 나머지 39개 유닛은
파일 충돌이 없는 한 언제든 시작 가능하게 열어 뒀다.

**웨이브 2/3 "내부"에서도 완전히 순서가 자유롭지 않다** — 예컨대 U16(이미지)은 U32(같은
파일의 AppChrome 제거)를 기다려야 하고, U12/U40은 같은 `layout.tsx`라 순서가 고정된다.
이런 지점은 전부 §2.0 표의 `depends_on`에 명시했다 — "웨이브 번호"가 아니라 "실제로 같은
파일을 만지는가"가 순서를 결정한다는 원칙을 계획 전체에 일관 적용했다.

---

## 5. 테스트 계획

이 저장소 규칙(전역 지침 3·24): **"이 테스트가 깨지면 실제 버그를 잡는가"를 통과하는
것만 쓴다.** 구현을 되읊거나 파일 존재만 확인하는 테스트는 만들지 않는다. 아래는 어느
유닛에 무슨 테스트를 붙이고 왜 붙이는지, 그리고 유닛 테스트로 못 잡는 것(라이브 시각
검증)은 어디서 하는지다.

### 5.1 유닛(자동화) 테스트 — 유닛별로 붙인 것과 잡는 버그

| 유닛 | 테스트 | 잡는 버그 |
|---|---|---|
| U03 | `app-shell-frame.test.tsx` 참조 동일성 검사 + 대조군 | 라우트 전환 시 셸 DOM 리마운트(진단 #1 자체의 반증) |
| U03 | `shell.test.tsx` 이중 마운트 가드 | 마이그레이션 도중 topbar/bottomnav 이중 렌더 |
| U06 | `query-persist.test.ts` (`shouldPersistQuery` 5케이스) | 개인화 필드(`viewer.applicationId` 등)가 localStorage에 새는 것 — Critical 보안 |
| U07 | `query-keys.test.ts` 케이스 1개 추가 | 로그아웃 후에도 이전 계정 persist 스냅샷이 복원되는 것 |
| U08 | `scroll-positions.test.ts` (LRU 캡 + JSON 손상 폴백 + ResizeObserver 3케이스) | 30개 초과 시 무한 증가, 복원 실패 시 무한 대기 |
| U39 | `route-chrome/index.test.ts` 골든 샘플(패턴 충돌 쌍 포함) | 14개 병렬 유닛이 우연히 서로 오매칭하는 라우팅 회귀 |

**나머지 유닛(대다수)에는 신규 테스트를 붙이지 않는다** — 기계적 변경(AppChrome 호출
축소, loading.tsx 생성, CSS 추가, 의존성 설치, config 값 추가)이라 전역 지침 24의
"사소·기계적 변경엔 테스트를 붙이지 않는다" 기준에 정확히 해당한다. 대신 `pnpm --filter
v1_web run lint`(tsc + 합니다체/미정의 토큰/폰트클래스 검사)로 구조적 정확성만 확인한다.

### 5.2 라이브 시각 검증 — 유닛이 아니라 웨이브/배치 경계에서

CLAUDE.md 규칙 4·17("UI 변경 후 라이브 시각 검증 필수", "로컬 next 서버 금지·alpha가
ground truth")과 전역 지침 24("검증은 변경 크기에 비례")를 동시에 만족하려면, **40개
유닛마다 alpha 배포-검증을 반복하지 않는다.** 대신:

- **배치 2 완료 직후**(U04 랜드 시점): 아무 페이지나 1장 스크린샷 — 화면이 승격 전과
  픽셀 단위로 동일한지(§2.1 불변식의 실측 증거).
- **배치 3 완료 직후(U39)**: 14개 세그먼트 각각 대표 라우트 1~2개씩(제목/탭/backHref/
  floatingSlot/동적 override가 실제로 뜨는지) — 총 20장 안팎, 📱390/🖥1440 2폭이면 충분(이
  단계는 레이아웃 자체를 안 바꾸므로 📲768 태블릿 폭은 생략 가능 — 시각 변경이 있는 화면만
  3폭 원칙 적용).
- **U40 완료 직후**: §2.40에 명시한 6가지(push/pop/tab 전환, 셸 비-슬라이드, VT 폴백,
  reduced-motion) — 화면 녹화 위주.
- **U22~U24(스켈레톤) 완료 직후**: 7개 그룹 대표 화면 각 1장 — 특히 U23(board)은 KPI 유무
  오판 가능성이 있어 admin 3~4개 라우트를 반드시 포함.
- **U15/U16(이미지) 완료 직후**: `onLoad`/`onError` 폴백이 실제로 재구현됐는지 — 팀 로고
  없는 카드, 캠페인 이미지 실패 폴백, 수상 게시물 편집/뷰어 각 1장.
- **U09/U10(SW)**: alpha 배포 후 ①`pushManager.getSubscription()`이 여전히 값을 반환하는지
  ②`caches.keys()`에 `teameet-static-*` 캐시가 생기는지 ③새 배포 후 `x-teameet-release`
  변경 시 그 캐시가 지워지는지 — 스크린샷이 아니라 devtools Application 탭 확인.

### 5.3 명시적으로 테스트를 안 붙이는 이유가 있는 항목

- U13(`next.config.ts`)의 `images.remotePatterns`는 유닛 테스트 대상이 아니다 —
  `next build`(§2.13 검증)가 곧 유일한 실질 검증이고, 그 이상은 과잉이다.
- U21(BottomSheet)은 컴포넌트만 만들고 아무 데도 안 쓰므로(§8 미결 3번) 지금 시점에
  상호작용 테스트를 쓰면 "누가 이걸 여는가"가 없는 상태에서 테스트만 존재하는 역전이
  생긴다 — 실제 소비처 배선이 결정된 뒤 그 배선 PR에서 테스트를 추가한다.

---

## 6. 롤백 가능성

### 6.1 웨이브 1

**되돌리기 단위는 세그먼트 유닛(U25~U38) 하나씩이다** — `app-shell-promotion.md §2.5`가
이미 명시한 원자성 그대로: 문제가 생긴 세그먼트의 fragment 파일에서 그 행을 지우고, 그
페이지의 `<AppChrome>` 호출을 되살리는 커밋 하나를 되돌리면(git revert) **그 세그먼트만**
영향받는다. 다른 13개 세그먼트의 fragment나 override 호출은 무관 — fragment를 파일 단위로
쪼갠 이 계획의 구조(§1)가 이 격리를 파일 시스템 레벨에서 보장한다(기존 단일 파일안이었다면
git revert가 다른 세그먼트가 그 사이 추가한 행까지 되돌릴 위험이 있었다).

**U04(providers.tsx의 AppShellFrame 마운트)는 그보다 상위의, 더 무거운 롤백 지점이다** —
이걸 되돌리면 AppShellFrame 자체가 트리에서 사라지므로, **그 시점까지 자기 AppChrome
호출을 이미 제거한 세그먼트들은 셸이 아예 없는 화면이 된다**(부분 마이그레이션 상태에서
U04만 되돌리는 것은 안전하지 않다 — 세그먼트 유닛들도 함께 되돌려야 함). 그래서 U04는
"메커니즘 자체가 근본적으로 잘못됐다"는 게 확인된 극단적 상황에서만 되돌리고, 평상시
회귀는 항상 세그먼트 유닛 단위로 처리한다.

**U03(가드+override+frame 메커니즘)은 U25~U38이 하나도 안 끝난 시점까지는 완전히 무해**하다
— fragment가 전부 비어 있으므로 `resolveRouteChrome`이 항상 `null`을 반환해 어떤 페이지도
영향받지 않는다(§2.1 불변식). 되돌릴 필요조차 잘 없다.

### 6.2 웨이브 2

**U40이 유일한 "큰 스위치"다** — `template.tsx`와 `<PageTransitionController/>`를 되돌리면
전환 애니메이션이 앱 전체에서 즉시 꺼지고, 나머지 인프라(스켈레톤 7종, globals.css의 VT
CSS, useNavigationIntent)는 그대로 남아도 무해하다(호출하는 곳이 없어지면 죽은 코드일
뿐 — 나중에 재도입 시 그대로 재사용 가능). 스켈레톤(U18~U24)은 각 loading.tsx 파일이
독립적이라 문제가 생긴 라우트 하나만 되돌려도 된다.

### 6.3 웨이브 3

**RQ 부분**(U04의 절반)은 되돌리면 `PersistQueryClientProvider`→`QueryClientProvider`,
`staleTime`/`gcTime`/`refetchOnWindowFocus` 기본값 복원 — 코드 레벨에서는 완전히
가역적이다. **단, 이미 브라우저에 `localStorage`로 저장된 persist 스냅샷은 코드를 되돌려도
자동으로 안 지워진다** — 이건 정직하게 밝혀야 할 트레이드오프다(전역 지침 30): 되돌린 뒤에도
과거 버전이 쓰던 캐시가 남아 있을 수 있으므로, 심각한 문제(예: 개인정보 유출 발견)로
되돌리는 상황이라면 `PERSIST_STORAGE_KEY`(`teameet.v1.rq-cache`) 자체를 지우는 후속 배포가
추가로 필요하다.

**SW 부분**(U09)은 되돌려도 **이미 그 SW를 설치한 브라우저에는 즉시 반영되지 않는다** —
서비스워커는 `activate` 시점에만 교체되고, 그마저 `skipWaiting()`을 의도적으로 안 썼으므로
(§2.9 코드 주석) 기존 탭이 닫혔다 다시 열려야 갱신된다. 완전한 롤백을 원하면 되돌리는
코드에서도 `STATIC_CACHE_NAME`을 올려(v1→v2) 구 캐시를 강제로 정리하는 절차가 필요하다.

**네이티브 부분**(U14)은 앱스토어 릴리스 사이클을 거쳐야 사용자에게 적용되므로, "롤백"은
사실상 "다음 릴리스에서 원복"을 의미한다 — 웹처럼 즉시 되돌릴 수 없다(§7).

### 6.4 웨이브별 머지 전략 — 나눠서 vs 한 PR로

**나눠서 머지하는 것이 명백히 안전하다.** 이 저장소는 `dev` 머지 = 즉시 alpha 실배포이고
승인 게이트가 없다(CLAUDE.md). 40개 유닛을 한 PR로 묶으면 배치 3(14개 세그먼트) 중 하나가
문제를 일으켜도 되돌리려면 PR 전체를 되돌려야 해서 나머지 39개의 정상 작업까지 함께
사라진다. 이 계획의 파일-단위 격리(§1, §6.1)가 애초에 "유닛 하나만 되돌릴 수 있다"는 것을
전제로 설계됐으므로, 그 이점을 실제로 누리려면 **유닛(또는 같은 배치 안 몇 개를 묶은 작은
그룹) 단위로 별도 PR·별도 머지**가 맞다. 배치 0/1처럼 서로 무관한 신규 파일들은 여러 개를
한 PR에 묶어도 리스크가 크게 늘지 않지만(어차피 롤백 시 같이 되돌려도 다른 코드에 영향
없음), 배치 3(세그먼트 이관)은 반드시 세그먼트 하나 = PR 하나 원칙을 지킨다.

---

## 7. 네이티브 분리

**웹(U01~U13, U15~U40)과 네이티브(U14)는 분리한다.** 근거:

- **스토어 심사 사이클이 다르다.** Android 앱은 `apps/v1_android`의 자체 릴리스 절차(빌드→
  내부 테스트→스토어 심사→단계적 배포)를 거쳐야 사용자에게 도달한다 — `dev` 머지 즉시
  실배포되는 웹과 완전히 다른 타임라인이다. 같은 PR에 묶으면 웹 변경이 네이티브 심사
  기간만큼 묶여 있거나, 반대로 네이티브 변경만 빠진 채 웹 PR이 머지되는 어색한 상태가 된다.
- **`apps/v1_web`과 `apps/v1_android`/`apps/v1_ios`는 이 모노레포 안에서도 배포 파이프라인이
  분리돼 있다**(웹은 `deploy-alpha.yml`/`deploy.yml`, 네이티브는 각자의 빌드 파이프라인) —
  코드 경계와 배포 경계가 이미 일치하므로 PR 경계도 그에 맞추는 것이 자연스럽다.
- **iOS는 이번 계획에 코드 변경이 아예 없다**(`app-persistence-optimization.md §4.2` —
  `processPool`/`URLCache` 모두 보류/불가 판정, `apps/v1_ios` 파일 변경 0건). 그러므로
  "네이티브 분리"는 실질적으로 **Android 1건(U14)만 별도 PR/브랜치로 뗀다**는 뜻이다.
- 웹 쪽 성과(§0.1 3항목 대부분)는 **네이티브 변경 없이 dev→alpha만으로 두 플랫폼에 동시
  적용된다**(`§4.3` 표) — Android bfcache 하나만 예외이므로, 그 하나 때문에 나머지 39개
  유닛의 배포 속도를 늦출 이유가 없다.

**실행**: U14는 `apps/v1_android` 저장소/브랜치의 자체 워크플로로 별도 PR을 낸다. 이 PR은
이 문서의 다른 어떤 유닛과도 파일을 공유하지 않으므로 순서상 아무 때나(배치 0부터) 착수
가능하고, 머지 시점도 웹 배치들과 독립적으로 결정한다.

---

## 8. 미결 사항

세 설계 문서가 남긴 것 중 **사용자 판단이 필요한 것**만 추린다(단순 확인 누락은 이미
§0.4에서 이 문서가 직접 해소했다 — `/my` title, session-entry-gate.tsx 경로 등).

1. **U21(BottomSheet)을 기존 5개 필터 UI(`matches-page.tsx`/`team-matches-page.tsx`/
   `teams-page.tsx`/`create-form-fields.tsx`/`my-registration-client.tsx`의
   `.tm-filter-sheet`)에 실제로 배선할 것인가?** 컴포넌트 계약은 U21로 완성되지만, 소비처
   교체는 레이아웃/정보구조 변경이라 저장소의 "UI 착수 규칙"(A·B·C 3안 브레인스토밍) 대상
   여부를 먼저 판단해야 한다 — 이 계획은 그 판단을 하지 않고 열어 둔다.
2. **하단탭 pill 슬라이드 CSS 리팩터**(`app-motion-system.md §4.1`의 기각된 motion 대안,
   순수 CSS로 재현 가능하다고 판단됨)를 U40 이후 별도 후속 작업으로 진행할 것인가? `shell.tsx`
   를 다시 건드리는 작업이라(U03 이후) 이 40개 유닛에는 포함하지 않았다.
3. **RequireAuth 산하(my/notifications/chat) 화면의 인증 확인 중 `SessionFallback`이,
   승격 후 처음으로 AppChrome의 topbar/bottomnav 안에서 보이게 된다**(오늘은 풀스크린
   스플래시). U05가 시맨틱 버그(`<main>` 중복)는 고치지만, "로딩 중에도 셸이 유지되는"
   이 체감 변화 자체를 받아들일지, 그 3개 세그먼트만 셸을 억제할지는 제품 판단이 필요해
   그대로 열어 둔다(원 설계 문서의 미결 그대로 승계).
4. **iOS 배포 최소 버전.** View Transitions API는 WebKit에 Safari 18(iOS 18, 2024-09)부터
   있다 — 이 worktree에서 `.pbxproj`/`Info.plist`를 찾지 못해 확인 불가했다(원 설계 문서의
   미결 승계). 낮은 버전을 지원 대상으로 유지한다면 U40의 CSS 폴백 경로 품질 검증(§5.2)에
   더 많은 시간을 배정해야 한다.
5. **브라우저 forward 버튼 오분류**(`useNavigationIntent`/`ScrollRestoration` 둘 다
   `popstate`만으로 뒤로/앞으로를 구분 못 함, 앞으로가기도 "히스토리 탐색"으로 취급해
   복원/pop 애니메이션을 시도)를 `history.state` 인덱스 추적으로 지금 보강할 것인가,
   실사용 데이터가 쌓일 때까지 미룰 것인가(원 설계 문서 2건의 공통 미결 승계).
6. **Tier 2 persist 후보**(`publicTeamReviews`, `useV1PublicGameRecordsPlayerRecords`)를
   U06 범위에서 함께 응답 타입 검증까지 마쳐 화이트리스트에 넣을지, 후속 작업으로 미룰지
   (원 설계 문서 미결 승계 — U06 지시문은 이미 "미검증 후보는 넣지 않는다"로 확정했으므로,
   이건 U06을 다시 여는 후속 작업 여부에 대한 질문이다).
7. **무한스크롤 목록의 `gcTime` 개별 상향**(전역 10분보다 긴, 예: 30분)을 지금 결정할지
   실측(뒤로가기 시 재요청 빈도) 후 결정할지(원 설계 문서 미결 승계) — U04는 전역값만
   확정했다.
8. **뷰포트가 1024px를 넘나드는 리사이즈**(폴더블/아이패드 멀티태스킹) 시 U08의 스크롤
   리스너 재부착을 이 계획에 포함할지, 낮은 우선순위로 계속 제외할지(원 설계 문서 미결 승계).
9. **Android `WebSettingsCompat.setBackForwardCacheEnabled`의 정확한 시그니처**를
   androidx.webkit 1.17.0 공식 레퍼런스로 U14 착수 시점에 재확인 필요(이 세션은 색인
   페이지만 확인, 원 설계 문서 미결 승계).
10. **iOS `visibilitychange`/`focus` 발화 여부**를 실기기 QA로 검증 필요(U10의 전제 —
    정적 코드로는 확정 불가, 원 설계 문서 미결 승계).
