# Teameet — AGENTS.md

Scope: **entire repository**. 이 파일은 Codex용 프로젝트 엔트리이며, 세부 규칙은 하위 문서로 라우팅합니다.

이 저장소는 전역 기준 문서인 `~/.codex/AGENTS.md`를 상속합니다. 이 파일에는 Teameet 저장소에서만 필요한 구조, 런타임, 검증, 문서화 규칙만 추가합니다.

## Quick Templates

### A) Task Request Template

```text
TARGET: backend | frontend | both | infra
MODE: CODE | ANSWER | REVIEW
FEATURE_NAME:
MODULE:
TASK_DOC:

REQUEST:
- what / why / where

REQUIREMENTS:
- ...

ACCEPTANCE_CRITERIA:
- Given ...
  When ...
  Then ...

OUT_OF_SCOPE:
- ...

VALIDATION:
- ...
```

### B) Task / Spec Paths

- Canonical path: `.github/tasks/`
- Preferred naming: `.github/tasks/{NN}-{slug}.md`
- 기존 작업 연장 시에는 새 파일을 늘리기보다 관련 task 문서를 갱신한다.
- task 번호가 중복되거나 drift가 보이면 관련 task 문서, `docs/scenarios/index.md`, 현재 구현 증거를 교차 검증해 canonical task를 먼저 고정한다.
- QA 실행 기준 시나리오는 `docs/scenarios/` 아래에 둔다.
- `docs/scenarios/index.md`는 시나리오 진행 상태, 링크, discussion의 단일 허브로 사용한다.

### C) Abstraction Notes

```text
Required:
Responsibilities:
Dependencies:
Interface:
Errors:
```

## 0) Repo Map

- `apps/web`: Next.js 15 App Router 프론트엔드. 공개 페이지(`landing`, `about`, `pricing`, `faq`)와 인증 후 메인 앱(`(main)`), 인증(`(auth)`), 관리자(`admin`)를 포함한다.
- `apps/api`: NestJS 11 백엔드. 도메인 모듈은 `auth`, `matches`, `team-matches`, `teams`, `mercenary`, `lessons`, `marketplace`, `payments`, `chat`, `notifications`, `admin` 등으로 나뉜다.
- `apps/api/prisma`: Prisma 스키마와 시드.
- `apps/api/test/fixtures`: 백엔드 통합/도메인 테스트용 fixture 팩토리.
- `apps/web/src/test/msw`: 프론트엔드 네트워크 모킹 진입점.
- `apps/web/public/mock`: 화면용 로컬 mock 이미지/생성 자산.
- `apps/web/public/mock/photoreal`: 실사형 로컬 mock 이미지와 attribution 문서.
- `e2e`: Playwright E2E와 `e2e/fixtures` 페르소나/헬퍼.
- `scripts/qa`: 수동 QA, route smoke, UI gap 감사 같은 보조 스크립트.
- `ultraplan/runs/e2e-analyzer*`: 기능 단위 screenshot-set queue, task/report handoff, stale-job recovery state.
- `scripts/docs`: 문서용 스크린샷 캡처 스크립트.
- `deploy`: 프로덕션 Dockerfile 및 배포 compose.
- `infra/load`: k6 부하 테스트 하네스.
- `docs/screenshots`: 문서에서 직접 참조하는 canonical 스크린샷 자산.
- `docs/reference`: 버전 관리되는 시각 레퍼런스 자산.
- `.claude/agents`: 이 저장소의 에이전트 프롬프트, 팀 설정, 워크플로 문서. 이 저장소에서는 `.agents/`를 새로 만들지 않는다.

## 1) Always-Run Workflow

1. 변경 범위를 `backend`, `frontend`, `infra`, `docs` 중 어디까지 포함하는지 먼저 고정한다.
2. 비자명한 작업이면 `.github/tasks/`에서 기존 문서를 찾고, 없으면 해당 경로에 task/spec를 만든다.
3. 관련된 가장 좁은 파일부터 읽는다. `README.md`, `CLAUDE.md`, `DESIGN.md`, `.impeccable.md`, `Makefile`, 실제 설정 파일을 우선한다.
4. 가장 작은 정답을 구현하되, 범위 안의 tech debt와 mock/fixture drift는 같은 변경에서 함께 정리한다.
5. 검증은 좁게 시작해서 넓게 확장한다. 단위 테스트 → 통합 테스트 → E2E → 빌드/린트 순서를 기본으로 본다.
6. 새 규칙, gotcha, 워크플로 변경이 생기면 `AGENTS.md`와 `.claude/agents/*.md`를 같이 업데이트한다.
7. 사용자가 `@전체` / `agent-all`을 명시한 경우, plan → build → review → design → QA → docs 전체를 같은 실행에서 끝까지 진행한다. 중간 단계 보고 후 멈추지 말고, 검증이 런타임 이슈로 막히면 정확한 blocker를 기록한 뒤 남은 문서화와 최종 리포트까지 완료한다.

## 1.1) Dev Runtime

- 권장 시작 명령: `make dev` (Docker attached), `make up` (Docker detached), `make dev-local` (host에서 api + web 실행)
- Frontend: `http://localhost:3003`
- Backend API: `http://localhost:8111/api/v1`
- Swagger: `http://localhost:8111/docs`
- Prisma Studio: `make db-studio` 후 `http://localhost:5555`
- Dev compose의 Postgres/Redis는 내부 Docker 네트워크로만 접근한다. host direct connect를 전제하지 말고, 필요하면 `docker compose exec` 또는 앱/API 경유 흐름을 사용한다.
- `deploy/Dockerfile.dev`는 native addon 호환성을 위해 glibc 기반 Node 이미지를 유지한다. dev compose의 `node_modules` 볼륨은 `nocopy` + 이미지 내 `/opt/deps` bootstrap service로 매 기동 시 동기화하고, `pg_isready`는 항상 실제 DB명까지 지정한다.
- shared Docker dev stack의 `web`도 `/app/apps/web/.next`를 stack-local named volume으로 격리한다. host bind mount의 같은 `.next`를 `next build`, 다른 local runner, 다른 web runtime과 공유하면 `next-font-manifest.json` ENOENT와 React Client Manifest mismatch가 재발한다.
- dev compose의 `deps` bootstrap을 `rsync` 단독 가정으로 바꾸면 오래된 dev 이미지에서 `service deps exit 127`로 전체 스택이 막힐 수 있다. `rsync` 전환 시에는 `cp` fallback을 함께 두거나 이미지를 먼저 재빌드한다.
- dev compose에서 `web`만 단독 restart 하지 않는다. `deps` bootstrap 없이 `web`만 다시 뜨면 `@parcel/watcher` optional binary가 빠져 Next dev가 기동 실패할 수 있으므로 `docker compose up -d deps web` 또는 `make dev-web`로 같이 올린다.
- dev web에서 route가 갑자기 500을 내면서 `.next/routes-manifest.json`, `.next/server/pages/_document.js`, `next-flight-client-entry-loader`, `next-flight-css-loader`, `next-font-manifest.json` ENOENT가 보이면 페이지 코드 회귀로 단정하지 않는다. 먼저 `docker compose up -d --build deps web` 또는 `make dev-web`로 deps/bootstrap과 isolated `.next`를 다시 맞추고 재컴파일 완료까지 기다린 뒤 route smoke를 다시 본다.
- `make dev` 스택이 healthy인데 브라우저의 `localhost:3003`만 계속 500이면 Docker `web`만 보지 말고 host-side `pnpm --filter web dev` / `next dev` shadow process를 먼저 의심한다. `lsof -nP -iTCP:3003 -sTCP:LISTEN`로 확인해 stale host listener를 정리한 뒤 다시 본다.
- dev web에서 `Could not find the module ".../next/dist/client/components/builtin/global-error.js#"` 같은 React Client Manifest mismatch가 나와도 동일한 App Router dev manifest drift 계열로 먼저 본다. `web` 재기동으로 상태를 리셋하고, root-level `apps/web/src/app/global-error.tsx`를 유지해 Next builtin global error 의존을 줄인다.
- dev compose의 API는 `AUTH_HASH_DRIVER=bcryptjs`를 사용해 native `bcrypt`를 로드하지 않는다. production 기본값은 `bcrypt`를 유지한다.
- `web` 서비스는 `api`의 단순 프로세스 시작이 아니라 `/api/v1/health` healthcheck 통과 이후에만 의존하도록 유지한다. cold start 시 프록시 초기 요청이 API readiness보다 앞서면 간헐적 5xx가 난다.
- dev compose의 `api` watch가 unrelated TypeScript error에 막히면 `localhost:8111`은 테스트/tsc와 다른 stale contract를 계속 서빙할 수 있다. query/DTO 변경 후에는 unit test만 보지 말고 live `curl` 또는 브라우저 경로로 실제 `8111` 응답까지 확인한다.
- `apps/api`의 Docker dev runtime은 `pnpm exec ts-node --transpile-only src/main.ts` 기반 transpile-only 부팅을 사용한다. dirty worktree의 unrelated type error가 live `8111` contract를 막지 않게 하되, 타입 안정성은 `pnpm --filter api exec tsc --noEmit` 또는 관련 테스트로 별도 확인한다.
- Prisma schema가 최근 변경되었는데 dev DB가 뒤처져 있으면 auth/dev-login, email login/register, JWT validate 같은 인증 경로가 공통으로 500을 낼 수 있다. `users.admin_status` 같은 누락 컬럼 에러가 보이면 authenticated UI/API smoke 전에 `make db-push`로 dev DB를 먼저 current schema에 맞춘다.
- 로컬 Playwright E2E는 Next dev on-demand compile 부하 때문에 기본값을 `workers=1`, `fullyParallel=false`, `navigationTimeout=120_000`, `line` reporter로 유지한다. 병렬도를 올릴 때는 `PW_WORKERS`와 `PLAYWRIGHT_REPORTER`를 명시적으로 override한다.
- `scripts/qa/run-visual-audit.mjs`의 bootstrap write는 기본 비활성이다. clean local DB에서 dynamic route fixture가 꼭 필요할 때만 `--allow-bootstrap-writes`를 명시하고, `localhost`가 아닌 API target에는 사용하지 않는다.
- visual audit artifact는 같은 `run-id`를 재사용해 누적하지 않는다. `RUN`은 기본적으로 새 값으로 주고, broad capture는 `batch + viewport band` 단위로 쪼개서 실행한다. 예외는 `batch-8-rerun`으로, 이때만 기존 `capture-results.json`이 있는 같은 `run-id`를 다시 사용한다.
- shared Next dev(`localhost:3003`) 기준 broad visual audit를 viewport band 여러 개로 병렬 실행하지 않는다. 장시간 capture에서 `net::ERR_CONNECTION_RESET`/`ERR_EMPTY_RESPONSE`가 반복되므로 `mobile -> tablet -> desktop` 순차 실행을 기본값으로 사용하고, blocker는 각 band 종료 후 `batch-8-rerun`이나 route-level targeted rerun으로 정리한다.
- shared Docker dev stack(`make dev`, `localhost:3003/8111`) 기준 full Playwright는 single active runner only다. 두 개 이상의 local runner가 필요하면 `make e2e-isolated-up RUN=<id>` / `make test-e2e-isolated RUN=<id>` / `make test-e2e-isolated-spec RUN=<id> SPEC=<path> [PROJECT="Desktop Chrome"] [GREP="..."]` / `make e2e-isolated-down RUN=<id>` 경로만 사용한다. 상세 runbook은 `docs/PLAYWRIGHT_E2E_RUNBOOK.md`를 기준으로 본다.
- Next dev 기준 `/home`은 첫 컴파일 비용이 특히 무거워 120초를 넘길 수 있다. Playwright 세션 안정화나 수동 캡처 스크립트의 첫 진입점으로는 `/home`보다 `/login`, `/landing`, `/matches` 같은 더 가벼운 경로를 먼저 워밍업한 뒤 대상 페이지로 이동한다.
- Playwright가 자체 `webServer`로 Next dev를 cold start할 때 `apps/web/.next/routes-manifest.json` 또는 `app-paths-manifest.json` ENOENT가 간헐적으로 날 수 있다. 이 경우 제품 회귀로 단정하지 말고, 이미 떠 있는 docker `web`에 붙이거나 dev server를 충분히 prewarm한 뒤 재검증한다.
- isolated Playwright compose에서도 `/app/apps/web/.next`는 반드시 stack-local volume이어야 한다. 서로 다른 runner가 host bind mount의 같은 `.next`를 공유하면 `Cannot find module './*.js'`, React Client Manifest mismatch, 반복적인 `/landing` 500이 발생한다.
- notification/action-center UI에서 "읽음 처리 + in-app deep link"를 같은 `Link` 기본 동작에 맡기지 않는다. mutation이 같이 일어나는 카드 액션은 explicit navigation handler를 두고, websocket 연결 직후 한 번 backfill invalidate를 걸어 late-connect race를 막는다.
- realtime unread/notification surface는 websocket event만 믿지 않는다. hidden tab 복귀와 late-connect를 고려해 focus/visibility 시점의 backfill refetch 경로를 함께 둔다.
- Production compose 기준 포트는 `web=3000`, `api=8100`이다. dev/prod 포트를 혼동하지 않는다.
- Production `web`은 Next standalone runtime이 `127.0.0.1` 대신 container IP에만 bind할 수 있으므로, compose/runtime에서는 `HOSTNAME=0.0.0.0`를 명시해 localhost healthcheck와 nginx dependency gate가 함께 통과되도록 유지한다.
- 현재 운영 EC2는 `ec2-user`로 접속하며, Amazon Linux bootstrap은 standalone `docker-compose`를 제공할 수 있다. CI/runbook/manual deploy는 `docker compose` 플러그인만 있다고 가정하지 말고 두 형태를 모두 처리하거나 사전 검증한다.
- 운영 env contract가 바뀌면 `.github/workflows/deploy.yml`, `deploy/docker-compose.prod.yml`, `deploy/.env.prod.example`, `deploy/setup-ec2.sh`를 같은 변경에서 sync한다. 특히 `TOSS_SECRET_KEY`처럼 mock mode가 가능한 optional env를 compose/bootstrap에서 required로 승격시키는 drift를 금지한다.
- GitHub Actions가 운영 시크릿(`TOSS_SECRET_KEY` 등)을 소스 오브 트루스로 쓰면 deploy workflow는 protected EC2 `deploy/.env`를 preflight 전에 그 값으로 수렴시켜야 한다. secret이 비거나 제거됐는데 host에 stale 값이 남아 mock mode 계약이 깨지는 상태를 금지한다. 다만 Toss 결제 시크릿 부재만으로 앱 전체 deploy를 막아서는 안 된다.
- Next production web의 `/api` rewrites와 `serverFetch`는 build-time `INTERNAL_API_ORIGIN`에 의존한다. 운영 API topology나 포트를 바꿀 때는 `apps/web/next.config.ts`, `deploy/Dockerfile.web`, workflow build args, prod compose env를 함께 맞춘다. 그렇지 않으면 `localhost:8111` 같은 dev fallback이 이미지에 bake될 수 있다.
- 운영 자동화에 destructive full seed(`prisma db seed`, `make db-seed`)를 기본 경로로 연결하지 않는다. deploy-safe data backfill은 idempotent 전용 스크립트(`prisma/seed-mocks.ts --checksum-gate`, `prisma/seed-images.ts`)로 분리한다.
- dev runtime에서 화면 확인용 canonical mock dataset이 필요하면 destructive full seed 대신 `prisma/seed-mocks.ts` / `make db-seed-mocks`를 사용한다. unrelated dev/E2E 레코드를 유지해야 하는 상태에서 `make db-seed`를 재실행하는 흐름은 금지한다.
- production deploy는 `DEPLOY_SYNC_MOCK_DATA=false`가 아닌 한 checksum-gated mock sync를 기본으로 실행한다. mock catalog는 KST 날짜 anchor를 포함하므로, deploy-safe freshness가 필요할 때는 checksum skip만 믿지 말고 현재 anchor date까지 함께 본다.
- production DB bootstrap은 `prisma/bootstrap-deploy-db.ts`를 single entry로 사용한다. 빈 DB면 `db push + migrate resolve`로 baseline을 고정하고, migration history가 없는 비어 있지 않은 DB는 drift 가능성이 크므로 자동 복구하지 않고 실패시킨다.
- 이미 실행 중인 스택이 있으면 재시작보다 현재 상태를 활용한다.

## 2) Context Budget Rules

- 파일 검색은 `rg`, 파일 목록은 `git ls-files` 또는 `rg --files`를 우선한다.
- `docs/screenshots/`, `docs/reference/`, `playwright-report/`, `test-results/`, `.playwright-mcp/`, `.pnpm-store/`, `tmp/`, `node_modules/`, `.turbo/`는 기본 탐색 대상에서 제외한다.
- `.env*`는 읽거나 출력하지 않는다. 환경 변수는 이름과 책임만 문서화한다.
- 문서가 실제 코드와 충돌하면 `apps/api/src/main.ts`, `apps/api/src/config/configuration.ts`, `apps/web/next.config.ts`, `docker-compose.yml`, `Makefile`를 우선적인 사실 원천으로 본다.

## 3) Which Instruction Set To Follow

- 전역 기본 정책: `~/.codex/AGENTS.md`
- 아키텍처/도메인/테스트 원칙: `CLAUDE.md`
- 디자인 우선순위와 UX 원칙: `DESIGN.md` → `.impeccable.md`
- 디자인 문서 탐색 허브: `docs/DESIGN_DOCUMENT_MAP.md` (navigation only, rule definition 금지)
- 에이전트 역할/팀/파이프라인: `.claude/agents/prompts.md`, `.claude/agents/team-config.md`, `.claude/agents/workflow.md`
- 실행/검증 명령: `README.md`, `Makefile`
- 프로젝트 현황/기능 맵: `docs/PROJECT_OVERVIEW.md`, `docs/WORK_SUMMARY.md`

## 4) Project-Specific Development Rules

- 저장소 타입은 `pnpm workspaces + Turborepo` 기반 `fullstack-web` 모노레포다.
- 프론트엔드는 `apps/web/src/app`의 route group 구조를 유지한다.
  - `(auth)`: 로그인/인증
  - `(main)`: 인증 후 사용자 앱
  - `admin`: 관리자 앱
  - 공개 소개 페이지는 `landing`, `about`, `guide`, `pricing`, `faq`
- 백엔드는 NestJS 모듈 경계를 유지한다. 새 기능은 `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` 구조를 우선한다.
- API 기본 규칙:
  - prefix는 `/api/v1`
  - 응답은 `TransformInterceptor` 기준 `{ status, data, timestamp }`
  - 입력 검증은 DTO + `class-validator`
  - Nest `ValidationPipe`는 `whitelist + forbidNonWhitelisted`로 동작한다. 프론트 form state에 UI 전용 필드가 있으면 API submit 시 DTO 호환 payload로 정리해서 보내야 한다.
  - 목록은 cursor pagination을 기본값으로 본다.
  - 프론트 통합용 API 문서는 Swagger만 단독 source of truth로 쓰지 않는다. `controller` + DTO + service status gate + integration test + `apps/web/src/hooks/use-api.ts` / `apps/web/src/types/api.ts`를 함께 교차검증하고, auth/permission/error/pagination/multipart/idempotency/mock-vs-real gotcha를 명시해야 한다.
  - controller/DTO/service 계약이 바뀌면 `docs/api/domains/*.md`를 **같은 변경**에서 sync한다. `@docs` 호출 시 docs-writer가 이 sync를 검증한다. Canonical contract 문서 경로: `docs/api/` (README + global-contract + domains/*).
- 권한 검증은 라우트 가드와 서비스 계층을 함께 본다. `JwtAuthGuard`, `AdminGuard`, `TeamMembershipService.assertRole(...)` 우회를 만들지 않는다.
- 디자인 소스 우선순위:
  - `DESIGN.md`
  - `.impeccable.md`
  - `apps/web/src/app/globals.css`의 `@theme`
  - 기존 공유 컴포넌트와 토큰 사용 패턴
- shadow는 깊이감 보조 수단으로만 사용한다. content card에서 deep shadow, stacked shadow, glow shadow를 기본 스타일로 쓰지 않는다.
- border는 subtle full-border 또는 borderless separation 중 하나만 선택한다. thick border, one-side accent border, border-heavy nested container는 금지한다.
- 레이아웃은 Toss-like clean layout을 기준으로 `text-first`, `section-clear`, `action-obvious` 상태를 우선한다. utility page를 hero/card showcase처럼 만들지 않는다.
- 모바일 glass language는 `chrome only` 원칙을 따른다. bottom nav, sticky header, overlay 같은 floating/mobile shell에는 glass를 쓸 수 있지만, dense content card와 거래형 본문 surface는 기본적으로 solid를 유지한다.
- account / utility root page(`profile`, `settings`, `notifications`, `chat`, `reviews`)는 discovery-style intro를 쓰지 않는다. 이런 화면의 모바일 상단은 `MobileGlassHeader`, 본문은 compact solid card rhythm을 기본값으로 본다.
- Mock/fixture source of truth:
  - `apps/api/test/fixtures/`
  - `apps/api/prisma/mock-data-catalog.ts`
  - `apps/web/src/test/msw/`
  - `apps/web/public/mock/`
  - `apps/web/public/mock/profile/`
  - `apps/web/public/mock/photoreal/ATTRIBUTION.md`
  - `e2e/fixtures/`
  - 필요 시 각 `*.spec.ts` / `*.test.tsx` 내부 inline mock
- Prisma 모델, DTO, API 응답, i18n 메시지, mock 이미지 전략이 바뀌면 관련 fixture/MSW/E2E/public mock 문서까지 같은 변경에서 sync한다.
- 외부 이미지 fallback 대신 `apps/web/public/mock/` 자산을 우선 사용한다.
- 사용자-facing list/detail/hero/gallery/logo 이미지가 원격 URL을 받을 수 있으면, helper가 remote URL을 반환하더라도 렌더 단계에서 로컬 mock으로 fallback되는 runtime 보호를 둔다. raw `<img>` 단독 렌더는 금지한다.
- 실사형 mock 이미지를 추가/교체할 때는 `apps/web/public/mock/photoreal/ATTRIBUTION.md`에 source URL, creator, license를 같이 기록한다.
- 현실감이 중요한 카드/리스트 이미지 슬롯은 SVG보다 실사형 로컬 mock 이미지를 우선 사용한다.
- 사용자가 실사 방향을 명시한 경우 active fallback catalog에는 실사 사진만 남기고, 생성형/SVG 자산은 동일 슬롯에 혼합하지 않는다.
- 사용자-facing create/edit 폼의 빈 업로드 슬롯도 이미지 경험의 일부로 본다. 업로드 전 비어 있는 상태라면 회색 박스만 두지 말고, helper 기반 실사 예시 스트립이나 명확한 fallback 가이드를 함께 제공한다.
- 사용자-facing 상세 이미지 확대/갤러리 경험은 generic `Modal`로 구현하지 않는다. immersive media viewing은 전용 `MediaLightbox` 패턴으로 분리하고, `Escape`, backdrop close, current index, multi-image navigation을 기본 계약으로 둔다.
- 사용자-facing create/edit 폼에서 화면에 노출한 입력, 업로드, 직접 입력 옵션은 실제 저장 경로와 반드시 일치해야 한다. 현재 저장되지 않는 선택지를 노출하는 false affordance는 금지한다.
- URL 기반 필터 화면(`matches`, `marketplace`, `lessons` 등)은 router query만 단일 source로 직접 조합하지 않는다. 빠른 연속 입력/토글에서 stale query overwrite가 발생하므로, local draft filter state를 두고 debounce/replace로 동기화한다.
- 같은 도메인 여정(`list -> create -> detail -> edit -> history`) 안의 페이지는 하나의 accent/control language를 공유해야 한다. 일부 화면만 흑백 토글이나 별도 폼 스킨으로 분리하지 않는다.
- 배지, 평점, 전적, 신뢰도처럼 사용자 의사결정에 직접 영향을 주는 신호는 `verified`, `estimated`, `sample` 상태를 명확히 구분해야 한다. mock/샘플 데이터를 실제 신뢰 신호처럼 렌더링하지 않는다.
- 실시간/optimistic 업데이트가 붙은 알림·리스트 CTA는 클릭 직후 항목 재정렬이나 unmount가 발생해도 navigation이 유실되지 않도록 구현한다. 읽음 처리와 route 전환이 서로 경쟁하는 구조는 금지한다.
- 서비스 전체 지원 범위(종목, 상태, 역할 등)는 list/create/edit/detail 하위 플로우에서도 일관되게 유지한다. 일부 화면에서만 조용히 범위를 줄이는 silent capability narrowing은 금지한다.
- edit/manage 화면은 현재 route의 실제 엔티티를 기준으로 hydrate되어야 한다. 다른 seed/mock 엔티티로 silently fallback하는 편집 화면은 금지한다.
- `venues/:id/schedule`는 free/busy 슬롯이 아니라 향후 7일간의 실제 매치 예약 목록을 반환한다. venue detail의 copy, 타입, CTA는 availability grid가 아닌 reservation list contract에 맞춰야 한다.
- 결제, 환불, 신청 확정 같은 거래형 액션은 API 실패를 성공처럼 시뮬레이션하면 안 된다. 실패 원인, 재시도, 보류 상태를 명시적으로 보여줘야 한다.
- checkout, refund, approval처럼 확정 플로우로 진입하는 CTA는 필수 컨텍스트(order id, route entity, amount 등)를 실제 서버 바인딩 기준으로 넘겨야 한다. 필수 정보 없이 화면만 이동시키는 dead-end entry는 금지한다.
- 결제 연동이 optional/mock mode라면 checkout/detail/refund 전 구간에서 `테스트 결제/환불`과 `실제 청구/실환불 없음`을 명시해야 한다. legacy 실결제 기록은 `unavailable` 상태로 분리해 CTA를 차단하고, mock 흐름을 실거래처럼 보이게 만들면 안 된다.
- admin/ops surface의 상세 링크와 후속 액션은 관리자 shell 안에서 맥락을 유지해야 한다. public surface로 이탈하는 관리 플로우는 금지한다.
- 관리자 제재/정산/분쟁 처리처럼 운영 판단이 개입되는 액션은 local mock 완료나 단순 toast만으로 끝내면 안 된다. 처리 주체, 사유, 결과, 부분 실패를 추적 가능한 형태로 남겨야 한다.
- venue 도메인은 현재 public browse/review + admin CRUD까지만 canonical contract로 본다. team과 달리 venue owner/operator membership 모델은 아직 없으므로, 팀 허브 패턴을 venue self-service에 재사용하려면 ownership/permission 모델을 먼저 설계해야 한다.
- 루트에 ad hoc 스크립트나 개인 메모 파일을 두지 않는다. 수동 QA 도구는 `scripts/qa/`, 문서 캡처 도구는 `scripts/docs/`, 버전 관리할 시각 레퍼런스는 `docs/reference/`로 보낸다.
- 전수 시각 감사의 raw screenshot/console/network 산출물은 `output/playwright/visual-audit/`를 표준 경로로 사용한다. `docs/screenshots/`에는 문서에서 직접 참조할 canonical 결과만 승격한다.
- 기능 단위 screenshot-set 분석/자동 remediation은 `scripts/qa/run-e2e-analyzer.mjs`를 canonical runner로 사용한다. monitor/cron 재실행 시 job 유실을 막기 위해 queue state는 `ultraplan/runs/e2e-analyzer*` 디스크 상태를 source of truth로 사용하고, broad visual audit의 `9` viewport baseline과 analyzer intake의 `11` code contract를 혼동하지 않는다.
- `ec2-info` 같은 호스트/운영자 로컬 메모는 git에 커밋하지 않고 ignore 상태로만 유지한다.
- `packages/`는 실제 공유 워크스페이스가 다시 필요해질 때만 되살린다. 빈 placeholder 디렉터리는 유지하지 않는다.
- task 문서는 `.github/tasks/`를 표준 경로로 사용한다. 기존 task 문서가 있으면 그 문서를 single source of truth로 갱신한다.
- 기존 task/backlog 문서를 기반으로 후속 작업을 쪼갤 때는 문서만 믿지 말고 현재 코드와 `docs/scenarios/index.md`를 함께 교차 검증한다. 이미 해결된 항목, 경로 변경, API 추가로 stale 해진 task는 그대로 재사용하지 말고 먼저 상태를 재분류하거나 supersede 문서를 남긴다.
- 기능 검증 시나리오는 `docs/scenarios/*.md`에 기능별 체크리스트로 유지하고, 진행/논의는 `docs/scenarios/index.md`에 누적한다.
- 보호 경로 E2E는 토큰 주입 직후 바로 진입하지 말고, `/home` 등에서 인증된 UI 상태가 실제로 hydrate된 뒤 다음 경로로 이동한다. 그렇지 않으면 간헐적으로 auth wall false negative가 난다.
- multi-tab Playwright E2E는 무거운 루트 `/`보다 가벼운 route 기반 storage bootstrap을 우선하고, dev-login 기반 API mutation이 간헐적 401을 내면 long-lived token 재사용보다 mutation 직전 fresh token 재발급 패턴으로 안정화한다.
- 로컬 dev DB는 Prisma schema보다 뒤처진 컬럼 드리프트(`matches.image_url`, `sport_teams.photos`)가 남아 있을 수 있다. live runtime 검증이 필요한 read/update path에서는 broad `include: true`나 default return payload 대신 explicit `select`를 우선 사용해 런타임 false negative를 줄인다.

## 4.1) Proven Pipeline Patterns

### Wave 3a → 3b Sequential-Then-Parallel (Task 21-25 파이프라인 검증)

데이터 레이어 변경이 UI 레이어에 blocking dependency를 가질 때 효과적인 패턴:

- **Wave 3a (sequential)**: 공유 타입/훅/DTO 등 다른 에이전트가 모두 의존하는 파일을 **단일 에이전트**가 먼저 완료. 예: `use-api.ts`의 `useMyTeams()` 평탄화, `MyTeam` 타입 정규화, MSW 핸들러 경로 수정.
- **Wave 3b (parallel)**: 3a 완료 후 UI 레이어(페이지/컴포넌트) 변경을 **복수 에이전트**가 병렬 실행. 각 에이전트는 서로 다른 라우트 파일을 소유하므로 충돌 없음.
- **충돌 방지 핵심**: `use-api.ts`, `types/api.ts`, `msw/handlers.ts` 같은 공유 파일은 반드시 3a에서 처리. 개별 `page.tsx`, `[id]/page.tsx`는 3b에서 병렬 가능.
- **검증 시점**: 3b 완료 후 반드시 `pnpm --filter web build` 또는 `tsc --noEmit`으로 통합 손실 확인.

## 5) Validation Commands

- Frontend unit: `pnpm --filter web test`
- Backend unit: `pnpm --filter api test`
- Backend integration: `pnpm --filter api test:integration`
- E2E: `pnpm exec playwright test --config=e2e/playwright.config.ts` 또는 `make test-e2e`
- Narrow make targets:
  - `make test-web`
  - `make test-api`
  - `make test-integration`
  - `make test-e2e`
  - `make e2e-isolated-up RUN=<id>`
  - `make test-e2e-isolated RUN=<id>`
  - `make test-e2e-isolated-spec RUN=<id> SPEC=<path> [PROJECT="Desktop Chrome"] [GREP="..."]`
  - `make e2e-isolated-down RUN=<id>`
- Cross-cutting checks:
  - `pnpm build`
  - `pnpm lint`
  - `make test`
- Docker-backed flows:
  - `make dev`
  - `make up`
  - `make down`
  - `make db-push`
  - `make db-migrate`
  - `make db-seed`

## 6) Agent Prompt Files

- prompts: `.claude/agents/prompts.md`
- team config: `.claude/agents/team-config.md`
- workflow: `.claude/agents/workflow.md`

Global rules inherited from `~/.codex/AGENTS.md`:

- language and response conventions
- commit / PR formatting
- security / secret handling
- error handling
- documentation expectations
- team-operation baseline

---
<!-- codex-init:delta version=1 timestamp=20260410_175045 -->

## Injected by codex-init

The sections below fill project-specific gaps while preserving curated content above.

### Codex Canonical Agent Docs

- Teameet의 Codex canonical agent docs는 `.codex/agents/`에 둔다.
- `.claude/agents/prompts.md`는 Codex built-in `agent-*` 스킬이 읽는 compatibility entry다.
- `.claude/agents/team-config.md`와 `.claude/agents/workflow.md`는 기존 Claude 운영 문서를 유지하되, Codex roster, alias, quality gate가 바뀌면 `.codex/agents/*`와 같은 변경에서 sync한다.
- Codex 기준 agent 라우팅 우선순위는 `.codex/agents/prompts.md` → `.codex/agents/team-config.md` → `.codex/agents/workflow.md` → `.claude/agents/prompts.md` compatibility entry 순서로 본다.

### Compatibility Guardrail

- 이 저장소의 agent 문서 표준 경로는 `.agents/`가 아니다. 신규 Codex 문서는 `.codex/agents/`, compatibility entry는 기존 `.claude/agents/`를 사용한다.
- Task 15에서 정한 canonical/compatibility split을 유지한다. `.codex/agents/`만 갱신하고 `.claude/agents/prompts.md`를 방치하는 drift는 허용하지 않는다.

<!-- /codex-init:delta -->
