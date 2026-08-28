# Teameet — AGENTS.md

Scope: **entire repository**. 이 파일은 Codex용 프로젝트 엔트리이며, 세부 규칙은 하위 문서로 라우팅합니다.

이 저장소는 전역 기준 문서인 `~/.codex/AGENTS.md`를 상속합니다. 이 파일에는 Teameet 저장소에서만 필요한 구조, 런타임, 검증, 문서화 규칙만 추가합니다.

## V1 Scope Override

이 저장소의 현재 작업 대상은 v1만 유효하다. 분석, 구현, 리팩토링, DB 설계, Prisma 작업, API 설계, 프론트엔드 작업, 리뷰, QA, 문서화 전에 반드시 아래 순서로 컨텍스트를 확인한다.

1. `AGENTS.md`
2. `.codex/AGENTS.md`
3. `.codex/qa-rules.md`
4. 작업과 관련된 `.codex/*.md`
5. 관련 v1 소스: `apps/v1_api`, `apps/v1_web`, Android 작업이면 `apps/v1_android`
6. UI/디자인 작업이면 `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`

유효한 소스는 아래로 제한한다.

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Android: `apps/v1_android`
- Design source of truth: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design source: explicitly requested/pinned Open Design recovery tasks may use `docs/reference/open-design/**` and the user-provided Open Design export as read-only visual references. This does not make design-only Open Design pages valid runtime routes without a v1 route/API contract.
- Codex project rules: `.codex/*`

Legacy code, deprecated code, old API design, old DB design, old Prisma schema/migration/seed, old mock data, old screen design은 참조하지 않는다. 같은 기능이 legacy에 있어도 v1 판단 근거로 사용하지 않는다.

기존 저장소 지침이 이 섹션 또는 `.codex/*`와 충돌하면 이 섹션과 `.codex/*`를 우선한다.

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

- `apps/v1_web`: v1 Next.js App Router 프론트엔드.
- `apps/v1_android`: 배포된 v1 Web을 로드하고 Android FCM/권한/딥링크를 담당하는 네이티브 셸.
- `apps/v1_api`: v1 NestJS 백엔드.
- `apps/v1_api/prisma`: v1 Prisma schema, migration, seed.
- `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`: v1 UI/디자인 source of truth.
- `.codex`: v1 프로젝트 규칙과 Codex 에이전트 문서.
- `e2e`: Playwright E2E와 `e2e/fixtures` 페르소나/헬퍼.
- `scripts/qa`: 수동 QA, route smoke, UI gap 감사 같은 보조 스크립트.
- `ultraplan/runs/e2e-analyzer*`: 기능 단위 screenshot-set queue, task/report handoff, stale-job recovery state.
- `scripts/docs`: 문서용 스크린샷 캡처 스크립트.
- `deploy`: 프로덕션 Dockerfile 및 배포 compose.
- `infra/load`: k6 부하 테스트 하네스.
- `docs/screenshots`: 문서에서 직접 참조하는 canonical 스크린샷 자산.
- `docs/reference`: 버전 관리되는 시각 레퍼런스 자산.
- `.claude/agents`: compatibility prompt entry. canonical Codex agent docs는 `.codex/agents`다.

## 1) Always-Run Workflow

1. 변경 범위를 `backend`, `frontend`, `infra`, `docs` 중 어디까지 포함하는지 먼저 고정한다.
2. 비자명한 작업이면 `.github/tasks/`에서 기존 문서를 찾고, 없으면 해당 경로에 task/spec를 만든다.
3. 관련된 가장 좁은 v1 파일부터 읽는다. `.codex/AGENTS.md`, `.codex/qa-rules.md`, 관련 `.codex/*.md`, `apps/v1_api`, `apps/v1_web`, `Makefile`, 실제 설정 파일을 우선한다.
4. 가장 작은 정답을 구현하되, 범위 안의 tech debt와 mock/fixture drift는 같은 변경에서 함께 정리한다.
5. 검증은 좁게 시작해서 넓게 확장한다. 단위 테스트 → 통합 테스트 → E2E → 빌드/린트 순서를 기본으로 본다.
6. 새 규칙, gotcha, 워크플로 변경이 생기면 `AGENTS.md`와 `.claude/agents/*.md`를 같이 업데이트한다.
7. 사용자가 `@전체` / `agent-all`을 명시한 경우, plan → build → review → design → QA → docs 전체를 같은 실행에서 끝까지 진행한다. 중간 단계 보고 후 멈추지 말고, 검증이 런타임 이슈로 막히면 정확한 blocker를 기록한 뒤 남은 문서화와 최종 리포트까지 완료한다.

## 1.1) Session Operation Pattern

큰 작업은 `runtime task list + committed task doc + git history` 3축을 resume cursor로 유지한다.

- Runtime task list: Codex에서는 `update_plan`을 TaskCreate/TaskUpdate/TaskList에 대응하는 진행판으로 사용한다. Phase/Wave가 2개 이상이면 각 Phase를 명시적 task로 등록하고 `pending -> in_progress -> completed` 상태를 갱신한다.
- Committed task doc: 작업의 SSOT는 `.github/tasks/{NN}-{slug}.md`다. 체크박스, 병렬 분해, Owned/Forbidden file scope, Acceptance Criteria, Ambiguity Log, Progress Snapshot은 별도 프롬프트 파일이 아니라 해당 task doc에 남긴다.
- Scenario / QA status: 시나리오 기반 검증은 `docs/scenarios/index.md`와 `docs/scenarios/*.md`를 상태 허브로 사용한다. `autoqa` 작업은 `.autoqa/status.md` 또는 해당 operator status 문서가 있으면 우선 확인한다.
- Git cursor: 세션 재개나 handoff 때는 `git log --oneline -15`로 최근 커밋 경계를 확인하고, task doc의 Progress Snapshot과 맞지 않으면 먼저 drift를 정리한다.

### Resume 3-File Routine

세션이 끊기거나 새 에이전트가 이어받을 때는 넓은 재탐색 전에 아래 3가지만 먼저 읽고 현재 위치를 복원한다.

1. Active task/status hub: `.github/tasks/{NN}-{slug}.md`, 없으면 `.github/tasks/`의 관련 task, scenario 작업이면 `docs/scenarios/index.md`, autoqa 작업이면 `.autoqa/status.md`
2. Recent git cursor: `git log --oneline -15`
3. Active task doc의 `Progress Snapshot`, 체크박스, Acceptance Criteria, Ambiguity Log

Active task가 불명확하면 새 작업을 시작하기 전에 관련 task doc, `docs/scenarios/index.md`, 현재 구현 증거를 교차 검증해 canonical task를 먼저 고정한다.

### Async Agent Dispatch

- 사용자가 `@전체`, `agent-all`, 병렬 에이전트, 서브에이전트를 명시한 경우에만 에이전트 병렬화를 사용한다.
- 에이전트 프롬프트에는 긴 요구사항을 복붙하지 말고 task doc 경로, 담당 Phase/Wave, Owned files, Forbidden files, Acceptance Criteria만 지정한다.
- 독립 작업은 비동기로 dispatch하고 메인 세션은 다른 non-overlapping 작업을 계속 진행한다. Codex에서는 `spawn_agent` 후 즉시 로컬 작업을 이어가고, 다른 런타임에서 지원되면 `run_in_background: true`를 사용한다.
- `wait_agent`나 polling은 다음 critical path가 해당 결과에 막힐 때만 사용한다. background agent는 완료 알림/요약을 기다리고, 전문 transcript 파일을 읽어 컨텍스트를 소모하지 않는다.
- `/private/tmp/claude-*/tasks/*.output` 같은 서브에이전트 transcript는 사용자가 명시적으로 허용하지 않는 한 읽지 않는다.
- 병렬 구현 시 공유 파일과 route/page 소유권을 분리한다. `use-api.ts`, 타입, MSW handler 같은 shared contract는 선행 Wave에서 한 에이전트가 맡고, page/component 변경은 이후 Wave에서 병렬화한다.

### Schedule / Wakeup Tools

- ScheduleWakeup류 도구는 장기 loop/polling 자동화에만 사용한다.
- background agent 완료 대기 용도로 ScheduleWakeup을 호출하지 않는다. 완료 notification이 없는 런타임이면 foreground check 또는 cron fallback처럼 명시된 operator contract로 degrade한다.

## 1.2) Dev Runtime

- v1 frontend dev server: `pnpm --filter v1_web dev`
- v1 frontend default URL: `http://localhost:3013`
- v1 backend dev server: `pnpm --filter v1_api dev`
- v1 backend default URL: `http://localhost:8121/api/v1`
- v1 backend API prefix: `/api/v1`
- v1 Prisma commands:
  - `pnpm v1:db:generate`
  - `pnpm v1:db:push`
  - `pnpm v1:db:migrate`
  - `pnpm v1:db:studio`
  - `pnpm v1:db:seed`
- Root `make dev` / old compose commands may still exist, but do not treat their legacy app paths as implementation source unless the task is explicitly infra compatibility.
- Do not run destructive seed/reset flows unless the user explicitly asks for them.
- `.env*` files are never read or printed.

## 1.3) QA Operating Gates

`.codex/qa-rules.md` is the canonical QA and review policy for this repository. All non-trivial implementation, review, UI/design, admin/permission, documentation-policy, and `.ulw` loop work must apply it before final response.

- No useless fallback: 실패를 성공처럼 숨기는 fallback, mock 완료, silent success, dead-end navigation은 만들지 않는다. 실패하면 실제 에러와 원인을 노출한다.
- No fake tests: 실제 route/API/action/user-visible contract가 깨져도 통과하는 테스트는 검증으로 인정하지 않는다. 가능한 경우 RED -> GREEN 증거를 남긴다.
- Minimal validation load: 이 규칙은 코드 분석·수정·리팩토링을 중단시키는 규칙이 아니다. 구현은 계속 진행하고, 변경 계약을 증명하는 가장 좁은 검증을 1회 실행한다. typecheck·build·전체 test·lint 같은 고부하 검증은 커밋 직전 변경 범위에 한해 1회만 실행하며, CI가 수행할 반복 전체 검증을 로컬에서 중복하지 않는다.
- Host load preflight: 자동 테스트·typecheck·build·lint 전에 CPU/load, 메모리·swap, Node/브라우저 프로세스 수, Docker·대상 서비스 상태를 확인한다. 압박이 보이면 새 부하 작업을 시작하지 않고 상태를 먼저 보고하며, 실행 시 직렬·최소 worker를 사용하고 내가 만든 프로세스만 정리한다.
- Headed Playwright MCP only: Playwright MCP로 수동 UI/클릭 QA를 수행할 때는 실제 브라우저 창이 보이는 headed 세션만 사용한다. `--headless` MCP를 시작하거나 백그라운드에 상시 유지하지 않으며, 시작한 MCP·브라우저의 PID/PPID를 기록하고 QA 종료 시 해당 트리만 정리한다. CI 전용 비대화형 브라우저 검증은 이 MCP 수명주기 규칙과 별도로 관리한다.
- Visual verification before completion: UI/레이아웃/반응형/admin surface 변경은 tests pass is not completion이다. Playwright screenshot, console/network 확인, before/after screenshot evidence, viewport별 verdict가 필요하다.
- Layout rebalance: UI 요소 제거/재배치 뒤에는 spacing, scroll, sticky chrome, focus order, desktop/tablet/mobile 레이아웃을 다시 맞춘다.
- No scope retreat: `전체`, `모든 라우트`, `모든 페이지`, 고정 agent 수, comprehensive QA 요청은 전체 수를 확정하고 processed M/N으로 보고한다.
- Tech-Debt Grep: 완료 전 touched path에서 `TODO`, `FIXME`, `HACK`, `XXX`를 확인하고 새 marker는 이유와 후속 경로를 남긴다.
- Committed-tree verification: dirty working tree의 local test만으로 PR-ready라고 말하지 않는다. `git diff --name-only`, `git diff --check`, untracked import 여부, committed-tree/PR diff 기준을 확인한다.
- Shared-tree pathspec safety: 관련 없는 WIP가 많은 shared tree에서는 `git add -A`를 쓰지 않는다. commit 요청이 있으면 `git commit -- <pathspec>`처럼 명시 pathspec만 사용하고, `git show --stat`/`git show --name-only`로 diff scope를 확인한다. sub-agent self-commit은 root agent가 명시한 exact scope 없이는 금지한다.
- No left accent rail: decorative left rail, purple/tint/dashed/glow decoration으로 화면을 꾸미지 않는다. hierarchy, spacing, typography, semantic color only로 강조한다.
- manual QA evidence: 기능, 권한, admin, 라우팅, responsive 변경은 실제 브라우저/CLI 시나리오, persona, viewport, 결과, cleanup을 증거로 남긴다.

## 2) Context Budget Rules

- 파일 검색은 `rg`, 파일 목록은 `git ls-files` 또는 `rg --files`를 우선한다.
- `docs/screenshots/`, `playwright-report/`, `test-results/`, `.playwright-mcp/`, `.pnpm-store/`, `tmp/`, `node_modules/`, `.turbo/`는 기본 탐색 대상에서 제외한다. 단, UI/디자인 작업에서는 `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`을 반드시 확인한다.
- `.env*`는 읽거나 출력하지 않는다. 환경 변수는 이름과 책임만 문서화한다.
- 문서가 실제 코드와 충돌하면 v1 기준 파일인 `apps/v1_api/src/main.ts`, `apps/v1_api/src/config/**`, `apps/v1_web/next.config.ts`, `docker-compose.yml`, `Makefile`를 우선적인 사실 원천으로 본다.

## 3) Which Instruction Set To Follow

- 전역 기본 정책: `~/.codex/AGENTS.md`
- v1 프로젝트 컨텍스트: `.codex/project-context.md`
- v1 아키텍처/도메인 원칙: `.codex/architecture.md`
- v1 API/DB/Prisma 원칙: `.codex/api-rules.md`, `.codex/db-rules.md`, `.codex/prisma-rules.md`
- v1 프론트엔드/디자인 원칙: `.codex/frontend-rules.md`, `.codex/design-rules.md`
- v1 QA/리뷰 완료 기준: `.codex/qa-rules.md`
- 에이전트 역할/팀/파이프라인: `.codex/agents/prompts.md`, `.codex/agents/team-config.md`, `.codex/agents/workflow.md`
- compatibility prompt entry: `.claude/agents/prompts.md`
- 실행/검증 명령: `README.md`, `Makefile`
- 프로젝트 현황/기능 맵: `docs/PROJECT_OVERVIEW.md`, `docs/WORK_SUMMARY.md`

## 4) Project-Specific Development Rules

- 저장소 타입은 `pnpm workspaces + Turborepo` 기반 `fullstack-web` 모노레포다.
- 프론트엔드는 `apps/v1_web`의 App Router 구조를 유지한다.
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
  - 프론트 통합용 API 문서는 Swagger만 단독 source of truth로 쓰지 않는다. v1 `controller` + DTO + service status gate + integration test + `apps/v1_web`의 관련 hooks/types를 함께 교차검증하고, auth/permission/error/pagination/multipart/idempotency/mock-vs-real gotcha를 명시해야 한다.
  - controller/DTO/service 계약이 바뀌면 `docs/api/domains/*.md`를 **같은 변경**에서 sync한다. `@docs` 호출 시 docs-writer가 이 sync를 검증한다. Canonical contract 문서 경로: `docs/api/` (README + global-contract + domains/*).
- 권한 검증은 라우트 가드와 서비스 계층을 함께 본다. `JwtAuthGuard`, `AdminGuard`, `TeamMembershipService.assertRole(...)` 우회를 만들지 않는다.
- 디자인 소스 우선순위:
  - `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
  - explicitly pinned Open Design recovery/remake references under `docs/reference/open-design/**` or the user-provided Open Design export, only for that scoped task
  - `apps/v1_web`의 기존 공유 컴포넌트와 토큰 사용 패턴
- shadow는 깊이감 보조 수단으로만 사용한다. content card에서 deep shadow, stacked shadow, glow shadow를 기본 스타일로 쓰지 않는다.
- border는 subtle full-border 또는 borderless separation 중 하나만 선택한다. thick border, one-side accent border, border-heavy nested container는 금지한다.
- 레이아웃은 Toss-like clean layout을 기준으로 `text-first`, `section-clear`, `action-obvious` 상태를 우선한다. utility page를 hero/card showcase처럼 만들지 않는다.
- public informational page(`landing`, `about`, `guide`, `pricing`, `faq`)의 above-the-fold는 badge/title만으로 비워두지 않는다. 첫 화면 안에 primary CTA 또는 next-step summary가 즉시 보여야 하고, 핵심 heading/summary는 `ScrollReveal` 같은 viewport-intersection 연출 뒤에 숨기지 않는다.
- 모바일 glass language는 `chrome only` 원칙을 따른다. bottom nav, sticky header, overlay 같은 floating/mobile shell에는 glass를 쓸 수 있지만, dense content card와 거래형 본문 surface는 기본적으로 solid를 유지한다.
- `backdrop-blur`/`backdrop-filter`가 걸린 fixed header/nav 안에 viewport-fixed drawer나 sheet를 직접 중첩하지 않는다. blur parent가 fixed descendant의 containing block이 되어 `top/bottom` anchor가 깨질 수 있으므로, 모바일 drawer는 header 바깥 sibling layer로 렌더한다.
- account / utility root page(`profile`, `settings`, `notifications`, `chat`, `reviews`)는 discovery-style intro를 쓰지 않는다. 이런 화면의 모바일 상단은 `MobileGlassHeader`, 본문은 compact solid card rhythm을 기본값으로 본다.
- Mock/fixture source of truth:
  - `apps/v1_api/test/fixtures/`
  - `apps/v1_api/prisma/`
  - `apps/v1_web/src/test/msw/`
  - `apps/v1_web/public/mock/`
  - `e2e/fixtures/`
  - 필요 시 각 `*.spec.ts` / `*.test.tsx` 내부 inline mock
- Prisma 모델, DTO, API 응답, i18n 메시지, mock 이미지 전략이 바뀌면 관련 fixture/MSW/E2E/public mock 문서까지 같은 변경에서 sync한다.
- 외부 이미지 fallback 대신 `apps/v1_web/public/mock/` 자산을 우선 사용한다.
- 사용자-facing list/detail/hero/gallery/logo 이미지가 원격 URL을 받을 수 있으면, helper가 remote URL을 반환하더라도 렌더 단계에서 로컬 mock으로 fallback되는 runtime 보호를 둔다. raw `<img>` 단독 렌더는 금지한다.
- 실사형 mock 이미지를 추가/교체할 때는 `apps/v1_web/public/mock/` 아래의 attribution 문서에 source URL, creator, license를 같이 기록한다.
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
- Windows PowerShell에서 한글이 포함된 SQL을 문자열 파이프로 `docker compose exec ... psql`에 전달하지 않는다. PowerShell 5 파이프 인코딩이 비 ASCII 문자를 `?`로 치환할 수 있으므로, UTF-8 파일을 보존하는 migration runner 또는 애플리케이션의 parameterized Prisma script를 사용하고 DB/API 한글 round-trip을 검증한다.

## 4.1) Proven Pipeline Patterns

### Wave 3a → 3b Sequential-Then-Parallel (Task 21-25 파이프라인 검증)

데이터 레이어 변경이 UI 레이어에 blocking dependency를 가질 때 효과적인 패턴:

- **Wave 3a (sequential)**: 공유 타입/훅/DTO 등 다른 에이전트가 모두 의존하는 파일을 **단일 에이전트**가 먼저 완료. 예: `use-api.ts`의 `useMyTeams()` 평탄화, `MyTeam` 타입 정규화, MSW 핸들러 경로 수정.
- **Wave 3b (parallel)**: 3a 완료 후 UI 레이어(페이지/컴포넌트) 변경을 **복수 에이전트**가 병렬 실행. 각 에이전트는 서로 다른 라우트 파일을 소유하므로 충돌 없음.
- **충돌 방지 핵심**: `use-api.ts`, `types/api.ts`, `msw/handlers.ts` 같은 공유 파일은 반드시 3a에서 처리. 개별 `page.tsx`, `[id]/page.tsx`는 3b에서 병렬 가능.
- **검증 시점**: 3b 완료 후 반드시 `pnpm --filter v1_web build` 또는 v1 type check로 통합 손실 확인.

### Wave 0 Serial-Schema + Wave 1 4-way Parallel (Task 69 파이프라인 검증)

Prisma enum 확장처럼 모든 에이전트가 의존하는 스키마 변경이 선행될 때 효과적인 패턴:

- **Wave 0 (serial, 단일 에이전트)**: `schema.prisma` enum 추가 + migration + `notification-presentation.ts` 매핑 + seed/fixture 업데이트를 backend-data-dev 단독으로 완료. 이 wave가 머지되기 전에 Wave 1 시작 금지.
- **Wave 1 (4-way parallel)**: backend-data-dev / backend-api-dev / frontend-data-dev / frontend-ui-dev 가 각자의 수직 도메인(서비스 레이어 / 컨트롤러+DTO / 훅+타입+MSW / 페이지+컴포넌트)을 소유하고 동시 작업. 파일 도메인이 수직 분리되어 충돌 없음.
- **리뷰-수정 반복**: backend+frontend 리뷰 동시 실행 → Critical 0 될 때까지 fix round 반복 (이 파이프라인은 3회 소요). 디자인 라운드는 frontend PASS 이후 진입.
- **QA gate**: 리뷰 + 디자인 PASS 후 QA 진입. BLOCKING 발견 시 수정 후 관련 에이전트만 재실행.
- **검증 기준**: `tsc --noEmit` green(양 패키지), API 전체 suite, Web 전체 suite 모두 통과 후 완료 처리.
- **주의**: `matches.service.ts`처럼 Wave 1B와 Wave 2A가 같은 파일을 수정해야 할 경우, 두 wave를 하나의 에이전트(backend-integration-dev)가 순차 처리하도록 병합 (동시 수정 충돌 방지).

## 5) Validation Commands

- Frontend unit: `pnpm --filter v1_web test`
- Frontend build: `pnpm --filter v1_web build`
- Backend unit: `pnpm --filter v1_api test`
- Backend integration: `pnpm --filter v1_api test:integration`
- V1 combined unit: `pnpm v1:test`
- Prisma:
  - `pnpm v1:db:generate`
  - `pnpm v1:db:push`
  - `pnpm v1:db:migrate`
  - `pnpm v1:db:studio`
  - `pnpm v1:db:seed`
- E2E may use repository Playwright config only after confirming it targets v1 routes and data.

## 6) Agent Prompt Files

- prompts: `.codex/agents/prompts.md`
- team config: `.codex/agents/team-config.md`
- workflow: `.codex/agents/workflow.md`
- compatibility entry: `.claude/agents/prompts.md`

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
- `.claude/agents/prompts.md`는 compatibility entry로 유지하되, Codex roster, alias, quality gate가 바뀌면 `.codex/agents/*`와 같은 변경에서 sync한다.
- Codex 기준 agent 라우팅 우선순위는 `.codex/agents/prompts.md` → `.codex/agents/team-config.md` → `.codex/agents/workflow.md` → `.claude/agents/prompts.md` compatibility entry 순서로 본다.

### Compatibility Guardrail

- 이 저장소의 agent 문서 표준 경로는 `.agents/`가 아니다. 신규 Codex 문서는 `.codex/agents/`, compatibility entry는 기존 `.claude/agents/`를 사용한다.
- Task 15에서 정한 canonical/compatibility split을 유지한다. `.codex/agents/`만 갱신하고 `.claude/agents/prompts.md`를 방치하는 drift는 허용하지 않는다.

<!-- /codex-init:delta -->

---

# 공통 운영 규칙 (Codex ↔ Claude 공유)

> **정본은 저장소 루트 `CLAUDE.md`와 사용자 전역 `~/.claude/CLAUDE.md`다.** 이 절은 Codex가
> 그 문서를 읽지 않고도 지킬 수 있도록 **어기면 바로 사고가 나는 규칙만** 추린 것이다.
> 충돌하면 `CLAUDE.md`가 이긴다. 여기와 `CLAUDE.md`가 어긋난 걸 발견하면 **고치는 것도
> 같은 변경에서 한다** — 이 저장소는 과거에 캡처 스크립트 경로 컨벤션이 두 문서에서
> 달라 리뷰어가 반복 지적한 전례가 있다.

## S1) 브랜치 · 배포 정책 (Critical — 2026-07-31 실측 기준 정정)

> 이전 판은 "`main`은 유산 브랜치이고 배포와 무관"이라고 적고 있었는데 **사실이 아니다.**
> 그 서술 때문에 `deploy.yml`의 main 전용 job을 dead code로 오판해 삭제 직전까지 간 사고가
> 2026-07-31에 있었다 — 그 job은 라이브 프로덕션(teameet.co.kr)의 유일한 배포 경로다.

- **`dev`와 `main` 둘 다 살아 있고 각자 다른 환경을 배포한다.**
  - `dev` push → `deploy-alpha.yml` → **alpha.teameet.co.kr**, 승인 게이트 없음.
  - `main` push → `deploy.yml`의 `build-images` + `deploy` job → **teameet.co.kr(프로덕션)**,
    `environment: production` 승인 게이트 있음. 2026-07-27까지 6회 성공한 살아 있는 경로다.
- **모든 작업은 `dev`에서만.** 작업 브랜치·PR의 base는 항상 `dev`. 기능의 "완료" = dev 머지.
- **`dev` → `main` 승격은 사용자만 한다.** 에이전트는 `git push`/`gh pr merge`/
  `gh pr create --base main` 어느 방식으로도 **직접 실행하지 않는다** — 필요해 보이면 사용자에게
  알리고 멈춘다. 사용자가 GitHub에서 PR을 머지하는 것이 유일한 승격 경로이고, 자동으로 승격하는
  워크플로는 없다(워크플로의 `refs/heads/main` 참조는 전부 감지용 `if:` 조건이다).
- **`main`에 dev에 없는 커밋이 생겼다면** `origin/main → dev` 방향으로만 흡수한다.
- **`main`에는 classic branch protection은 없지만 ruleset이 걸려 있다**(2026-08-09 실측 정정).
  `branches/main/protection`은 `404 Branch not protected`지만, ruleset "Copilot review for
  default branch"(active)가 `deletion`·`non_fast_forward`·`copilot_code_review`를 강제한다 —
  main으로의 force-push·삭제는 실제로 막힌다(#231 롤백이 `git revert`로만 가능했던 이유).
  일반 fast-forward 직접 push는 여전히 가능해 그대로 프로덕션 배포로 이어지므로 더 조심한다.
  확인은 `gh api repos/<owner>/<repo>/rulesets`(classic protection API만 보면 놓친다).
- **머지·push 전에 항상 `baseRefName`을 확인한다.** dev용 PR을 `mergeable`/CI만 보고 머지했다가
  base가 main이라 프로덕션에 머지된 사고가 있었다(2026-08-09). `gh pr merge`는 PR의 base로
  머지하니, 직전에 `gh pr view <N> --json baseRefName`으로 `dev`임을 확인하고 아니면
  `gh pr edit <N> --base dev`로 재타깃한다. main은 ruleset 때문에 force-push 롤백이 안 돼
  `git revert`로만 수습되므로 사전 확인이 유일한 값싼 방어다.
- **dev push = alpha 자동 실배포.** `deploy-alpha.yml`이 승인 게이트 없이
  alpha.teameet.co.kr에 배포한다 → **dev 머지 전 검증(테스트·tsc·lint)을 실배포
  게이트로 취급하라.**
- **worktree는 항상 `git fetch origin dev` **직후** `origin/dev`에서 만든다.**
  로컬 `dev` 브랜치를 체크아웃해 base로 쓰지 않는다 — 여러 세션이 각자
  `.claude/worktrees/*`를 쓰는 공유 환경이라 로컬 `dev`가 이미 다른 worktree에 물려 있다.
- **착수 전 `fetch`, 머지 후 로컬 `dev` 동기화 (2026-08-23 사용자 지시, 양쪽 다 필수).**
  어떤 작업이든 시작 전에 `git fetch origin dev`를 먼저 돌린다 — 뒤처진 ref를 현행으로 착각하면
  이미 고쳐진 것을 다시 고친다. 그리고 PR이 `origin/dev`에 머지되면 **머지 하나당 한 번, 즉시**
  메인 작업트리의 로컬 `dev`를 따라잡힌다:
  ```bash
  cd /Users/sungjun/Dev/projects/matchup-sports-platform
  git fetch origin dev -q && git merge --ff-only origin/dev
  ```
  **반드시 `--ff-only`** (`git pull`·rebase·`reset` 금지 — 공유 트리의 타 세션 변경을 건드린다).
  FF가 거부되면 `git status --porcelain` ∩ `git diff --name-only HEAD origin/dev`로 충돌 파일만
  특정해 스크래치패드에 백업한 뒤 원복·FF 하고, 백업 경로를 사용자에게 알린다. 지우지 않는다.

## S2) 공유 작업트리 git 안전 (Critical)

하나의 저장소를 여러 세션이 동시에 쓴다. 아래는 그 자체로 Critical이며 사용자 명시 승인
없이는 금지한다.

- **`git stash` 절대 금지.** 작업트리 *전체*의 미커밋 변경을 숨긴다 — 다른 세션이 쓰는 중인
  변경까지 사라진다. 불가피하면 내 파일만 따로 복사/커밋한다.
- **파괴 명령 금지**: `git reset --hard`, 내가 만들지 않은 변경에 대한 `git checkout --`/
  `git restore`, `git clean -fd`, `git add -A`, `git commit -a`.
- **커밋은 내가 만든 파일만 pathspec으로**: `git commit -m "..." -- <명시 경로>` 후 즉시
  `git show --stat HEAD`로 휩쓸린 파일이 없는지 검증한다.
- **다른 세션이 동시 수정 중인 공유 파일은 직접 편집하지 않는다.** 바꿔야 하면 해당 위치에
  코드 주석으로 "무엇을·어떻게"만 남긴다.
- 새로 만든 파일은 pathspec 커밋 전에 `git add`(또는 `git add -N`)가 필요하다 — 안 하면
  `did not match any file(s) known to git`으로 실패한다.

## S3) DB 마이그레이션 규율 (Critical)

- **스키마 변경은 반드시 migration 파일을 동반한다.** `prisma db push`로만 dev에 반영하고
  migration을 빠뜨리면 prod `migrate deploy`가 깨진다(실사례: 리뷰 테이블 migration 누락 →
  배포 중단·서비스 장애).
- CI의 `V1 migration replay + drift gate`가 ① 빈 DB에 전체 체인 재생 ② `schema.prisma`
  드리프트 0을 강제한다.
- 수동 SQL로 dev에 먼저 적용했다면 같은 내용을 **idempotent migration**으로 작성하고
  `prisma migrate resolve --applied`로 박제한다.

## S4) 품질 원칙

- **기술부채를 남기지 않는다.** 범위 안의 dead code·workaround·미완 처리는 그것을 건드린
  *같은 변경*에서 완전히 해결한다(전수 확인 후 완전 삭제 포함).
- **쓸데없는 fallback 금지.** 임시 우회로 문제를 덮지 말고 근본 원인을 해결한다. 단 의미 있는
  에러 처리(try/catch + 사용자 알림)는 fallback이 아니다. **silent catch(빈 catch)는 안티패턴.**
- **진짜 테스트만.** "이 테스트가 깨지면 실제 버그를 잡는가"를 만족해야 한다. mock 자체를
  검증하지 않는다(불가피한 브라우저 API mock은 예외).
- **검증은 변경 크기에 비례한다.** 한 줄·문서·버전 bump 같은 기계적 변경에 전용 테스트나
  서브에이전트 왕복을 붙이지 않는다. 풀스위트는 통합·릴리스 게이트에서만 돌린다.
- **모호하면 추측하지 않는다.** 컴파일만 되는 "가장 쉬운 경로"를 고르지 않는다. 원본 요청의
  모든 조건이 설계 → 구현 → 검증까지 살아 있어야 한다.

## S5) UI 변경

- **착수 전: A·B·C 3안 브레인스토밍 필수** (2026-08-23 사용자 지시). 화면·컴포넌트·레이아웃을
  새로 만들거나 바꾸는 작업은 **코드를 쓰기 전에** A·B·C 3안 + 추천안을 제시하고 선택을 받는다.
  - 3안은 **서로 다른 원칙**이어야 한다(같은 안의 미세 변형 3개는 3안이 아니다). 각 안에
    **장점과 단점을 모두** 적는다 — "단점 없음" 금지.
  - 목업은 **production fidelity** — low-fi 와이어프레임 금지. 실제 디자인 시스템(토큰·기존
    컴포넌트·다크모드·44px 터치·WCAG AA)을 그대로 적용하고, 재사용할 기존 컴포넌트를 명시한다.
  - 제시 순서: ① 3안 비교표(축·장단점·작업규모) → ② `AskUserQuestion` 으로 선택. 선택 전 구현 금지.
  - 대상 아님: 오타·토큰 치환 같은 1줄 기계적 수정, 백엔드/로직 전용 변경.
  - 정본: `CLAUDE.md` 의 "UI 착수 규칙 — A·B·C 3안 브레인스토밍 필수".
- **접근성 위반을 지적하기 전에 `docs/design/a11y-decisions.md` 를 먼저 본다.** 기준(WCAG 2.1 AA,
  대비 4.5:1, 44px 터치)에 못 미치지만 **근거와 함께 그대로 두기로 결정한 것들**이 거기 모여 있다 —
  등재돼 있으면 그 지적은 닫고, 없으면 고칠 대상이다. 새로 "안 고치기로" 정하면 그 문서에 추가한다.
  정본: `CLAUDE.md` 의 "프론트엔드 품질 기준 > 접근성 기준".
- **변경 후 라이브 시각 검증 필수.** 단위 테스트는 요소 존재/부재만 잡고 레이아웃 균형·정렬을
  못 잡는다 → `tsc 0 + 테스트 pass + lint 0`만으로는 완료가 아니다. 스크린샷으로 확인한다.
- **요소 제거/재배치 = 레이아웃 재균형까지가 한 작업.** 제거한 요소가 채우던 공간·시각 무게를
  함께 재설계한다.
- **UI 변경 PR은 예외 없이 📱mobile 390 / 📲tablet 768 / 🖥desktop 1440 3폭 스크린샷 갤러리를
  PR 코멘트로 첨부한다.** 뒤늦게 인지했으면 그 PR에 추가로 게시해 채운다.
  (로직/백엔드 전용 PR은 대상 아님.)
- 와이드(1440~2560) 반응형 검증은 스크린샷 썸네일이 아니라 **치수 측정**이 신뢰할 수 있다.

## S6) PR · 리뷰 워크플로

상세 런북: `docs/ops/pr-review-visual-workflow.md`

- **PR 제목·본문은 한국어로 작성한다.** (커밋 메시지 관례와 별개 규칙)
- **v1 기능 PR엔 `.changeset/*.md`가 필수다.** 없으면 dev-push CI가 실패하고 alpha 배포가
  막힌다(PR CI는 통과해도). 단 `.md`·테스트·`docs/`·`scripts/qa/` 변경은 대상이 아니다.
- **Copilot 리뷰는 `generated no new comments`가 나올 때까지 반복한다.**
  요청은 `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer`
  (REST `requested_reviewers`는 422). 도착은 비동기 ~3–8분.
  각 finding은 **적대적으로 검증해 real만 수정**한다 — Copilot도 틀린다. 스레드는 GraphQL
  `addPullRequestReviewThreadReply` + `resolveReviewThread`로 답변·resolve한다.
  실적: 9라운드 18건 전부 real이었던 사례가 있고, **늦은 라운드에 나온 게 더 치명적일 수
  있다.**
- 머지 준비 = `MERGEABLE/CLEAN` + 미해결 스레드 0 + CI pass.
- CI flake(Postgres `40P01 deadlock` 등)는 내 변경과 무관함을 확인한 뒤
  `gh run rerun <id> --failed`.
- **로컬 tsc 통과 ≠ CI 빌드 통과.** 공유 트리의 로컬 검사는 *미커밋 워킹트리*(타 세션 것 포함)를
  보지만 CI는 **커밋본**을 빌드한다. push 전 커밋본 기준으로 확인하라.
- **런타임·환경 의존 동작은 로컬 포렌식 말고 alpha 배포로 검증한다(Critical, 2026-08-09 실사고).**
  SSR 상태코드·스트리밍·프로덕션 렌더처럼 환경에 따라 달라지는 동작은 로컬 `next start`/`next build`
  반복 실험에 세션을 태우지 말고, **fix 후보를 dev 머지해 alpha 실배포에서 직접 재측정**하라(이 레포의
  ground truth). 실사고: schedule not-found HTTP 200 을 로컬에서 파다 좀비 next-server(`kill`이 래퍼만
  죽여 자식이 포트 점유 → stale 빌드 서빙)와 병렬 `next dev` 로 거짓 결론을 냈다. 불가피하게 로컬 prod
  렌더가 필요하면 `next start` 대신 `node .next/standalone/apps/v1_web/server.js` + fresh 포트 + `lsof`
  로 실제 PID 확인·종료. 그래도 1순위는 alpha 배포-측정.

## S7) 로컬 dev 서버 · 호스트 부하

- **web·api 각 1쌍만 유지한다.** 검증용 임시 서버는 끝나는 즉시 종료한다. 새로 띄우기 전
  기존 프로세스를 먼저 확인하라(단순 `grep node`는 무관한 프로세스를 잡아 잘못된 PID를 kill할
  위험이 있다):
  ```
  lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3003|3013|301[4-9]|302[0-9]|8100|8111|812[0-9]|822[0-9])'
  ```
- **부하 작업(테스트·빌드·브라우저 자동화) 시작 전 호스트 상태를 먼저 확인한다** —
  `uptime` load, 메모리·swap, Node/브라우저 프로세스 수. load가 코어 수를 크게 넘거나 swap
  압박이 보이면 시작하지 말고 보고한다. *증상 후 진단이 아니라 시작 전 예방이다.*
- **내가 띄운 프로세스는 내가 정리한다.** broad `pkill`이나 다른 세션 프로세스 종료는 금지.
  (2026-07-15 실사고: Node 2,013개·swap 40.7GB·load 153 — MCP/도구 프로세스 수명주기 누수)

## S8) 이 저장소 특유의 함정 (재조사 방지)

- **CI/CD를 다시 조사하기 전에 `docs/ops/cicd-pipeline-audit-2026-07-27.md`를 먼저 읽어라.**
  2026-07-27에 전수 실측했다. PR CI 2분30초 / alpha 배포 3분43초가 현재 기준선이다.
- **릴리스 커밋은 `package.json`을 바꿔 도커 `pnpm install` 레이어 캐시를 무효화한다** → 그
  배포만 11분대가 정상이다. 캐시 회귀로 오진하지 말 것(소스만 바뀐 배포는 4분대).
- **`gh workflow run`은 표시 이름 인덱싱이 늦다.** `--workflow="<표시 이름>"`이
  `could not find any workflows`로 실패하면 **파일명**으로 dispatch하라.
- **`node --test <디렉터리>` 형태는 Node 버전에 따라 모듈 해석으로 넘어가 실패한다.**
  파일 경로를 명시하라: `node --test scripts/release/versioning.contract.test.mjs`.
- **`deploy.yml` 구조를 바꾸면** `pnpm qa:production-deploy-security`와
  `pnpm qa:v1-db-guardrails`가 그 파일을 정규식으로 검사하므로 **반드시 둘 다 통과시켜라.**
- **alpha는 헤더 인증을 차단한다**(`x-v1-user-id` → 401). 브라우저 세션 쿠키는 httpOnly다.
  alpha 화면 검증은 실제 로그인을 거쳐야 한다.
- **alpha 실측 검증 절차** (정본: `CLAUDE.md` "Alpha 실측 검증", 스크립트: `scripts/README-alpha-verify.md`):
  1. **자격증명을 저장소에 적지 마라 — 이 저장소는 PUBLIC이다.** 계정·비밀번호·세션 토큰은
     `CLAUDE.md`·`AGENTS.md`·`scripts/`·PR 코멘트 어디에도 넣지 않는다. 세션은 `teameet_v1_session`
     쿠키 하나이고 `v1.<payload>.<HMAC>` 로 **서명만** 해서 발급된다(저장 테이블 없음 → DB에서
     못 뽑는다). `POST /api/v1/auth/login` 이 유일한 발급 경로이고, 스크립트엔 `ALPHA_SESSION_TOKEN`
     환경변수로만 넘긴다. alpha E2E 계정 목록은 저장소 밖 비공개 메모리에 있다(Codex는 사용자에게 요청).
  2. **배포 창을 피하라**(2026-08-13 실사고). 배포 중 502를 결함으로 오진한다. 측정 전에
     `curl -fsSI .../landing | grep -iE 'x-teameet-(release|commit)'` 로 서빙 버전·SHA를 확인하고 그것이 내 머지를
     포함하는지 `git merge-base --is-ancestor` 로 검증한다. 앞 배포 run이 `cancelled` 로 남을 수
     있으니(뒤 머지가 대체) 마지막 **성공** 배포 SHA를 봐야 한다.
  3. **라이브 경기는 운영 API로 만든다.** alpha엔 `live` 경기가 보통 없다. 재사용 하네스
     `scripts/verify-alpha-period-break.mjs`. 계약 4개: takeover 토큰은 Socket.IO
     `game.takeover.request` 로만 발급 / `Idempotency-Key` 헤더 = body `clientCommandId` /
     라인업 참가자 `started: boolean` 필수 / 라인업 수정은 `state === 'SCHEDULED'` 동안만.
  4. **판정은 비인증 공개 API**(`GET /tournaments/:id/matches/:fixtureId`)를 ground truth로. 육안
     스크린샷 대조로 "차이 없음"을 결론내지 말고 computed 값을 직접 읽는다.
  5. 라이브 페이지는 10초 폴링이라 Playwright `networkidle`이 끝나지 않는다 →
     `domcontentloaded` + 명시적 `waitForTimeout`.
- **alpha에서 "오류 + 인증 풀림"은 세션 문제가 아니라 nginx `limit_req`를 먼저 의심하라**
  (ALB IP 합산으로 rate limit에 걸린 이력이 있다).
- **`globals.css`는 혼합 개행 파일이다.** 편집 후 전체 CRLF 정규화가 일어나면 1,200줄대
  가짜 diff가 생긴다. 커밋 전 diff 크기를 확인하라.
- **`v1` 대회 도메인**: knockout 판별은 `group.phase`로 한다. `round`는 한글/영문이 혼재하는
  **표시 라벨**이라 가드 조건으로 쓰면 안 된다.
- **v1 admin 화면 검증**: dev 인증은 `userId`를 비우고 `userEmail=admin@teameet.v1`로 한다
  (guard가 email로 resolve).
- **Edit 도구로 파일이 손상되는 사례가 있다.** 같은 줄을 겨냥한 Edit이 이유 없이
  `String to replace not found`로 반복 실패하면 제어바이트를 의심하라:
  ```
  python3 -c "d=open(P,'rb').read(); print([b for b in set(d) if b<0x20 and b not in (9,10,13)])"
  ```
  감지되면 Edit 대신 Python/Perl로 해당 바이트를 직접 치환한다.

## S9) 사용자 상호작용

- **결정·질문은 plain text 단독으로 던지지 않는다.** 선택지를 제시해 사용자가 고르게 한다.
  다항목이면 ① 표로 overview → ② 선택 요청 순서를 지킨다.
- **Decision Matrix를 auto-approve하지 않는다.** 여러 옵션·작업규모·권고가 있는 표를 만들었다면
  "모두 권고대로" 진행 금지 — 사용자에게 명시적 결정을 받는다.
- **"이어서 진행해줘" 같은 모호한 신호는 *이미 명시된 항목 중 미완*만 가리킨다.** 부탁받지
  않은 인접 scope로 자율 확장하지 않는다.
- **완료 보고는 산출물을 인라인으로.** QA 결과·before/after·변경 요약을 메시지에 직접 표시한다.
  "리포트 파일 만들고 경로만 언급"은 불충분하다.
- **롤백(`git revert`·이전 상태 복원)은 실행 전 사용자 검수 + 명시 승인 후에만.**
- 사용자가 설명 난이도를 지정하면(예: "쉽게") 챗 답변뿐 아니라 **생성하는 문서·아티팩트에도
  같은 수준을 적용한다.**
- 작업을 다른 세션에 넘길 조건이 주어지면 분석만 주지 말고 **바로 붙여넣을 수 있는 완결형
  프롬프트**를 함께 낸다.
