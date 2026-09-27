# Teameet — AGENTS.md

Scope: **entire repository**. 이 파일은 Codex용 프로젝트 엔트리이며, 세부 규칙은 하위 문서로 라우팅합니다.

이 저장소는 전역 기준 문서인 `~/.codex/AGENTS.md`를 상속합니다. 이 파일에는 Teameet 저장소에서만 필요한 구조, 런타임, 검증, 문서화 규칙만 추가합니다.

> **정본은 저장소 루트 `CLAUDE.md`다.** 이 파일은 Codex가 그 문서를 읽지 않고도 지킬 수 있게 요약한
> 것이다. 두 문서가 어긋나면 `CLAUDE.md`를 따르고, 발견한 쪽이 **같은 변경에서** 이 파일을 맞춘다.

## V1 Scope Override

이 저장소의 현재 작업 대상은 v1만 유효하다(`CLAUDE.md` "작업 범위 — v1 전용"과 같은 규칙). 분석, 구현, 리팩토링, DB 설계, Prisma 작업, API 설계, 프론트엔드 작업, 리뷰, QA, 문서화 전에 반드시 아래 순서로 컨텍스트를 확인한다.

1. `AGENTS.md`
2. `.codex/AGENTS.md`
3. `.codex/qa-rules.md`
4. 작업과 관련된 `.codex/*.md`
5. 관련 v1 소스: `apps/v1_api`, `apps/v1_web`, Android 작업이면 `apps/v1_android`, iOS 작업이면 `apps/v1_ios`
6. UI/디자인 작업이면 `DESIGN.md`(규칙 정본)와 시각 레퍼런스 `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`

유효한 소스는 아래로 제한한다.

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Android: `apps/v1_android`
- iOS: `apps/v1_ios`
- Design rules: `DESIGN.md`(우선순위는 그 문서 §1). 시각 레퍼런스: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design source: 사용자가 명시적으로 요청·고정한 Open Design 복구 작업에 한해 사용자가 제공한 Open Design export를 읽기 전용 시각 레퍼런스로 쓸 수 있다. 그것만으로 v1 route/API 계약이 없는 화면이 유효한 런타임 경로가 되지는 않는다.
- Codex project rules: `.codex/*`

레거시 v0 앱(`apps/api`·`apps/web`)과 그 전용 도구는 제거됐다 — 제거 직전 스냅샷은 태그 `legacy-v0-final`. Legacy code, deprecated code, old API design, old DB design, old Prisma schema/migration/seed, old mock data, old screen design은 참조하지 않는다. 같은 기능이 legacy에 있어도 v1 판단 근거로 사용하지 않는다.

`.codex/*`는 Codex용 세부 규칙이다. `CLAUDE.md`와 충돌하면 `CLAUDE.md`를 따르고 그 충돌을 사용자에게 보고한다.

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

- Canonical path: `.github/tasks/` — 규칙·필수 섹션 템플릿·archive 기준은 `.github/tasks/README.md`
- Preferred naming: `.github/tasks/{NN}-{slug}.md`. 완료 문서는 `.github/tasks/archive/`
- 기존 작업 연장 시에는 새 파일을 늘리기보다 관련 task 문서를 갱신한다.
- task 번호가 중복되거나 drift가 보이면 관련 task 문서, `docs/scenarios/index.md`, 현재 구현 증거를 교차 검증해 canonical task를 먼저 고정한다.
- QA 실행 기준 시나리오는 `docs/scenarios/` 아래에 둔다. `docs/scenarios/index.md`는 시나리오 진행 상태, 링크, discussion의 단일 허브다.

### C) Abstraction Notes

```text
Required:
Responsibilities:
Dependencies:
Interface:
Errors:
```

## 0) Repo Map

- `apps/v1_web`: v1 Next.js App Router 웹(사용자·대회 운영 콘솔·어드민).
- `apps/v1_api`: v1 NestJS 백엔드. `apps/v1_api/prisma`: schema, migration, seed.
- `apps/v1_android`: 배포된 v1 Web을 로드하고 Android FCM/권한/딥링크를 담당하는 네이티브 셸.
- `apps/v1_ios`: 같은 역할의 iOS 셸. 푸시는 Firebase 없이 API가 APNs로 직접 보낸다. Xcode 프로젝트는 생성물이고 정의는 `project.yml`이다.
- `.codex`: v1 프로젝트 규칙과 Codex 에이전트 문서. `.claude/agents`: Claude 에이전트 정의(compatibility entry 포함).
- `e2e`: v1 Playwright(`e2e/v1.config.ts`, `e2e/v1-tests/`).
- `scripts/qa`: 배포·DB 가드레일 검사와 QA 보조 스크립트. `scripts/release`: 릴리스·배포 계약. `scripts/`: alpha 검증·캡처(목록 `scripts/README-alpha-verify.md`).
- `scripts/docs`: 문서용 목업 렌더·PDF 생성 스크립트와 API 계약 트리 검사.
- `deploy`: `Dockerfile.v1-api`·`Dockerfile.v1-web`, prod/alpha compose, nginx.
- `infra/load`: k6 부하 테스트 하네스.
- `docs`: 폴더별 목적과 정본 문서 표는 `docs/README.md`. `docs/reference`: 버전 관리되는 시각 레퍼런스. `docs/archive`: v0 시기 기록(현행 근거 아님).

## 1) Always-Run Workflow

1. 변경 범위를 `backend`, `frontend`, `infra`, `docs` 중 어디까지 포함하는지 먼저 고정한다.
2. 비자명한 작업이면 `.github/tasks/`에서 기존 문서를 찾고, 없으면 해당 경로에 task/spec를 만든다.
3. 관련된 가장 좁은 v1 파일부터 읽는다. `.codex/AGENTS.md`, `.codex/qa-rules.md`, 관련 `.codex/*.md`, `apps/v1_api`, `apps/v1_web`, 실제 설정 파일을 우선한다.
4. 가장 작은 정답을 구현하되, 범위 안의 tech debt와 mock/fixture drift는 같은 변경에서 함께 정리한다.
5. 검증은 좁게 시작해서 넓게 확장한다. 단위 테스트 → 통합 테스트 → 빌드/린트 → alpha 실측 순서를 기본으로 본다.
6. 새 규칙, gotcha, 워크플로 변경이 생기면 `CLAUDE.md`(정본)와 이 파일, 관련 `.claude/agents/*.md`·`.codex/agents/*`를 같이 업데이트한다.
7. 사용자가 `@전체` / `agent-all`을 명시한 경우, plan → build → review → design → QA → docs 전체를 같은 실행에서 끝까지 진행한다. 중간 단계 보고 후 멈추지 말고, 검증이 런타임 이슈로 막히면 정확한 blocker를 기록한 뒤 남은 문서화와 최종 리포트까지 완료한다.

## 1.1) Session Operation Pattern

큰 작업은 `runtime task list + committed task doc + git history` 3축을 resume cursor로 유지한다.

- Runtime task list: Codex에서는 `update_plan`을 진행판으로 사용한다. Phase/Wave가 2개 이상이면 각 Phase를 명시적 task로 등록하고 `pending -> in_progress -> completed` 상태를 갱신한다.
- Committed task doc: 작업의 SSOT는 `.github/tasks/{NN}-{slug}.md`다. 체크박스, 병렬 분해, Owned/Forbidden file scope, Acceptance Criteria, Ambiguity Log, Progress Snapshot은 해당 task doc에 남긴다.
- Scenario / QA status: 시나리오 기반 검증은 `docs/scenarios/index.md`와 `docs/scenarios/*.md`를 상태 허브로 사용한다.
- Git cursor: 세션 재개나 handoff 때는 `git log --oneline -15`로 최근 커밋 경계를 확인하고, task doc의 Progress Snapshot과 맞지 않으면 먼저 drift를 정리한다.

### Resume 3-File Routine

세션이 끊기거나 새 에이전트가 이어받을 때는 넓은 재탐색 전에 아래 3가지만 먼저 읽고 현재 위치를 복원한다.

1. Active task/status hub: `.github/tasks/{NN}-{slug}.md`, 없으면 `.github/tasks/`의 관련 task, scenario 작업이면 `docs/scenarios/index.md`
2. Recent git cursor: `git log --oneline -15`
3. Active task doc의 `Progress Snapshot`, 체크박스, Acceptance Criteria, Ambiguity Log

Active task가 불명확하면 새 작업을 시작하기 전에 관련 task doc, `docs/scenarios/index.md`, 현재 구현 증거를 교차 검증해 canonical task를 먼저 고정한다.

### Async Agent Dispatch

- 사용자가 `@전체`, `agent-all`, 병렬 에이전트, 서브에이전트를 명시한 경우에만 에이전트 병렬화를 사용한다.
- 에이전트 프롬프트에는 긴 요구사항을 복붙하지 말고 task doc 경로, 담당 Phase/Wave, Owned files, Forbidden files, Acceptance Criteria만 지정한다.
- 독립 작업은 비동기로 dispatch하고 메인 세션은 다른 non-overlapping 작업을 계속 진행한다. Codex에서는 `spawn_agent` 후 즉시 로컬 작업을 이어가고, 다른 런타임에서 지원되면 `run_in_background: true`를 사용한다.
- `wait_agent`나 polling은 다음 critical path가 해당 결과에 막힐 때만 사용한다. background agent는 완료 알림/요약을 기다리고, 전문 transcript 파일을 읽어 컨텍스트를 소모하지 않는다.
- `/private/tmp/claude-*/tasks/*.output` 같은 서브에이전트 transcript는 사용자가 명시적으로 허용하지 않는 한 읽지 않는다.
- 병렬 구현 시 공유 파일과 route/page 소유권을 분리한다. `hooks/use-v1-api.ts`, `types/api.ts`, `src/test/msw/handlers.ts` 같은 shared contract는 선행 Wave에서 한 에이전트가 맡고, page/component 변경은 이후 Wave에서 병렬화한다.

### Schedule / Wakeup Tools

- ScheduleWakeup류 도구는 장기 loop/polling 자동화에만 사용한다.
- background agent 완료 대기 용도로 ScheduleWakeup을 호출하지 않는다. 완료 notification이 없는 런타임이면 foreground check 또는 cron fallback처럼 명시된 operator contract로 degrade한다.

## 1.2) Dev Runtime

- v1 backend: `pnpm --filter v1_api dev` → `http://localhost:8121/api/v1` (`API_PORT || 8121`, Swagger `/docs`)
- v1 frontend: `pnpm --filter v1_web dev` → `http://localhost:3013` (`/api/*`·`/uploads/*`를 API로 rewrite)
- 브라우저 화면 검증은 로컬 next 서버가 아니라 **alpha 배포**로 한다(S6). 로컬 web 서버를 검증 목적으로 띄우지 않는다.
- v1 Prisma: `pnpm v1:db:generate` · `pnpm v1:db:push` · `pnpm v1:db:migrate` · `pnpm v1:db:studio` · `pnpm v1:db:seed`
- 개발 전용 헤더 인증: production이 아닐 때만 `x-v1-user-id`/`x-v1-user-email`을 신원으로 받는다(alpha·prod는 401).
- Do not run destructive seed/reset flows unless the user explicitly asks for them.
- `.env*` files are never read or printed.

## 1.3) QA Operating Gates

`.codex/qa-rules.md` is the canonical QA and review policy for Codex in this repository. All non-trivial implementation, review, UI/design, admin/permission, documentation-policy, and `.ulw` loop work must apply it before final response.

- No useless fallback: 실패를 성공처럼 숨기는 fallback, mock 완료, silent success, dead-end navigation은 만들지 않는다. 실패하면 실제 에러와 원인을 노출한다.
- No fake tests: 실제 route/API/action/user-visible contract가 깨져도 통과하는 테스트는 검증으로 인정하지 않는다. 가능한 경우 RED -> GREEN 증거를 남긴다.
- Minimal validation load: 이 규칙은 코드 분석·수정·리팩토링을 중단시키는 규칙이 아니다. 구현은 계속 진행하고, 변경 계약을 증명하는 가장 좁은 검증을 1회 실행한다. typecheck·build·전체 test·lint 같은 고부하 검증은 커밋 직전 변경 범위에 한해 1회만 실행하며, CI가 수행할 반복 전체 검증을 로컬에서 중복하지 않는다.
- Host load preflight: 사용자 지시 없이 스스로 고부하 작업(풀스위트·고병렬)을 띄우기 전에 CPU/load, 메모리, Node/브라우저 프로세스 수, Docker·대상 서비스 상태를 확인한다. 실행 시 직렬·최소 worker를 사용하고 내가 만든 프로세스만 정리한다. 사용자가 실행을 지시했으면 호스트 지표를 이유로 멈추지 않는다.
- Browser QA tool: 기본은 `ego-browser`로 alpha에 실제 로그인해 사용자 흐름을 클릭으로 밟는 것이다. Playwright MCP를 대신 쓸 때는 headed 세션만 쓰고, 시작한 MCP·브라우저의 PID/PPID를 기록해 QA 종료 시 해당 트리만 정리한다. CI 전용 비대화형 브라우저 검증은 이 수명주기 규칙과 별도다.
- Visual verification before completion: UI/레이아웃/반응형/admin surface 변경은 tests pass is not completion이다. alpha 화면 스크린샷, console/network 확인, before/after evidence, viewport별 verdict가 필요하다.
- Layout rebalance: UI 요소 제거/재배치 뒤에는 spacing, scroll, sticky chrome, focus order, desktop/tablet/mobile 레이아웃을 다시 맞춘다.
- No scope retreat: `전체`, `모든 라우트`, `모든 페이지`, 고정 agent 수, comprehensive QA 요청은 전체 수를 확정하고 processed M/N으로 보고한다.
- Tech-Debt Grep: 완료 전 touched path에서 `TODO`, `FIXME`, `HACK`, `XXX`를 확인하고 새 marker는 이유와 후속 경로를 남긴다.
- Committed-tree verification: dirty working tree의 local test만으로 PR-ready라고 말하지 않는다. `git diff --name-only`, `git diff --check`, untracked import 여부, committed-tree/PR diff 기준을 확인한다.
- Shared-tree pathspec safety: 관련 없는 WIP가 많은 shared tree에서는 `git add -A`를 쓰지 않는다. commit 요청이 있으면 `git commit -- <pathspec>`처럼 명시 pathspec만 사용하고, `git show --stat`/`git show --name-only`로 diff scope를 확인한다. sub-agent self-commit은 root agent가 명시한 exact scope 없이는 금지한다.
- No left accent rail: decorative left rail, purple/tint/dashed/glow decoration으로 화면을 꾸미지 않는다. hierarchy, spacing, typography, semantic color only로 강조한다.
- manual QA evidence: 기능, 권한, admin, 라우팅, responsive 변경은 실제 브라우저/CLI 시나리오, persona, viewport, 결과, cleanup을 증거로 남긴다.

## 2) Context Budget Rules

- 파일 검색은 `rg`, 파일 목록은 `git ls-files` 또는 `rg --files`를 우선한다.
- `docs/screenshots/`, `docs/archive/`, `playwright-report/`, `test-results/`, `.playwright-mcp/`, `.pnpm-store/`, `tmp/`, `node_modules/`, `.turbo/`는 기본 탐색 대상에서 제외한다. 단, UI/디자인 작업에서는 `DESIGN.md`와 `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`을 반드시 확인한다.
- `.env*`는 읽거나 출력하지 않는다. 환경 변수는 이름과 책임만 문서화한다.
- 문서가 실제 코드와 충돌하면 `apps/v1_api/src/main.ts`, `apps/v1_api/src/config/`, `apps/v1_web/next.config.ts`, `docker-compose.yml`, `deploy/docker-compose.prod.yml`, 각 앱의 `package.json`을 우선적인 사실 원천으로 본다.

## 3) Which Instruction Set To Follow

- 저장소 정본: `CLAUDE.md` (이 파일은 요약)
- 전역 기본 정책: `~/.codex/AGENTS.md`
- v1 프로젝트 컨텍스트: `.codex/project-context.md`
- v1 아키텍처/도메인 원칙: `.codex/architecture.md`
- v1 API/DB/Prisma 원칙: `.codex/api-rules.md`, `.codex/db-rules.md`, `.codex/prisma-rules.md`
- v1 프론트엔드/디자인 원칙: `.codex/frontend-rules.md`, `.codex/design-rules.md`, `DESIGN.md`, `docs/guides/v1-coding-patterns.md`
- v1 QA/리뷰 완료 기준: `.codex/qa-rules.md`
- 에이전트 역할/팀/파이프라인: `.codex/agents/prompts.md`, `.codex/agents/team-config.md`, `.codex/agents/workflow.md`
- compatibility prompt entry: `.claude/agents/prompts.md`
- 실행/검증 명령: `README.md`, 각 앱 `package.json`
- 문서 지도: `docs/README.md` (v0 시기 현황 보고서는 `docs/archive/v0-reports/`의 기록일 뿐 현행 근거가 아니다)

## 4) Project-Specific Development Rules

- 저장소 타입은 `pnpm workspaces + Turborepo` 기반 모노레포다.
- 프론트엔드는 `apps/v1_web`의 App Router 구조를 유지한다. 라우트 그룹 없이 최상위 폴더가 곧 경로다 — 사용자 화면(`home`, `matches`, `team-matches`, `teams`, `tournaments`, `league-matches`, `chat`, `my` …), 어드민(`admin/`), 대회 운영 콘솔(`tournament-ops/`), 공개 소개(`landing`, `faq`, `help`, `for`).
- 백엔드는 NestJS 모듈 경계를 유지한다. 새 기능은 `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` 구조를 우선한다.
- API 기본 규칙:
  - prefix는 `/api/v1`
  - 응답은 `TransformInterceptor` 기준 `{ status: 'success', data, timestamp }`, 에러는 `AllExceptionsFilter` 기준 `{ status, statusCode, code, message, details, requestId, timestamp }`
  - 입력 검증은 DTO + `class-validator`. `ValidationPipe`는 `whitelist + forbidNonWhitelisted`로 동작한다 — 프론트 form state에 UI 전용 필드가 있으면 API submit 시 DTO 호환 payload로 정리해서 보내야 한다.
  - 목록은 cursor pagination을 기본값으로 본다. 다음 커서는 `pageInfo.nextCursor`.
  - 프론트 통합용 API 문서는 Swagger만 단독 source of truth로 쓰지 않는다. v1 `controller` + DTO + service status gate + integration test + `apps/v1_web`의 관련 hooks/types를 함께 교차검증하고, auth/permission/error/pagination/multipart/idempotency/mock-vs-real gotcha를 명시해야 한다.
  - controller/DTO/service 계약이 바뀌면 `docs/api/`(README + global-contract + `domains/*.md`)를 **같은 변경**에서 sync한다(2026-09-28: 옛 `docs/api/v1/` 초안 트리는 `docs/api/`로 완전히 병합·삭제됐다 — 이제 도메인마다 정본은 하나뿐이다).
- 권한 검증은 라우트 가드와 서비스 계층을 함께 본다. `V1AuthGuard`, `AdminContextService.getActiveAdmin`, 팀 서비스의 역할 검증(owner/manager/member)을 우회하는 경로를 만들지 않는다.
- 디자인 소스 우선순위: `DESIGN.md` §1(`DESIGN.md` > `.impeccable.md` > `apps/v1_web/src/app/tokens.css`·`globals.css` 토큰 > `components/v1-ui/` 공유 컴포넌트). 시각 레퍼런스는 `Teameet Design.html`, 명시적으로 고정된 Open Design 복구 작업에서는 사용자가 제공한 export.
- shadow는 깊이감 보조 수단으로만 사용한다. content card에서 deep shadow, stacked shadow, glow shadow를 기본 스타일로 쓰지 않는다.
- border는 subtle full-border 또는 borderless separation 중 하나만 선택한다. thick border, one-side accent border, border-heavy nested container는 금지한다.
- 레이아웃은 Toss-like clean layout을 기준으로 `text-first`, `section-clear`, `action-obvious` 상태를 우선한다. utility page를 hero/card showcase처럼 만들지 않는다.
- public informational page의 above-the-fold는 badge/title만으로 비워두지 않는다. 첫 화면 안에 primary CTA 또는 next-step summary가 즉시 보여야 하고, 핵심 heading/summary를 스크롤 진입 연출 뒤에 숨기지 않는다.
- 모바일 glass language는 `chrome only` 원칙을 따른다. bottom nav, sticky header, overlay 같은 floating/mobile shell에는 glass를 쓸 수 있지만, dense content card와 거래형 본문 surface는 기본적으로 solid를 유지한다.
- `backdrop-blur`/`backdrop-filter`가 걸린 fixed header/nav 안에 viewport-fixed drawer나 sheet를 직접 중첩하지 않는다. blur parent가 fixed descendant의 containing block이 되어 `top/bottom` anchor가 깨질 수 있으므로, 모바일 drawer는 header 바깥 sibling layer로 렌더한다.
- account / utility root page(`my`, `notifications`, `chat`)는 discovery-style intro를 쓰지 않는다. 모바일 상단은 공유 앱 셸 헤더, 본문은 compact solid card rhythm을 기본값으로 본다.
- Mock/fixture source of truth: `apps/v1_api/test/fixtures/`, `apps/v1_api/prisma/`, `apps/v1_web/src/test/msw/`, `apps/v1_web/public/mock/`, 필요 시 각 `*.spec.ts` / `*.test.tsx` 내부 inline mock.
- Prisma 모델, DTO, API 응답, mock 이미지 전략이 바뀌면 관련 fixture/MSW/E2E/public mock 문서까지 같은 변경에서 sync한다.
- 외부 이미지 fallback 대신 `apps/v1_web/public/mock/` 자산을 우선 사용한다. 외부 출처 실사형 mock 이미지를 추가/교체할 때는 같은 폴더에 attribution 문서(현재 없음 — 첫 외부 자산 때 만든다)를 두고 source URL, creator, license를 기록한다.
- 사용자-facing 이미지가 원격 URL을 받을 수 있으면 렌더 단계에서 로컬 mock으로 fallback되는 runtime 보호를 둔다. raw `<img>` 단독 렌더는 금지한다.
- 사용자-facing create/edit 폼에서 화면에 노출한 입력, 업로드, 직접 입력 옵션은 실제 저장 경로와 반드시 일치해야 한다. 저장되지 않는 선택지를 노출하는 false affordance는 금지한다. 빈 업로드 슬롯은 회색 박스만 두지 말고 명확한 가이드를 함께 제공한다.
- 사용자-facing 상세 이미지 확대/갤러리는 generic 확인 모달로 구현하지 않는다. 전용 라이트박스 패턴으로 분리하고 `Escape`, backdrop close, current index, multi-image navigation을 기본 계약으로 둔다.
- URL 기반 필터 화면은 router query만 단일 source로 직접 조합하지 않는다. 빠른 연속 입력/토글에서 stale query overwrite가 발생하므로, local draft filter state를 두고 debounce/replace로 동기화한다.
- 같은 도메인 여정(`list -> create -> detail -> edit -> history`) 안의 페이지는 하나의 accent/control language를 공유해야 한다.
- 배지, 평점, 전적, 신뢰도처럼 사용자 의사결정에 직접 영향을 주는 신호는 `verified`, `estimated`, `sample` 상태를 명확히 구분해야 한다. mock/샘플 데이터를 실제 신뢰 신호처럼 렌더링하지 않는다.
- 실시간/optimistic 업데이트가 붙은 알림·리스트 CTA는 클릭 직후 항목 재정렬이나 unmount가 발생해도 navigation이 유실되지 않도록 구현한다.
- 서비스 전체 지원 범위(종목, 상태, 역할 등)는 list/create/edit/detail 하위 플로우에서도 일관되게 유지한다. silent capability narrowing은 금지한다.
- edit/manage 화면은 현재 route의 실제 엔티티를 기준으로 hydrate되어야 한다. 다른 seed/mock 엔티티로 silently fallback하는 편집 화면은 금지한다.
- 신청 확정·결과 확정 같은 확정형 액션은 API 실패를 성공처럼 시뮬레이션하면 안 된다. 실패 원인, 재시도, 보류 상태를 명시적으로 보여주고, 필수 컨텍스트(route entity 등) 없이 화면만 이동시키는 dead-end entry를 만들지 않는다.
- admin/ops surface의 상세 링크와 후속 액션은 관리자 shell 안에서 맥락을 유지해야 한다. 운영 판단이 개입되는 액션(제재 등)은 처리 주체, 사유, 결과, 부분 실패를 추적 가능한 형태로 남긴다.
- 루트에 ad hoc 스크립트나 개인 메모 파일을 두지 않는다. QA 보조 도구는 `scripts/qa/`, 버전 관리할 시각 레퍼런스는 `docs/reference/`로 보낸다. `ec2-info` 같은 호스트/운영자 로컬 메모는 커밋하지 않는다.
- `packages/`는 실제 공유 워크스페이스가 다시 필요해질 때만 만든다. 빈 placeholder 디렉터리는 두지 않는다.
- 기존 task/backlog 문서를 기반으로 후속 작업을 쪼갤 때는 문서만 믿지 말고 현재 코드와 `docs/scenarios/index.md`를 함께 교차 검증한다. stale 해진 task는 재분류하거나 supersede 문서를 남긴다.
- 보호 경로 E2E는 인증 주입 직후 바로 진입하지 말고, 인증된 UI 상태가 실제로 hydrate된 뒤 다음 경로로 이동한다. 그렇지 않으면 간헐적으로 auth wall false negative가 난다.
- Windows PowerShell에서 한글이 포함된 SQL을 문자열 파이프로 `docker compose exec ... psql`에 전달하지 않는다. PowerShell 5 파이프 인코딩이 비 ASCII 문자를 `?`로 치환할 수 있으므로, UTF-8 파일을 보존하는 migration runner 또는 parameterized Prisma script를 사용하고 DB/API 한글 round-trip을 검증한다.

## 4.1) Proven Pipeline Patterns

### Sequential-Then-Parallel (공유 계약 먼저, 화면은 병렬)

데이터 레이어 변경이 UI 레이어에 blocking dependency를 가질 때:

- **Wave A (sequential, 단일 에이전트)**: 다른 에이전트가 모두 의존하는 공유 파일(`apps/v1_web/src/hooks/use-v1-api.ts`, `apps/v1_web/src/types/api.ts`, `apps/v1_web/src/test/msw/handlers.ts`, DTO)을 먼저 완료한다.
- **Wave B (parallel)**: A 완료 후 페이지/컴포넌트 변경을 복수 에이전트가 병렬 실행한다. 각 에이전트는 서로 다른 라우트 파일을 소유한다.
- **검증 시점**: B 완료 후 `pnpm --filter v1_web lint`(tsc 포함)로 통합 손실을 확인한다.

### Serial-Schema + 4-way Parallel

Prisma enum 확장처럼 모든 에이전트가 의존하는 스키마 변경이 선행될 때:

- **Wave 0 (serial, backend-data-dev 단독)**: `apps/v1_api/prisma/schema.prisma` 변경 + migration + seed/fixture 업데이트. 이 wave가 끝나기 전에 Wave 1 시작 금지.
- **Wave 1 (4-way parallel)**: backend-data-dev / backend-api-dev / frontend-data-dev / frontend-ui-dev 가 수직 도메인(서비스 / 컨트롤러+DTO / 훅+타입+MSW / 페이지+컴포넌트)을 각자 소유한다.
- **리뷰-수정 반복**: backend+frontend 리뷰 동시 실행 → Critical 0 될 때까지 fix round 반복. 디자인 라운드는 frontend PASS 이후.
- **QA gate**: 리뷰 + 디자인 PASS 후 QA 진입. BLOCKING 발견 시 수정 후 관련 에이전트만 재실행.
- **주의**: 두 wave가 같은 파일을 수정해야 하면 한 에이전트가 순차 처리하도록 병합한다.

## 5) Validation Commands

- Frontend unit: `pnpm --filter v1_web test` (Vitest, `apps/v1_web` 기준 실행)
- Frontend lint/typecheck: `pnpm --filter v1_web lint` · build: `pnpm --filter v1_web build`
- Backend unit: `pnpm --filter v1_api test` · lint/typecheck: `pnpm --filter v1_api lint`
- Backend integration: `pnpm --filter v1_api test:integration` (DB 필요, CI에서 실행)
- V1 combined unit: `pnpm v1:test`
- E2E: `pnpm test:e2e:v1` (`e2e/v1.config.ts`, v1 스택 가동 전제)
- Prisma: `pnpm v1:db:generate` · `pnpm v1:db:push` · `pnpm v1:db:migrate` · `pnpm v1:db:studio` · `pnpm v1:db:seed`

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

### Codex Canonical Agent Docs

- Teameet의 Codex canonical agent docs는 `.codex/agents/`에 둔다. `.claude/agents/prompts.md`는 Codex built-in `agent-*` 스킬이 읽는 compatibility entry다.
- Codex roster, alias, quality gate가 바뀌면 `.codex/agents/*`와 `.claude/agents/prompts.md`를 같은 변경에서 sync한다. 라우팅 우선순위는 `.codex/agents/prompts.md` → `.codex/agents/team-config.md` → `.codex/agents/workflow.md` → `.claude/agents/prompts.md` 순서다.
- 이 저장소의 agent 문서 표준 경로는 `.agents/`가 아니다. 신규 Codex 문서는 `.codex/agents/`, compatibility entry는 `.claude/agents/`를 사용한다.

---

# 공통 운영 규칙 (Codex ↔ Claude 공유)

> **정본은 저장소 루트 `CLAUDE.md`와 사용자 전역 `~/.claude/CLAUDE.md`다.** 이 절은 Codex가
> 그 문서를 읽지 않고도 지킬 수 있도록 **어기면 바로 사고가 나는 규칙만** 추린 것이다.
> 충돌하면 `CLAUDE.md`가 이긴다. 어긋난 걸 발견하면 **고치는 것도 같은 변경에서 한다** — 이 저장소는
> 과거에 캡처 스크립트 경로 컨벤션이 두 문서에서 달라 리뷰어가 반복 지적한 전례가 있다.

## S1) 브랜치 · 배포 정책 (Critical — 2026-07-31 실측 기준 정정)

> 이전 판은 "`main`은 유산 브랜치이고 배포와 무관"이라고 적고 있었는데 **사실이 아니다.**
> 그 서술 때문에 `deploy.yml`의 main 전용 job을 dead code로 오판해 삭제 직전까지 간 사고가
> 2026-07-31에 있었다 — 그 job은 라이브 프로덕션(teameet.co.kr)의 유일한 배포 경로다.

- **`dev`와 `main` 둘 다 살아 있고 각자 다른 환경을 배포한다.**
  - `dev` push → `deploy-alpha.yml` → **alpha.teameet.co.kr**, 승인 게이트 없음.
  - `main` push → `deploy.yml`의 `build-images` + `deploy` job → **teameet.co.kr(프로덕션)**,
    `environment: production` 승인 게이트 있음.
- **승격 뒤 추가 절차가 필요한 배포(Task168 Stage A/B DB 전환 등)는
  `docs/ops/prod-task168-transition-runbook.md` 참고** — 실패 메시지가 이 문서를 직접 가리킨다.
- **모든 작업은 `dev`에서만.** 작업 브랜치·PR의 base는 항상 `dev`. 기능의 "완료" = dev 머지.
- **`dev` → `main` 승격은 사용자만 한다.** 에이전트는 `git push`/`gh pr merge`/
  `gh pr create --base main` 어느 방식으로도 **직접 실행하지 않는다** — 필요해 보이면 사용자에게
  알리고 멈춘다. 자동으로 승격하는 워크플로는 없다(워크플로의 `refs/heads/main` 참조는 전부 감지용 `if:` 조건이다).
- **`main`에 dev에 없는 커밋이 생겼다면** `origin/main → dev` 방향으로만 흡수한다.
- **`main`에는 classic branch protection은 없지만 ruleset이 걸려 있다**(2026-08-09 실측 정정).
  ruleset "Copilot review for default branch"(active)가 `deletion`·`non_fast_forward`·`copilot_code_review`를
  강제한다 — main으로의 force-push·삭제는 막힌다(#231 롤백이 `git revert`로만 가능했던 이유). 일반
  fast-forward 직접 push는 가능해 그대로 프로덕션 배포로 이어진다. 확인은 `gh api repos/<owner>/<repo>/rulesets`.
- **머지·push 전에 항상 `baseRefName`을 확인한다**(2026-08-09 base=main 오머지 사고). 직전에
  `gh pr view <N> --json baseRefName`으로 `dev`임을 확인하고 아니면 `gh pr edit <N> --base dev`로 재타깃한다.
- **dev push = alpha 자동 실배포** → dev 머지 전 검증(테스트·tsc·lint)을 실배포 게이트로 취급한다.
- **worktree는 항상 `git fetch origin dev` 직후 `origin/dev`에서 만든다.** 로컬 `dev` 브랜치를 체크아웃해
  base로 쓰지 않는다 — 여러 세션이 `.claude/worktrees/*`를 쓰는 공유 환경이라 로컬 `dev`가 이미 다른
  worktree에 물려 있다.
- **착수 전 `fetch`, 머지 후 로컬 `dev` 동기화 (2026-08-23 사용자 지시, 양쪽 다 필수).** PR이 `origin/dev`에
  머지되면 머지 하나당 한 번, 즉시 메인 작업트리의 로컬 `dev`를 따라잡힌다:
  ```bash
  cd /Users/sungjun/Dev/projects/matchup-sports-platform
  git fetch origin dev -q && git merge --ff-only origin/dev
  ```
  **반드시 `--ff-only`** (`git pull`·rebase·`reset` 금지). FF가 거부되면 `git status --porcelain` ∩
  `git diff --name-only HEAD origin/dev`로 충돌 파일만 특정해 백업한 뒤 원복·FF 하고, 백업 경로를 사용자에게
  알린다. 지우지 않는다.

## S2) 공유 작업트리 git 안전 (Critical)

하나의 저장소를 여러 세션이 동시에 쓴다. 아래는 그 자체로 Critical이며 사용자 명시 승인 없이는 금지한다.

- **`git stash` 절대 금지.** 작업트리 *전체*의 미커밋 변경을 숨긴다. 불가피하면 내 파일만 따로 복사/커밋한다.
- **파괴 명령 금지**: `git reset --hard`, 내가 만들지 않은 변경에 대한 `git checkout --`/`git restore`,
  `git clean -fd`, `git add -A`, `git commit -a`.
- **커밋은 내가 만든 파일만 pathspec으로**: `git commit -m "..." -- <명시 경로>` 후 즉시 `git show --stat HEAD`로 검증.
- **다른 세션이 동시 수정 중인 공유 파일은 직접 편집하지 않는다.** 바꿔야 하면 해당 위치에 코드 주석으로 "무엇을·어떻게"만 남긴다.
- 새로 만든 파일은 pathspec 커밋 전에 `git add`(또는 `git add -N`)가 필요하다.

## S3) DB 마이그레이션 규율 (Critical)

- **스키마 변경은 반드시 migration 파일을 동반한다**(`apps/v1_api/prisma/migrations/`). `prisma db push`로만
  반영하고 migration을 빠뜨리면 prod `migrate deploy`가 깨진다(실사례: 리뷰 테이블 migration 누락 → 배포 중단).
- CI(`deploy.yml`)의 `V1 migration replay + drift gate`가 ① 빈 DB에 전체 체인 재생 ② `schema.prisma` 드리프트 0을 강제한다.
- 수동 SQL로 dev에 먼저 적용했다면 같은 내용을 **idempotent migration**으로 작성하고 `prisma migrate resolve --applied`로 박제한다.

## S4) 품질 원칙

- **기술부채를 남기지 않는다.** 범위 안의 dead code·workaround·미완 처리는 *같은 변경*에서 완전히 해결한다.
- **쓸데없는 fallback 금지.** 의미 있는 에러 처리(try/catch + 사용자 알림)는 fallback이 아니다. **silent catch(빈 catch)는 안티패턴.**
- **진짜 테스트만.** "이 테스트가 깨지면 실제 버그를 잡는가"를 만족해야 한다. mock 자체를 검증하지 않는다.
- **검증은 변경 크기에 비례한다.** 기계적 변경에 전용 테스트나 서브에이전트 왕복을 붙이지 않는다. 풀스위트는 통합·릴리스 게이트에서만.
- **모호하면 추측하지 않는다.** 원본 요청의 모든 조건이 설계 → 구현 → 검증까지 살아 있어야 한다.

## S5) UI 변경

- **착수 전: A·B·C 3안 브레인스토밍 필수** (2026-08-23 사용자 지시). 화면·컴포넌트·레이아웃을 새로 만들거나
  바꾸는 작업은 **코드를 쓰기 전에** A·B·C 3안 + 추천안을 제시하고 선택을 받는다.
  - 3안은 **서로 다른 원칙**이어야 한다. 각 안에 **장점과 단점을 모두** 적는다 — "단점 없음" 금지.
  - 목업은 **production fidelity** — 실제 디자인 시스템(토큰·`components/v1-ui/`·다크모드·44px 터치·WCAG AA)을
    그대로 적용하고, 재사용할 기존 컴포넌트를 명시한다.
  - 제시 순서: ① 3안 비교표(축·장단점·작업규모) → ② `AskUserQuestion` 으로 선택. 선택 전 구현 금지.
  - 대상 아님: 오타·토큰 치환 같은 1줄 기계적 수정, 백엔드/로직 전용 변경.
  - 정본: `CLAUDE.md` 의 "UI 착수 규칙 — A·B·C 3안 브레인스토밍 필수".
- **접근성 위반을 지적하기 전에 `docs/design/a11y-decisions.md` 를 먼저 본다.** 근거와 함께 그대로 두기로 결정한
  것들이 모여 있다 — 등재돼 있으면 그 지적은 닫고, 없으면 고칠 대상이다. 새로 "안 고치기로" 정하면 그 문서에 추가한다.
- **변경 후 라이브 시각 검증 필수.** `tsc 0 + 테스트 pass + lint 0`만으로는 완료가 아니다.
- **요소 제거/재배치 = 레이아웃 재균형까지가 한 작업.**
- **UI 변경 PR은 예외 없이 📱390 / 📲768 / 🖥1440 3폭 갤러리를 PR 코멘트로 첨부한다 — 머지 후 alpha에서 찍어
  그 PR에 사후 게시한다**(로컬 next로 렌더하지 않으므로). 순서: 머지 → alpha 배포 확인(S8) → `ego-browser`로
  캡처 → 같은 PR에 갤러리 코멘트. PR 본문에 사후 게시 이유를 남긴다. (로직/백엔드 전용 PR은 대상 아님.)
- 와이드(1440~2560) 반응형 검증은 스크린샷 썸네일이 아니라 **치수 측정**이 신뢰할 수 있다.

## S6) PR · 리뷰 워크플로

상세 런북: `docs/ops/pr-review-visual-workflow.md`

- **PR 제목·본문은 한국어로 작성한다.**
- **v1 기능 PR엔 `.changeset/*.md`가 필요하다.** 대상은 `apps/v1_api/`·`apps/v1_web/`·`deploy/`·`.github/workflows/`·
  `scripts/release/`·루트 매니페스트 변경이고, `.md`·테스트·fixtures·`docs/`·`e2e/`·`.github/tasks/`·`scripts/qa/`·`scripts/docs/`는
  제외다(`scripts/release/check-changeset-policy.mjs`). 빠지면 dev-push CI가 실패하고 alpha 배포가 막힌다.
- **Copilot 리뷰는 `generated no new comments`가 나올 때까지 반복한다.** 요청은
  `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer`(REST `requested_reviewers`는 422). 도착은 비동기 ~3–8분.
  각 finding은 **적대적으로 검증해 real만 수정**한다 — Copilot도 틀린다. 스레드는 GraphQL
  `addPullRequestReviewThreadReply` + `resolveReviewThread`로 답변·resolve한다. **늦은 라운드에 나온 게 더 치명적일 수 있다.**
- 머지 준비 = `MERGEABLE/CLEAN` + 미해결 스레드 0 + CI pass. 변경 파일 300개 초과 PR은 Copilot 리뷰 대상이 아니다.
- CI flake(Postgres `40P01 deadlock` 등)는 내 변경과 무관함을 확인한 뒤 `gh run rerun <id> --failed`.
- **로컬 tsc 통과 ≠ CI 빌드 통과.** CI는 **커밋본**을 빌드한다. push 전 커밋본 기준으로 확인하라.
- **런타임·화면 동작은 로컬 next 서버가 아니라 alpha 배포로 검증한다(Critical, 2026-08-09 실사고).**
  `next dev`/`next start`/`next build` 반복 실험에 세션을 태우지 말고 **fix 후보를 dev 머지해 alpha 실배포에서
  직접 재측정**한다(이 레포의 ground truth). 실사고: 로컬 좀비 next-server(`kill`이 래퍼만 죽여 자식이 포트 점유 →
  stale 빌드 서빙)와 병렬 `next dev` 로 거짓 결론을 냈다.

## S7) 로컬 프로세스 · 호스트 부하

- **내가 띄운 프로세스는 내가 정리한다.** 새로 띄우기 전 기존 리스너를 먼저 확인한다(단순 `grep node`는
  무관한 프로세스를 잡는다): `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(301[3-9]|302[0-9]|812[0-9]|822[0-9])'`
- 사용자 지시 없이 스스로 부하 작업(풀스위트·고병렬 브라우저 자동화)을 시작하기 전에 호스트 상태를 확인한다.
  사용자가 실행을 지시했으면 호스트 지표를 이유로 멈추지 않는다.
- broad `pkill`이나 다른 세션 프로세스 종료는 금지. (2026-07-15 실사고: Node 2,013개·swap 40.7GB·load 153 — MCP/도구 프로세스 수명주기 누수)

## S8) 이 저장소 특유의 함정 (재조사 방지)

- **CI/CD를 다시 조사하기 전에 `docs/ops/cicd-pipeline-audit-2026-07-27.md`를 먼저 읽어라.** 2026-07-27 전수 실측 기준선이다.
- **릴리스 커밋은 `package.json`을 바꿔 도커 `pnpm install` 레이어 캐시를 무효화한다** → 그 배포만 오래 걸리는 게 정상이다.
- **`gh workflow run`은 표시 이름 인덱싱이 늦다.** `--workflow="<표시 이름>"`이 실패하면 **파일명**으로 dispatch하라.
- **`node --test <디렉터리>` 형태는 Node 버전에 따라 실패한다.** 파일 경로를 명시하라:
  `node --test scripts/release/versioning.contract.test.mjs`.
- **`deploy.yml` 구조를 바꾸면** `pnpm qa:production-deploy-security`와 `pnpm qa:v1-db-guardrails`가 그 파일을
  정규식으로 검사하므로 **반드시 둘 다 통과시켜라.**
- **alpha는 헤더 인증을 차단한다**(`x-v1-user-id` → 401). 브라우저 세션 쿠키는 httpOnly다. alpha 화면 검증은 실제 로그인을 거쳐야 한다.
- **alpha 실측 검증 절차** (정본: `CLAUDE.md` "Alpha 실측 검증", 스크립트: `scripts/README-alpha-verify.md`):
  1. **자격증명·프로덕션 식별자를 저장소에 적지 마라 — 이 저장소는 PUBLIC이다.** 계정·비밀번호·세션 토큰은
     `CLAUDE.md`·`AGENTS.md`·`scripts/`·PR 코멘트 어디에도 넣지 않는다. 세션은 `teameet_v1_session` 쿠키 하나이고
     `v1.<payload>.<HMAC>` 로 **서명만** 해서 발급된다(DB에서 못 뽑는다). `POST /api/v1/auth/login` 이 유일한 발급
     경로이고, 스크립트엔 `ALPHA_SESSION_TOKEN` 환경변수로만 넘긴다. alpha E2E 계정 목록은 저장소 밖 비공개
     메모리에 있다(Codex는 사용자에게 요청).
  2. **배포 창을 피하라**(2026-08-13 실사고). 배포 중 502를 결함으로 오진한다. 측정 전에
     `curl -fsSI .../landing | grep -iE 'x-teameet-(release|commit)'` 로 서빙 SHA를 확인하고 내 머지를 포함하는지
     `git merge-base --is-ancestor` 로 검증한다. 앞 배포 run이 `cancelled` 로 남을 수 있으니 마지막 **성공** 배포 SHA를 본다.
  3. **라이브 경기는 운영 API로 만든다.** alpha엔 `live` 경기가 보통 없다. 계약 4개: takeover 토큰은 Socket.IO
     `game.takeover.request` 로만 발급 / `Idempotency-Key` 헤더 = body `clientCommandId` / 라인업 참가자
     `started: boolean` 필수 / 라인업 수정은 `state === 'SCHEDULED'` 동안만.
  4. **판정은 비인증 공개 API**(`GET /tournaments/:id/matches/:fixtureId`)를 ground truth로. 육안 스크린샷 대조로
     "차이 없음"을 결론내지 말고 computed 값을 직접 읽는다.
  5. 라이브 페이지는 10초 폴링이라 Playwright `networkidle`이 끝나지 않는다 → `domcontentloaded` + 명시적 대기.
- **alpha에서 "오류 + 인증 풀림"은 세션 문제가 아니라 nginx `limit_req`를 먼저 의심하라**(ALB IP 합산으로 rate limit에 걸린 이력이 있다).
- **`v1` 대회 도메인**: knockout 판별은 `group.phase`로 한다. `round`는 한글/영문이 혼재하는 **표시 라벨**이라 가드 조건으로 쓰면 안 된다.
- **v1 로컬 어드민 검증**: dev 헤더 인증은 `userId`를 비우고 `userEmail=admin@teameet.v1`(시드 계정)로 한다(guard가 email로 resolve).
- **Edit 도구로 파일이 손상되는 사례가 있다.** 같은 줄을 겨냥한 Edit이 이유 없이 `String to replace not found`로
  반복 실패하면 제어바이트를 의심하라:
  ```
  python3 -c "d=open(P,'rb').read(); print([b for b in set(d) if b<0x20 and b not in (9,10,13)])"
  ```
  감지되면 Edit 대신 Python/Perl로 해당 바이트를 직접 치환한다. Python으로 파일을 다시 쓸 때는 원래 개행(CRLF/LF)을 보존한다.

## S9) 사용자 상호작용

- **결정·질문은 plain text 단독으로 던지지 않는다.** 선택지를 제시해 사용자가 고르게 한다. 다항목이면 ① 표로 overview → ② 선택 요청.
- **Decision Matrix를 auto-approve하지 않는다.** 여러 옵션·작업규모·권고가 있는 표를 만들었다면 사용자에게 명시적 결정을 받는다.
- **"이어서 진행해줘" 같은 모호한 신호는 *이미 명시된 항목 중 미완*만 가리킨다.** 부탁받지 않은 인접 scope로 자율 확장하지 않는다.
- **완료 보고는 산출물을 인라인으로.** QA 결과·before/after·변경 요약을 메시지에 직접 표시한다.
- **롤백(`git revert`·이전 상태 복원)은 실행 전 사용자 검수 + 명시 승인 후에만.**
- 사용자가 설명 난이도를 지정하면(예: "쉽게") 챗 답변뿐 아니라 **생성하는 문서·아티팩트에도 같은 수준을 적용한다.**
- 작업을 다른 세션에 넘길 조건이 주어지면 분석만 주지 말고 **바로 붙여넣을 수 있는 완결형 프롬프트**를 함께 낸다.

## 대회 · 리그 · 매치 정본 (Codex 미러 — 정본은 CLAUDE.md 와 아래 문서)

`docs/design/competition-canonical-flow.md` 가 대회·정규 리그·팀 매치·명단·결과 확정·전적의 정본이다(2026-09-02 사용자 확정).
충돌하는 태스크 문서보다 이 문서를 따르고, 바꾸려면 그 문서의 결정 이력 표에 먼저 적는다.
