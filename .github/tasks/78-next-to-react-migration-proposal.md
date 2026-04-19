# Task 78 — Next.js → Plain React + Vite Migration (Proposal)

**Status**: Proposal — awaiting decision (NOT a committed task)
**Owner**: project-director + tech-planner
**Created**: 2026-04-18
**Superseded when promoted**: renumber to next available task id (79+) at kickoff

> 본 문서는 기술 제안(proposal)이며, 커밋된 작업(task)이 아닙니다. Section 10의 5가지 open question이 모두 답변된 후에만 task로 승격합니다. 승격 시 번호를 79 이상으로 재부여합니다.

---

## 1. Executive Summary

Teameet 프론트엔드(`apps/web/`)는 이미 **177개 `'use client'` + 0개 server action + 0개 API route + Capacitor static export** 구성으로, 사실상 SPA입니다. Next.js의 핵심 기능 중 실제로 "load-bearing"인 것은 파일 기반 App Router, `next-intl` 플러그인 통합, 개발 프록시, 단 1개의 middleware(루트 경로 분기)뿐입니다.

**권장**: **Option C (Next.js 유지 + 완전 client-side 전환)를 먼저 적용 후 재평가**하십시오. 이유는 (1) 1-3일 소요, (2) 완전 가역적, (3) 팀 재교육 비용 0. "Next.js 프레임워크 자체를 제거"가 명시적 요구가 아니라면 Option B/D는 비용 대비 효용이 낮습니다. 팀 방향이 프레임워크 제거 쪽으로 확정되면 **Option B (Vite + TanStack Router)** 가 파일 기반 라우팅 유지에 가장 부합합니다 (2-3주).

**Key benefit**: Capacitor 모바일 배포 타겟과 프레임워크 가정(무거운 SSR/RSC)이 일치 — 런타임 정신 모델 단순화.
**Key risk**: i18n(next-intl) / middleware / 다크모드 초기 페인트 같은 "크게 안 보이지만 모두 있는" 통합 지점에서 리그레션이 발생할 수 있음.

---

## 2. Why consider this?

Next.js → Vite 이전을 고려하는 실제 동인을 아래에 한정합니다. 근거 없는 "현대화" 같은 수사는 포함하지 않습니다.

1. **Capacitor 모바일 우선 배포 = SPA 타겟이 자연스러움**
   `CAPACITOR_BUILD=true`일 때 이미 `output: 'export'`로 정적 SPA를 산출합니다. Next dev-server의 서버 기능은 Capacitor 빌드에서 완전히 사용되지 않으므로, 프레임워크의 서버 부분은 "개발 프록시 + `rewrites()`" 외에는 죽은 표면입니다.

2. **프레임워크 락인 감소 (Vercel 친화 → framework-agnostic)**
   배포가 자체 Docker(EC2)인 환경에서 Vercel-centric 최적화(edge runtime, ISR 등)의 실익이 없습니다. Vite + React Router/TanStack Router는 어느 정적 호스팅(S3/CloudFront/Cloudflare Pages/자체 nginx)에도 동일하게 배포됩니다.

3. **클라이언트 전용 앱의 정신 모델 단순화**
   "이 컴포넌트가 서버인가 클라이언트인가"를 고민할 필요가 없어집니다. 현재 `'use client'`가 177개라 사실상 "모든 컴포넌트가 클라이언트"이므로, Next가 제공하는 서버/클라이언트 경계 이점은 활용되지 않고 정신적 오버헤드만 남습니다.

4. **개발 서버/HMR 속도**
   Vite는 dev-server + HMR이 Next turbopack 대비 빠른 구간이 존재합니다 (cold start, 대형 HMR). 단, 최근 Next 16의 turbopack은 이 gap을 상당히 좁혔습니다 — 속도 자체만으로 이전을 정당화하기는 약합니다.

5. **프론트엔드 번들에서 서버 전용 의존성 제거**
   Next 코어의 일부 서버 전용 코드 경로가 번들에 포함될 여지가 있습니다. Vite로 가면 번들은 순수 클라이언트 코드만 포함됨이 보장됩니다. (단, 실측 차이는 보통 10% 이하 — 큰 수치적 이득은 기대하지 말 것.)

6. **단순 빌드 파이프라인**
   `next.config.ts`의 5가지 조건 분기(standalone/export/dev, Capacitor, analyzer, webpack fallback, turbopack root)가 `vite.config.ts`의 mode + env 분기로 단순화됩니다.

**포함하지 않은 동인들**(명시적 비동인):
- "Next.js가 싫다" 같은 감정 — 의사결정 근거 아님
- SEO 개선 — 현재 앱은 인증 후 SPA이며 랜딩 페이지만 SEO 대상이므로, 오히려 SSG 필요 시 Option D 하이브리드가 답
- "React 19에 맞추려면" — Next 16도 React 19 지원

---

## 3. What's actually used from Next.js (audit table)

실측된 사용량과 이전 난이도입니다. 난이도는 Low/Medium/High로 표기하며, 각 항목의 대체 방법을 함께 명시합니다.

| Feature | 현재 사용 | 난이도 | 대체 방법 |
|---|---|---|---|
| App Router (파일 기반 라우팅) | 116개 page/layout 파일 | **High** | TanStack Router(파일 기반) or React Router v7(선언 기반) |
| Route groups `(auth)`, `(main)` | 2개 그룹 + 중첩 `settings/{account,privacy,terms,notifications}` | Medium | TanStack: pathless route. React Router: `Outlet` 중첩 |
| `'use client'` 지시어 | 177개 | **Low** | 불필요(모두 삭제). Vite 환경에선 의미 없음 |
| `next/link` | 다수 페이지 (`Link`) | Low | React Router/TanStack: `<Link to="">` 혹은 `<Link href="">` (API 유사) |
| `next/navigation` (`useRouter`/`usePathname`/`useSearchParams`) | 다수 페이지 | Medium | React Router: `useNavigate`/`useLocation`/`useSearchParams`. TanStack: `useNavigate`/`useLocation`/`useSearch` (타입 안전) |
| `next/font/local` | `app/layout.tsx` (Pretendard) | Low | `@fontsource/*` npm 패키지 or 자체 `@font-face` + Vite asset import |
| `next/script` | 일부 (kakao map 등) | Low | `useEffect`로 `document.createElement('script')` 삽입, 또는 `react-helmet-async` |
| `next/image` | **1곳** (`safe-image.tsx`) | **Low** | 네이티브 `<img>` (Capacitor 정적 export에선 Next image가 무의미) |
| `middleware.ts` | 1파일, 1 matcher (`/`) | Low | 루트 `/` 경로의 loader/beforeLoad로 대체 — 이미 `useRequireAuth`가 존재하므로 클라이언트 가드로 흡수 가능 |
| `next-intl` + plugin | 17파일(`useTranslations`/`useLocale` 등 54 호출), `i18n/request.ts` | **Medium** | `react-intl` or `i18next + react-i18next` or `paraglide`. 훅 이름만 다를 뿐 의미는 동등 |
| `next.config.ts` rewrites (API proxy) | 1개 설정(`/api/*`, `/uploads/*`) | Low | `vite.config.ts` `server.proxy` |
| `next.config.ts` redirects (`/register`,`/signup`) | 2개 permanent:false | Low | 라우트 레벨 `redirect()` loader |
| `next.config.ts` output 모드 분기 | export/standalone/dev | Low | Vite는 항상 정적 빌드, `standalone`은 Docker 런타임 필요 없음 |
| `@next/bundle-analyzer` | devDep | Low | `rollup-plugin-visualizer` |
| Turbopack | dev 전용 | — | Vite dev-server가 대체 |
| `optimizePackageImports` | `next-intl`, `@tanstack/react-query` 2개 | Low | Vite는 자동 tree-shaking — 대체로 불필요 |
| API routes (`app/api/`) | **0개** (비어있음) | — | 해당 없음 |
| Server Actions | **0개** (grep empty) | — | 해당 없음 |
| RSC / SSR streaming | 실질 사용 0 | — | 해당 없음 |
| Vitest | 이미 Vite 기반 | — | 그대로 유지 — **가장 큰 이점** |
| MSW (`@/test/msw`) | 설정 완료 | Low | `vitest.setup.ts`만 유지, 변경 없음 |
| Playwright E2E (14 specs) | URL 기반 | — | URL 구조 보존 시 변경 없음 |

---

## 4. Migration Options (trade-offs)

### Option A — Full migration to Vite + React Router v7

**Effort**: **Large (2-3 weeks)**

**What it looks like**:
- `react-router-dom@7` 도입, `createBrowserRouter` + 데이터 API 사용
- 파일 기반 라우팅은 `vite-plugin-pages` 또는 `@react-router/fs-routes` 사용 (v7 프레임워크 모드 아님, 라이브러리 모드만 사용)
- i18n은 `react-intl` 또는 `i18next`
- 빌드는 Vite rollup, dev 프록시는 `server.proxy`

**Pros**:
- React Router v7은 생태계가 가장 넓고, 팀이 익숙할 확률이 높음
- 학습곡선이 TanStack Router보다 완만 (Remix 계열 개념만 알면 됨)
- 데이터 loader/action API가 Next App Router와 개념 대응

**Cons**:
- 파일 기반 라우팅이 플러그인 의존 (`vite-plugin-pages`) — 생태계 지속성 리스크
- 타입 안전(쿼리 파라미터, route param 등)은 수동 정의 필요
- v7 출시 직후라 마이너 API 변경 가능성

### Option B — Vite + TanStack Router

**Effort**: **Large (2-3 weeks)**

**What it looks like**:
- TanStack Router (`@tanstack/react-router`) + Vite plugin
- 파일 기반 라우팅 **정식 지원** (`src/routes/` 디렉토리 → 코드 생성)
- Route loader + beforeLoad + pathless layout(`_layout.tsx`)로 Next `(auth)` / `(main)` 그룹에 1:1 대응
- 이미 `@tanstack/react-query` 사용 중이라 공유 생태계 활용

**Pros**:
- **파일 기반 라우팅 네이티브 지원** — 현재 `app/**/page.tsx` 구조가 `routes/**/*.tsx` 로 거의 1:1 이전 가능
- **타입 안전 최고 수준** — route param, search param, navigation 모두 타입 체크
- loader + React Query 조합이 현재 `hooks/use-api.ts` 패턴과 자연스럽게 맞음
- Next App Router와 의미(nested layout, loader, pending UI) 대응이 가장 직관적

**Cons**:
- TanStack Router 채택 사례가 React Router 대비 적음 — 프로덕션 선례 확인 필요
- 코드 생성 기반(route tree 타입)이라 dev 초기 세팅에 학습 필요
- 팀에 TanStack Query 경험자가 있어도 Router는 별도 개념(route context, matchRoute 등)

### Option C — Stay on Next.js, go pure client-side

**Effort**: **Small (1-3 days)**

**What it looks like**:
- `next.config.ts`의 `output`을 무조건 `'export'`로 설정 (개발 중에도 static export 호환 모드 유지)
- `middleware.ts` 삭제 또는 `/` 경로의 클라이언트 가드로 대체 (이미 `useRequireAuth` 존재)
- `rewrites()`는 Capacitor 빌드 외에서도 유지 가능 (dev 프록시로만 활용)
- `standalone` 모드 제거 — 배포는 이미 Docker/nginx로 정적 파일 서빙
- Next는 계속 사용하되 SSR/middleware/API routes 금지 규칙을 코드리뷰로 강제

**Pros**:
- **최저 리스크** — 코드 구조 변경 0, 재교육 0, 가역성 100%
- App Router/Turbopack/`next-intl` 플러그인 전부 보존
- 빌드 타겟만 통일 → 프레임워크 가정과 실제 사용의 간극 해소
- Capacitor 빌드와 웹 배포의 결과물이 동일해짐 (진단이 쉬워짐)

**Cons**:
- Next.js가 여전히 의존성에 남음 (번들 · CI · 업그레이드 부담)
- "프레임워크 제거"가 동기라면 이 옵션은 해당하지 않음
- middleware 1개 치환이 필요 — 다만 실제 작업은 30분 수준

### Option D — Vite SSG 하이브리드 (Astro / Vite + vike)

**Effort**: **Large (2-3 weeks)**

**What it looks like**:
- 랜딩/about/pricing/guide/faq 페이지는 Astro 또는 vike로 SSG(정적 생성) → SEO 확보
- 인증 후 앱(`/home`, `/matches`, `/chat` 등)은 Option B처럼 Vite SPA
- 두 빌드 결과를 nginx로 경로별 라우팅

**Pros**:
- 랜딩 페이지 SEO가 비즈니스 핵심이면 가장 강력
- 각 영역을 적절한 도구로 분리 (marketing은 SSG, app은 SPA)

**Cons**:
- 툴링 복잡도 급증 — 2개 빌드 파이프라인, 2개 라우팅 모델
- 인증 연결/공통 헤더/i18n 이중화 등 통합 이슈 다수
- SEO 우선순위가 명확하지 않다면 **과잉**

---

## 5. Recommendation

### Default: Option C를 먼저 적용하고 재평가

현재 팀의 즉각적 동기가 **"Capacitor-우선 앱이니까 Next가 과해 보임"** 수준이라면, 가장 합리적인 첫 수는 **Option C**입니다. 이유:

- 1-3일로 끝납니다
- 되돌리기 쉽습니다 (PR 1개 revert)
- 프레임워크 가정(static SPA)과 실제 사용을 정렬합니다
- 재교육 비용이 0입니다
- Option B/D로 갈 준비 기간도 겸합니다 (이 정리 없이 Option B를 시작하면 middleware/SSR 잔재가 이전 중 발목을 잡습니다)

### "Next.js 자체를 제거"가 명시적 목표면 Option B

프로젝트-디렉터가 "스택에서 Next.js를 완전히 빼겠다"로 결정했다면, 현재 파일 구조와 가장 매끄럽게 이어지는 것은 **Option B (Vite + TanStack Router)** 입니다. 근거:

- `app/**/page.tsx` → `routes/**/*.tsx` 이전이 구조적으로 1:1
- 이미 사용 중인 `@tanstack/react-query`와 생태계 공유
- Nested layout · loader · pending UI가 Next App Router와 의미 대응 가장 강함
- 타입 안전이 현재의 `hooks/use-api.ts` 패턴 강화에 직접 기여

### Option A는 다음 조건에서만

- 팀 구성원에 React Router v7(또는 Remix) 프로덕션 경험자가 다수
- TanStack Router 학습/리스크 감수가 부담

### Option D는 랜딩 SEO가 **수익 핵심 지표일 때만**

생활체육 동호인 타겟이라는 사용자 프로파일상 마케팅 진입은 대부분 검색 · 앱스토어 · 공유 링크이므로, 랜딩 SSG의 한계 수익이 작으면 D는 과잉 설계입니다.

### 경고: 절대 반쪽짜리로 가지 말 것

> Option B/A/D 중 하나로 가기로 했다면 **반드시 Phase 4 cutover까지 완주하십시오**. 두 프레임워크를 병렬 유지하는 상태는 유지보수 지옥입니다. 여기서 흔들릴 가능성이 있다면 Option C에 머무르는 편이 낫습니다.

---

## 6. If proceeding with Option B — phased plan

각 phase 종료 지점에서 중단·재개 가능한 경계(safe checkpoint)를 설정합니다. 각 phase는 단독 PR로 처리합니다.

### Phase 1 — Migration prep (1-2 days)

**Goal**: Next 의존성 사용처를 전부 식별하고 치환 가능한 것은 미리 추상화합니다.

- [ ] 전 `next/*` import 인벤토리: `next/link`, `next/navigation`, `next/font/local`, `next/script`, `next/server`(middleware), `next/image`(1곳)
- [ ] 177개 `'use client'` 디렉티브는 일괄 제거 대상 목록만 작성 (삭제는 Phase 3에서)
- [ ] `next/image` 1곳(`components/ui/safe-image.tsx`)을 네이티브 `<img>`로 교체 (이미 Capacitor 빌드에선 `unoptimized: true`이므로 동작 동등)
- [ ] `next.config.ts`의 5개 분기를 문서화: standalone vs export vs dev, 각 분기에서 무엇이 필요한지
- [ ] 서버 컴포넌트 0건 확인 — `async function Page()` 와 top-level `await` 패턴 grep
- [ ] `next-intl` 사용 17파일의 훅 사용 패턴(`useTranslations('namespace')`) 정리 → 대체 라이브러리 선정 (권장: `react-intl`, 메시지 포맷이 가장 가깝고 ICU 호환)
- [ ] 환경변수 prefix 매핑 테이블 작성: `NEXT_PUBLIC_*` → `VITE_*` (`.env*` 수정은 Phase 4에서)

**Exit criteria**: 변경 없는 PR에 가까움. 인벤토리 + 문서만 갱신. 롤백 비용 0.

### Phase 2 — Build system swap (2-3 days)

**Goal**: Vite + TanStack Router 빌드 파이프라인을 `apps/web-vite/`로 **병렬** 구성. 기존 `apps/web/`은 그대로 동작.

- [ ] `apps/web-vite/` 워크스페이스 추가 (`pnpm-workspace.yaml` 업데이트)
- [ ] `vite.config.ts` 작성:
  - React 플러그인(`@vitejs/plugin-react`, 이미 devDep 존재)
  - TanStack Router plugin (`@tanstack/router-plugin`)
  - Tailwind v4 플러그인 (`@tailwindcss/vite`)
  - `server.proxy`: `/api` → `http://localhost:8111`, `/uploads` → 동일
  - SVG 처리: `vite-plugin-svgr` 추가
  - path alias `@` → `src/`
- [ ] `tsconfig.json` 복사 + `moduleResolution: "bundler"` 확인
- [ ] `tailwind.config.ts` 및 `globals.css`(@theme 블록) 그대로 복사
- [ ] `vitest.config.ts`: 이미 Vite 기반이므로 거의 그대로 재사용
- [ ] MSW 설정 복사 (`src/test/msw/*`)
- [ ] `package.json` 스크립트: `dev`/`build`/`preview`/`test`
- [ ] Capacitor config 갱신은 Phase 4 — 아직 `apps/web/`이 정본

**Exit criteria**: `cd apps/web-vite && pnpm dev` 가 최소 빈 라우트 트리로 기동. 기존 `apps/web/` 동작 무영향.

### Phase 3 — Route migration (5-7 days)

**Goal**: 116개 page/layout 파일을 TanStack Router 트리로 이전. 테스트를 점진적으로 통과시키며 진행.

- [ ] TanStack Router 트리 스켈레톤:
  - `routes/__root.tsx` (전역 providers: QueryClientProvider, I18nProvider, Toast, Theme)
  - `routes/(auth)/_layout.tsx`, `routes/(main)/_layout.tsx` (pathless route)
  - 중첩 settings: `routes/(main)/settings/_layout.tsx` + `account.tsx`/`privacy.tsx`/`terms.tsx`/`notifications.tsx`
- [ ] 페이지 이전 순서 (영향도 낮은 것부터):
  1. 정적 페이지: `about`, `pricing`, `guide`, `faq`, `landing`
  2. 인증 페이지: `(auth)/login`, `(auth)/callback/kakao|naver`
  3. 리스트 페이지: `matches`, `teams`, `lessons`, `marketplace`, `mercenary`, `venues`
  4. 상세/생성 페이지: 각 도메인 `[id]` 및 `new`/`edit`
  5. `my/*`, `settings/*`, `notifications`, `chat`
  6. 관리자 `admin/*`
- [ ] `middleware.ts` 로직을 `routes/_index.tsx` beforeLoad로 이전 (accessToken 쿠키 → `/home` or `/landing`)
- [ ] `next/link` → `@tanstack/react-router`의 `<Link to="">`
- [ ] `next/navigation` 훅 → TanStack 대응:
  - `useRouter().push` → `useNavigate()({ to })`
  - `usePathname` → `useLocation().pathname`
  - `useSearchParams` → `useSearch({ from: '...' })` (타입 안전)
- [ ] `next/font/local` → `@fontsource/pretendard`(있다면) 또는 `src/assets/fonts/` + `@font-face` CSS
- [ ] i18n 이전:
  - `next-intl/NextIntlClientProvider` → `react-intl/IntlProvider` (또는 선정된 라이브러리)
  - `useTranslations('ns')('key')` → `useIntl().formatMessage({ id: 'ns.key' })` 또는 랩퍼 훅 작성하여 호출부 변경 최소화
  - 메시지 파일(`i18n/messages/*.json`)은 형식 호환 or 1회 변환 스크립트 작성
- [ ] 각 페이지 이전 후: 해당 페이지의 vitest 통과 확인, Playwright 관련 spec 수동 실행
- [ ] `'use client'` 지시어 전량 삭제(177개)
- [ ] `services/` 레이어는 그대로 (Axios + React Query이므로 Next와 무관)

**Exit criteria**:
- `cd apps/web-vite && pnpm test` 전 테스트 통과 (현재 352+ vitest suite 기준)
- `pnpm build` 성공
- `pnpm preview`로 주요 플로우(로그인/홈/채팅) 수동 smoke 통과
- Playwright 14 specs `apps/web-vite` 대상으로 통과

### Phase 4 — Cutover (1-2 days)

**Goal**: 정본을 `apps/web-vite/` → `apps/web/`으로 교체. 단일 PR.

- [ ] `apps/web/` → `apps/web.legacy/` (archive)
- [ ] `apps/web-vite/` → `apps/web/`
- [ ] `deploy/Dockerfile.web` 갱신: `pnpm build` 결과 `dist/` 를 nginx로 서빙하도록 수정 (현재는 `.next/standalone` 기반)
- [ ] `deploy/docker-compose.yml` 서비스 정의 확인 (포트 3003 그대로)
- [ ] Capacitor 설정:
  - `capacitor.config.ts`의 `webDir`: `out` → `dist`
  - 빌드 스크립트: `CAPACITOR_BUILD=true next build && next export` → `vite build`
- [ ] `package.json` 의존성 제거: `next`, `next-intl`, `@next/bundle-analyzer`
- [ ] 의존성 추가(이미 Phase 2에서 추가됐을 가능성 높음, 누락 시):
  - `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/router-devtools`
  - i18n 라이브러리(`react-intl` 등)
  - `@tailwindcss/vite`, `vite-plugin-svgr`, `rollup-plugin-visualizer`
- [ ] `.env*` 파일의 `NEXT_PUBLIC_*` → `VITE_*` 일괄 rename (사용자 확인 필요, 파일 접근 정책상 사용자에게 먼저 확인)
- [ ] `next.config.ts` → `docs/archive/next.config.ts.historic`로 이동, 참조 목적 주석 추가
- [ ] 문서 갱신:
  - `CLAUDE.md` "기술 스택" 섹션: Next 16 → Vite + TanStack Router
  - 개발 명령어 표
  - 포트 맵은 동일(3003)
- [ ] CI 파이프라인 확인: `.github/workflows/*.yml`은 파일 접근 차단 대상 — 사용자에게 별도 수정 요청

**Exit criteria**:
- `pnpm -C apps/web build` 성공, `dist/` 산출
- `docker compose up` 후 `/home` 정상 로드
- Capacitor iOS/Android 빌드 성공 (시뮬레이터에서 최소 로그인)
- Playwright 14 specs 통과
- 프로덕션 1주일 모니터링 지표 안정(에러 rate, 로드 시간)

---

## 7. Verification & Validation

### Pre-merge checks

```bash
cd apps/web       # Phase 4 이후 apps/web-vite는 apps/web으로 합쳐진 상태
pnpm lint         # 현재 "tsc에 위임" — Phase 4에서 ESLint 설정도 함께 이전
npx tsc --noEmit  # 타입 체크
pnpm test         # Vitest 전 suite (현재 352+ 통과 기준)
pnpm build        # Vite build 성공
pnpm preview      # 정적 산출물 smoke
```

### Manual smoke (dev) — 핵심 플로우 15개 체크리스트

각 플로우가 Next 버전과 **동일하게** 동작해야 합니다.

1. [ ] `/landing` 접속(비로그인) → 랜딩 페이지 렌더
2. [ ] `/` 접속(비로그인) → `/landing`으로 리다이렉트 (middleware 치환 동작)
3. [ ] `/` 접속(로그인 쿠키 존재) → `/home`으로 리다이렉트
4. [ ] `/login` 탭 전환 (register tab), `/register`, `/signup` → `/login?tab=register`로 redirect
5. [ ] dev-login으로 로그인 → 홈 렌더
6. [ ] `/home` → 추천 매치 리스트 로드(React Query 캐시 동작)
7. [ ] 매치 생성(`/matches/new`) → 목록에 즉시 반영 (mutation invalidate)
8. [ ] 팀 매칭 생성 → 신청 → 호스트 수락 → 알림 수신(Socket.IO)
9. [ ] 채팅방 진입 → 실시간 메시지 송수신 (`useChatRoomSocket`)
10. [ ] 알림 인앱 뱃지 업데이트 (`useNotificationSocket`)
11. [ ] Web Push 구독 토글(VAPID 키 없을 때 graceful fail)
12. [ ] 다크모드 토글 — 초기 페인트 플래시 없는지 (SSR 없어서 주의 — **회귀 위험**)
13. [ ] i18n 언어 전환(`ko` ↔ `en`) — 모든 페이지 번역 적용
14. [ ] 관리자(`/admin/*`) — 13개 엔드포인트 중 dashboard/users/teams 접근 확인
15. [ ] `/profile` → 이미지 업로드(Next image 대체 동작 확인)

### Cross-platform smoke

- [ ] Desktop Chrome (latest)
- [ ] Desktop Firefox (latest)
- [ ] Desktop Safari (macOS latest)
- [ ] Mobile Safari (iOS 최신 2개 버전)
- [ ] Mobile Chrome (Android)
- [ ] Capacitor iOS 시뮬레이터 (로그인 → 홈)
- [ ] Capacitor Android 에뮬레이터 (로그인 → 홈)

### Playwright E2E

```bash
cd e2e && npx playwright test
```

**URL 구조는 migration 전후 동일해야 합니다.** E2E 스펙 수정 발생 시 그 자체가 리그레션 신호입니다. 14개 spec 중 1개라도 수정이 필요하면 원인을 "의도된 URL 변경" vs "실수로 깨진 라우트"로 분리 분석.

### Bundle size baseline

```bash
# Before (Next)
cd apps/web && pnpm build
du -sh .next/static  # 현재 baseline 기록

# After (Vite)
cd apps/web && pnpm build
du -sh dist  # 비교

# Acceptance: parity or ≤10% 증가. 20% 이상 증가 시 분석 후 최적화.
```

추가 측정:
- Lighthouse Performance/LCP/TBT 비교 (같은 페이지, 같은 네트워크 throttling)
- First paint / Time-to-interactive

### Rollback plan

- **Phase 1**: PR revert로 원상복구 (인벤토리 문서만 추가한 상태)
- **Phase 2**: `apps/web-vite/` 디렉토리 삭제 + `pnpm-workspace.yaml` 복원
- **Phase 3**: `apps/web-vite/` 디렉토리 삭제 (기존 `apps/web/` 무영향)
- **Phase 4**: **단일 PR revert** — 가장 파급이 큰 지점. 머지 후 **2주간** `apps/web.legacy/`를 삭제하지 말 것. Capacitor 앱스토어는 2주 웹 안정성 확인 후 새 버전 제출.

### Regression surface (특별 주의)

1. **Auth redirect 흐름**: `middleware.ts` → 클라이언트 beforeLoad 치환 시 "쿠키 없어도 일시적으로 `/home` 쉘이 보인 후 `/landing`으로 튐" 플래시 가능. loader 블로킹으로 처리하거나 `<Navigate />` 즉시 대체.
2. **Route group 의미**: Next의 `(auth)`, `(main)`은 URL에 드러나지 않음. TanStack의 pathless route(`_layout`)도 동일하게 동작하나 파일명 관례가 다름 — 실수 포인트.
3. **i18n hydration 타이밍**: `next-intl`의 서버 사이드 메시지 주입이 제거되면 초기 로딩에 "key가 잠깐 보이는" flash 가능. 메시지는 초기 번들에 동기 포함하고, `Suspense` 경계로 보호.
4. **다크모드 테마 플래시(FOUC)**: SSR이 없어 `<html>` 초기 렌더 시 `class="dark"` 미적용 순간이 생길 수 있음. **인라인 스크립트**로 `<head>` 맨 위에서 `localStorage.getItem('theme')` 체크 후 즉시 클래스 적용하는 "theme-init script" 필수 (`index.html`에 직접 삽입).
5. **Capacitor deep linking**: URL scheme으로 앱 진입 시 React Router/TanStack이 올바른 라우트 복원하는지 확인.
6. **Service Worker scope**: Next는 자동 SW 등록 없음 — 현재도 `sw-push.js`는 수동 등록 구조 (`usePushRegistration`). 경로 참조만 확인.
7. **환경변수 접근**: `process.env.NEXT_PUBLIC_X` → `import.meta.env.VITE_X`. 코드 전체 치환 + `.env*` 파일 rename 필요 (사용자 확인 필수).
8. **404 처리**: Next의 `not-found.tsx`(2곳: `app/(main)/not-found.tsx`, `users/[id]/not-found.tsx`) → TanStack의 `notFoundComponent`.

---

## 8. Cost/Benefit matrix

각 셀 1-5 평가 (1=나쁨, 5=좋음). 한 줄 정당화 포함.

| Factor | Stay Next (현상유지) | Option C (client Next) | Option B (Vite+TanStack) | Weight |
|---|---|---|---|---|
| 개발 속도(HMR/dev) | 4 (turbopack 양호) | 4 (동일) | 5 (Vite 더 빠름) | Med |
| 정신 모델 | 2 (server/client 혼동 잔재) | 4 (순수 SPA로 정리) | 5 (프레임워크 가정과 일치) | High |
| 프레임워크 락인 | 2 (Vercel 친화) | 3 (여전히 Next) | 5 (framework-agnostic) | Med |
| 번들 크기 | 3 (Next 런타임 포함) | 3 (동일) | 4 (Next 런타임 제거) | Low |
| SEO | 4 (App Router 지원) | 3 (static export만) | 3 (SPA) / 5(+Option D) | Low* |
| 팀 지식 연속성 | 5 (현 상태) | 5 (동일) | 2 (재교육 필요) | High |
| Capacitor 적합성 | 3 (export 분기 필요) | 5 (한결같이 static) | 5 (본질적 SPA) | High |
| 마이그레이션 리스크 | 5 (0 리스크) | 4 (low) | 2 (cutover 대형 PR) | High |
| 시간 투자 | 5 (0 시간) | 5 (1-3일) | 2 (2-3주) | Med |
| 장기 유지보수 | 3 (Next 업그레이드 부담) | 3 (동일) | 4 (Vite+React 단순) | Med |
| 채용 풀 | 5 (Next 친숙도 높음) | 5 (동일) | 4 (Vite+React 보편) | Low |
| 타입 안전성(라우팅) | 3 (수동) | 3 (동일) | 5 (TanStack 강점) | Med |
| 테스트 인프라 연속성 | 4 (Vitest는 이미 Vite) | 5 (변경 없음) | 5 (Vite 네이티브로 더 자연스러움) | Med |

\* SEO는 랜딩 페이지에만 해당하며, 전체 앱은 인증 게이트 뒤 SPA이므로 가중치 낮음. 랜딩 SEO가 비즈니스 핵심이면 Option D 고려.

**가중 합산 직관**(정식 점수 아님, 판단용):
- Stay Next: 보통 — 바꿀 이유도, 그대로 둘 이유도 약함
- Option C: **가성비 최고**
- Option B: 장기적 정돈 최고, 단기 리스크 큼

---

## 9. Risks & Unknowns

정직하게 열거. 모든 "아마 괜찮을 것"은 검증 대상.

1. **React Router v7 / TanStack Router의 프로덕션 성숙도**
   React Router v7은 출시 직후, TanStack Router는 꾸준한 메이저 개선 중. 엔터프라이즈 레퍼런스가 Next 대비 적음. Risk: 초기 API 변경 노출.

2. **i18n 라이브러리 선정 — `react-intl` vs `i18next` vs `paraglide`**
   - `react-intl`: ICU 호환, `next-intl`과 의미 가장 유사. 권장 1순위.
   - `i18next`: 생태계 방대, 네임스페이스 관리 유연.
   - `paraglide`: 번들 효율 최고, 메시지 타입 안전. 다만 급성장 중 라이브러리라 리스크.
   결정은 Phase 1에서 POC 하루 투입 권장.

3. **테스트 인프라 호환성 — Vitest는 Vite 네이티브 = 이점**
   기존 `apps/web/vitest.config.ts`가 이미 Vite 기반이므로 Phase 2에서 거의 그대로 이전 가능. 이것이 migration의 **가장 큰 숨은 이점**.

4. **`next-intl` 커스텀 훅 재구현**
   `useTranslations('namespace')` 패턴은 메시지 키 네임스페이스 구조 의존. 치환 시 **랩퍼 훅**(`useT`)을 작성해 호출부 diff 최소화 권장:
   ```ts
   // src/i18n/use-t.ts (target)
   export function useT(namespace: string) {
     const intl = useIntl();
     return (key: string, values?: Record<string, any>) =>
       intl.formatMessage({ id: `${namespace}.${key}` }, values);
   }
   ```

5. **SVG 처리**
   Next는 SVG를 import 시 asset URL로 제공. `<img src>` 용도가 기본. React 컴포넌트 import(`ReactComponent as Icon`)가 필요한 곳은 `vite-plugin-svgr` 필수. 현재 `components/icons/sport-icons.tsx`는 인라인 SVG이므로 영향 작음.

6. **환경변수 prefix**: `NEXT_PUBLIC_*` → `VITE_*`. 코드 전역 grep-replace + `.env*` 파일 수정. 파일 접근 정책상 `.env*`는 읽기/수정 허용이지만, 사용자에게 수정 내역 보고 필수.

7. **Bundle analyzer 대체**: `@next/bundle-analyzer` → `rollup-plugin-visualizer`. 기능 동등.

8. **`@next/bundle-analyzer` 의존성 제거** (Phase 4에서 수행).

9. **Turbopack 설정의 `root` path**: `path.resolve(__dirname, '../..')`은 pnpm 모노레포 루트 지정. Vite는 모노레포에 대한 special handling이 필요 없음 — 무시 가능.

10. **`redirects` 2개(/register, /signup)**: 루트 `_index.tsx` 또는 전용 `routes/register.tsx` with loader redirect로 대체. URL 구조는 동일.

11. **Kakao Map SDK 로드 타이밍**: `components/map/kakao-map.tsx`는 dynamic script 로드 중. Next `next/script`(있다면) → `useEffect` 기반 로더로 변경 시 중복 로드 방지 가드 필요.

12. **CI 워크플로 수정 필요** (`.github/workflows/*.yml`): 파일 접근 차단 대상. **사용자 직접 수정** 필요. Phase 4 PR에 인스트럭션 포함.

---

## 10. Open questions for project-director

아래 5개 질문에 답이 확정되기 전까지는 task로 승격하지 않습니다.

1. **주요 동기가 무엇인가?** — "Next.js 스택에서 제거" vs "SPA 단순화"인지 명확히.
   → 전자면 Option B, 후자면 Option C.

2. **랜딩/about/guide/faq/pricing 페이지의 SEO가 비즈니스 KPI에 연결되는가?**
   → 예: Option D 심각하게 고려. 아니오: Option D 탈락.

3. **Capacitor iOS/Android 릴리스 타임라인은?**
   → 앞으로 4주 이내 앱스토어 제출 예정이면 Option B의 2-3주 cutover와 충돌. Option C 권장.

4. **팀 구성원의 React Router / TanStack Router 프로덕션 경험은?**
   → 경험자 0: Option A/B 모두 러닝 비용 + 리스크 증가. POC 단계(Phase 1 하루)에서 재평가.

5. **허용 가능한 cutover 리스크 창구(window)는?**
   → "어떤 리그레션도 48시간 내 수정"이 가능한 on-call 체제가 있는지. 없으면 Phase 4 미루고 Option C로 고정.

추가로 암시적 질문(사용자 명시 전 추측하지 않음):

- 현재 운영 중이거나 곧 출시인 Task 72/73/74 로드맵과 프리즈 기간 겹치는지?
  → 본 migration은 **Task 72/73/74에 기능 의존이 없음** (팀 밸런싱/idempotency/push는 모두 백엔드 또는 프론트 비즈니스 로직이며 프레임워크 독립). 다만 **동시 진행은 충돌** 가능 — Option B/A/D 선택 시 Task 72/73/74 완료 후 kick-off 권장.

---

## 11. Conclusion

Teameet 프론트엔드는 이미 본질적으로 SPA이며, Next.js의 강점(RSC/SSR/middleware/API routes)을 거의 사용하지 않습니다. 이는 이전을 **쉽게** 만드는 동시에 "굳이 할 이유도 약하게" 만듭니다. 따라서 기본 권장은 **Option C를 먼저 적용해 프레임워크 가정과 실제 사용을 정렬**하고, 그 후에도 "Next.js를 스택에서 제거" 욕구가 여전하면 그때 **Option B (Vite + TanStack Router)** 로 진행하는 것입니다.

Option B는 현재 파일 구조(`app/**/page.tsx`)와 1:1로 대응하고, 이미 사용 중인 `@tanstack/react-query`와 생태계를 공유하며, 타입 안전한 라우팅이라는 뚜렷한 이점을 제공합니다. 반면 2-3주의 집중 작업과 cutover 리스크, 팀 재교육 비용이 수반됩니다. **반쪽 이전은 최악의 선택**이므로 진행하기로 했다면 Phase 4까지 완주를 약속해야 합니다.

**본 문서는 제안이며 커밋된 task가 아닙니다.** Section 10의 5가지 open question에 답이 확정된 후에만 task로 승격합니다. 승격 시 파일명을 다음 가용 번호(현재 기준 79+)로 재부여하고, Status를 "Proposal"에서 "In Planning"으로 전환합니다.

---

## Appendix A — Current `next.config.ts` (reference, reproduction target)

마이그레이션 후 Vite 설정이 아래 프로덕션 동작을 전부 재현해야 합니다.

- `output`: `CAPACITOR_BUILD=true`면 static export, 프로덕션이면 standalone, dev면 undefined
  → Vite: 항상 정적 `dist/` 산출. `standalone` 개념은 컨테이너 런타임 용도였으므로 nginx 정적 서빙으로 대체.
- `images.unsplash.com` remote pattern → Vite에선 불필요(네이티브 `<img>`).
- `images.unoptimized = isCapacitorBuild` → 전면 `unoptimized` 의미.
- `redirects()`: `/register`, `/signup` → `/login?tab=register` → 라우트 레벨 redirect로 대체.
- `rewrites()`:
  - `/api/:path*` → `${internalApiOrigin}/api/:path*`
  - `/uploads/:path*` → `${internalApiOrigin}/uploads/:path*`
  - Capacitor 빌드에선 무시 (정적 export이므로)
  → Vite dev `server.proxy`로 대체. 프로덕션은 nginx 레벨 proxy가 담당(기존 구조 유지).
- `experimental.optimizePackageImports`: `next-intl`, `@tanstack/react-query` → Vite는 자동 tree-shaking, 해당 없음.
- `turbopack.root`: pnpm 모노레포 context → Vite는 해당 없음.
- `webpack fallback buffer: false` → Vite는 Node buffer polyfill 기본 미포함, 해당 없음.

## Appendix B — Post-migration commands (target state)

참고용 — Phase 4 완료 후 `pnpm` 스크립트가 아래 형태가 되어야 합니다.

```json
{
  "scripts": {
    "dev": "vite --port 3003 --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --port 3003",
    "test": "vitest run",
    "test:watch": "vitest",
    "analyze": "ANALYZE=true vite build",
    "clean": "rm -rf dist node_modules/.vite"
  }
}
```

## Appendix C — Cross-links

- 기본 프로젝트 규칙: `/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/CLAUDE.md`
- 현 Next 설정: `/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/next.config.ts`
- Middleware: `/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/middleware.ts`
- Package manifest: `/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/package.json`
- 직전 태스크 로드맵: `.github/tasks/next-session-plan-72-onward.md`, `72-team-balancing-v2-hardening.md`, `73-idempotency-retry-semantics.md`, `74-production-push-activation.md`

---

**End of proposal.**
