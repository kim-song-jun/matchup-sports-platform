# MatchUp — AGENTS.md

Scope: **entire repository**. 이 파일은 Codex용 프로젝트 엔트리이며, 세부 규칙은 하위 문서로 라우팅합니다.

이 저장소는 전역 기준 문서인 `~/.codex/AGENTS.md`를 상속합니다. 이 파일에는 MatchUp 저장소에서만 필요한 구조, 런타임, 검증, 문서화 규칙만 추가합니다.

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
- `scripts/docs`: 문서용 스크린샷 캡처 스크립트.
- `deploy`: 프로덕션 Dockerfile 및 배포 compose.
- `infra/load`: k6 부하 테스트 하네스.
- `docs/screenshots`: 문서에서 직접 참조하는 canonical 스크린샷 자산.
- `docs/reference`: 버전 관리되는 시각 레퍼런스 자산.
- `.claude/agents`: 이 저장소의 에이전트 프롬프트, 팀 설정, 워크플로 문서. 이 저장소에서는 `.agents/`를 새로 만들지 않는다.

## 1) Always-Run Workflow

1. 변경 범위를 `backend`, `frontend`, `infra`, `docs` 중 어디까지 포함하는지 먼저 고정한다.
2. 비자명한 작업이면 `.github/tasks/`에서 기존 문서를 찾고, 없으면 해당 경로에 task/spec를 만든다.
3. 관련된 가장 좁은 파일부터 읽는다. `README.md`, `CLAUDE.md`, `.impeccable.md`, `Makefile`, 실제 설정 파일을 우선한다.
4. 가장 작은 정답을 구현하되, 범위 안의 tech debt와 mock/fixture drift는 같은 변경에서 함께 정리한다.
5. 검증은 좁게 시작해서 넓게 확장한다. 단위 테스트 → 통합 테스트 → E2E → 빌드/린트 순서를 기본으로 본다.
6. 새 규칙, gotcha, 워크플로 변경이 생기면 `AGENTS.md`와 `.claude/agents/*.md`를 같이 업데이트한다.

## 1.1) Dev Runtime

- 권장 시작 명령: `make dev` (Docker attached), `make up` (Docker detached), `make dev-local` (host에서 api + web 실행)
- Frontend: `http://localhost:3003`
- Backend API: `http://localhost:8111/api/v1`
- Swagger: `http://localhost:8111/docs`
- Prisma Studio: `make db-studio` 후 `http://localhost:5555`
- Dev compose의 Postgres/Redis는 내부 Docker 네트워크로만 접근한다. host direct connect를 전제하지 말고, 필요하면 `docker compose exec` 또는 앱/API 경유 흐름을 사용한다.
- `deploy/Dockerfile.dev`는 native addon 호환성을 위해 glibc 기반 Node 이미지를 유지한다. dev compose의 `node_modules` 볼륨은 `nocopy` + 이미지 내 `/opt/deps` bootstrap service로 매 기동 시 동기화하고, `pg_isready`는 항상 실제 DB명까지 지정한다.
- dev compose에서 `web`만 단독 restart 하지 않는다. `deps` bootstrap 없이 `web`만 다시 뜨면 `@parcel/watcher` optional binary가 빠져 Next dev가 기동 실패할 수 있으므로 `docker compose up -d deps web`로 같이 올린다.
- dev compose의 API는 `AUTH_HASH_DRIVER=bcryptjs`를 사용해 native `bcrypt`를 로드하지 않는다. production 기본값은 `bcrypt`를 유지한다.
- `web` 서비스는 `api`의 단순 프로세스 시작이 아니라 `/api/v1/health` healthcheck 통과 이후에만 의존하도록 유지한다. cold start 시 프록시 초기 요청이 API readiness보다 앞서면 간헐적 5xx가 난다.
- 로컬 Playwright E2E는 Next dev on-demand compile 부하 때문에 기본값을 `workers=1`, `fullyParallel=false`, `navigationTimeout=60_000`, `line` reporter로 유지한다. 병렬도를 올릴 때는 `PW_WORKERS`와 `PLAYWRIGHT_REPORTER`를 명시적으로 override한다.
- Next dev 기준 `/home`은 첫 컴파일 비용이 특히 무거워 60초를 넘길 수 있다. Playwright 세션 안정화나 수동 캡처 스크립트의 첫 진입점으로는 `/home`보다 `/login`, `/landing`, `/matches` 같은 더 가벼운 경로를 먼저 워밍업한 뒤 대상 페이지로 이동한다.
- Production compose 기준 포트는 `web=3000`, `api=8100`이다. dev/prod 포트를 혼동하지 않는다.
- 현재 운영 EC2는 `ec2-user`로 접속하며, Amazon Linux bootstrap은 standalone `docker-compose`를 제공할 수 있다. CI/runbook/manual deploy는 `docker compose` 플러그인만 있다고 가정하지 말고 두 형태를 모두 처리하거나 사전 검증한다.
- 운영 자동화에 destructive full seed(`prisma db seed`, `make db-seed`)를 기본 경로로 연결하지 않는다. deploy-safe data backfill은 idempotent 전용 스크립트(`prisma/seed-images.ts`, `make db-seed-images`)로 분리한다.
- 이미 실행 중인 스택이 있으면 재시작보다 현재 상태를 활용한다.

## 2) Context Budget Rules

- 파일 검색은 `rg`, 파일 목록은 `git ls-files` 또는 `rg --files`를 우선한다.
- `docs/screenshots/`, `docs/reference/`, `playwright-report/`, `test-results/`, `.playwright-mcp/`, `.pnpm-store/`, `tmp/`, `node_modules/`, `.turbo/`는 기본 탐색 대상에서 제외한다.
- `.env*`는 읽거나 출력하지 않는다. 환경 변수는 이름과 책임만 문서화한다.
- 문서가 실제 코드와 충돌하면 `apps/api/src/main.ts`, `apps/api/src/config/configuration.ts`, `apps/web/next.config.ts`, `docker-compose.yml`, `Makefile`를 우선적인 사실 원천으로 본다.

## 3) Which Instruction Set To Follow

- 전역 기본 정책: `~/.codex/AGENTS.md`
- 아키텍처/도메인/테스트 원칙: `CLAUDE.md`
- 디자인 우선순위와 UX 원칙: `.impeccable.md`
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
- 권한 검증은 라우트 가드와 서비스 계층을 함께 본다. `JwtAuthGuard`, `AdminGuard`, `TeamMembershipService.assertRole(...)` 우회를 만들지 않는다.
- 디자인 소스 우선순위:
  - `.impeccable.md`
  - `apps/web/src/app/globals.css`의 `@theme`
  - 기존 공유 컴포넌트와 토큰 사용 패턴
- Mock/fixture source of truth:
  - `apps/api/test/fixtures/`
  - `apps/web/src/test/msw/`
  - `apps/web/public/mock/`
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
- 서비스 전체 지원 범위(종목, 상태, 역할 등)는 list/create/edit/detail 하위 플로우에서도 일관되게 유지한다. 일부 화면에서만 조용히 범위를 줄이는 silent capability narrowing은 금지한다.
- edit/manage 화면은 현재 route의 실제 엔티티를 기준으로 hydrate되어야 한다. 다른 seed/mock 엔티티로 silently fallback하는 편집 화면은 금지한다.
- 결제, 환불, 신청 확정 같은 거래형 액션은 API 실패를 성공처럼 시뮬레이션하면 안 된다. 실패 원인, 재시도, 보류 상태를 명시적으로 보여줘야 한다.
- checkout, refund, approval처럼 확정 플로우로 진입하는 CTA는 필수 컨텍스트(order id, route entity, amount 등)를 실제 서버 바인딩 기준으로 넘겨야 한다. 필수 정보 없이 화면만 이동시키는 dead-end entry는 금지한다.
- admin/ops surface의 상세 링크와 후속 액션은 관리자 shell 안에서 맥락을 유지해야 한다. public surface로 이탈하는 관리 플로우는 금지한다.
- 관리자 제재/정산/분쟁 처리처럼 운영 판단이 개입되는 액션은 local mock 완료나 단순 toast만으로 끝내면 안 된다. 처리 주체, 사유, 결과, 부분 실패를 추적 가능한 형태로 남겨야 한다.
- 루트에 ad hoc 스크립트나 개인 메모 파일을 두지 않는다. 수동 QA 도구는 `scripts/qa/`, 문서 캡처 도구는 `scripts/docs/`, 버전 관리할 시각 레퍼런스는 `docs/reference/`로 보낸다.
- `ec2-info` 같은 호스트/운영자 로컬 메모는 git에 커밋하지 않고 ignore 상태로만 유지한다.
- `packages/`는 실제 공유 워크스페이스가 다시 필요해질 때만 되살린다. 빈 placeholder 디렉터리는 유지하지 않는다.
- task 문서는 `.github/tasks/`를 표준 경로로 사용한다. 기존 task 문서가 있으면 그 문서를 single source of truth로 갱신한다.
- 기능 검증 시나리오는 `docs/scenarios/*.md`에 기능별 체크리스트로 유지하고, 진행/논의는 `docs/scenarios/index.md`에 누적한다.
- 보호 경로 E2E는 토큰 주입 직후 바로 진입하지 말고, `/home` 등에서 인증된 UI 상태가 실제로 hydrate된 뒤 다음 경로로 이동한다. 그렇지 않으면 간헐적으로 auth wall false negative가 난다.

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
