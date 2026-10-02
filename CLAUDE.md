# Teameet (팀밋)

축구·풋살·러닝·수영 생활체육의 팀과 선수를 매칭하고, 축구·풋살 아마추어 대회를 열어 경기 결과·기록을
남기는 멀티스포츠 플랫폼이다(서비스 소개 원문: `apps/v1_web/src/app/llms.txt/route.ts`).

## 작업 범위 — v1 전용

이 저장소에서 유효한 코드는 v1 네 앱뿐이다.

| 앱 | 경로 | 역할 |
|---|---|---|
| Web | `apps/v1_web` | Next.js App Router 웹(사용자·운영 콘솔·어드민 전부) |
| API | `apps/v1_api` | NestJS 백엔드 + Prisma(`apps/v1_api/prisma`) |
| Android | `apps/v1_android` | 배포된 웹을 로드하는 네이티브 셸(FCM·권한·딥링크) |
| iOS | `apps/v1_ios` | 같은 역할의 iOS 셸. Xcode 프로젝트는 생성물이고 정의는 `project.yml` |

- 레거시 v0 앱(`apps/api`·`apps/web`)과 그것만 겨냥하던 도구는 제거됐다. 제거 직전 스냅샷은 git 태그
  **`legacy-v0-final`** 에 있다(`git show legacy-v0-final:<경로>`). **v1 판단의 근거로 쓰지 않는다** —
  같은 기능이 옛 앱에 있어도 옛 API·DB·목데이터·화면 설계는 참조하지 않는다.
- 이 규칙은 `AGENTS.md`의 "V1 Scope Override"와 같은 내용이다(아래 "코드 컨벤션 > Codex 미러").

## Git 브랜치 정책 (Critical — 2026-07-31 실측 기준 정정)

`promote-main.yml`이 default branch에 없어 dispatch가 404이면 격리 feature 브랜치에서
`CONFIRMATION=PROMOTE bash scripts/release/promote-main.sh --prepare-only`로 릴리스 diff를 준비한다.
이 모드는 stage/commit/push/dispatch 없이 로컬 Changeset 소비와 승격 게이트만 실행한다.
변경은 dev 대상 PR로 전달하고 새 dev SHA의 CI·alpha를 재검증한다. 운영 순서는
`docs/ops/prod-task168-transition-runbook.md`를 따른다.

> 2026-07-20판은 "main은 유산 브랜치이고 배포와 무관하다 · `deploy.yml`은 사용하지 않는다"라고
> 적고 있었다. **둘 다 사실이 아니다.** 그 서술을 믿고 `deploy.yml`의 main 전용 job을 dead code로
> 오판해 삭제 직전까지 간 사고가 2026-07-31에 있었다 — 그 job은 라이브 프로덕션의 유일한 배포
> 경로다. 아래는 실측(프로덕션 200 응답 · `deploy.yml` main 실행 6회 성공)으로 다시 쓴 내용이다.

**`dev`와 `main` 둘 다 살아 있고, 각자 다른 환경의 배포를 트리거한다.**

| 브랜치 | 트리거 워크플로 | 배포 대상 | 승인 게이트 |
|---|---|---|---|
| `dev` push | `deploy-alpha.yml` | **alpha.teameet.co.kr** | 없음 (즉시 실배포) |
| `main` push | `deploy.yml`의 `build-images` + `deploy` job | **teameet.co.kr (프로덕션)** | `environment: production` |

- **프로덕션 DB 전환(Task168 Stage A/B)처럼 승격 뒤 추가 절차가 필요한 배포는
  `docs/ops/prod-task168-transition-runbook.md` 를 따른다** — `deploy.yml`/`deploy-prod.sh` 의
  실패 메시지가 이 문서를 직접 가리킨다.
- **모든 작업은 `dev`에서 시작한다.** 작업 브랜치·PR의 base는 항상 `dev`. 기능의 "완료" = dev 머지.
- **`dev → main` 승격은 사용자만 한다.** 에이전트는 `gh pr merge`·`git push origin dev:main` 등
  **어떤 방식으로도 직접 실행하지 않는다.** 승격이 필요해 보이면 사용자에게 알리고 멈춘다.
  사용자가 GitHub에서 직접 PR을 머지하는 것이 유일한 승격 경로이며, **자동으로 승격(머지)하는
  워크플로는 존재하지 않는다**(워크플로의 `refs/heads/main` 참조는 전부 감지용 `if:` 조건이다).
  `promote-main.yml`("Promote to main", 수동 실행)은 alpha 검증 + 필요하면 dev에 버전 커밋
  push까지만 하고, dev→main PR은 사람이 누를 링크만 job summary에 남긴다(저장소 설정이
  Actions의 PR 생성을 허용하지 않는다) — 그 PR을 실제로 열고 머지하는 것은 여전히 사용자만 한다.
- **dev 머지 = 즉시 alpha 실배포.** 승인 게이트가 없으므로 dev 머지 전 검증(테스트·tsc·lint)을
  실배포 게이트로 취급한다.
- **`main`에 dev에 없는 커밋이 생겼다면 `origin/main → dev` 방향으로 흡수한다.** 반대 방향으로
  dev 내용을 main 기준에 맞춰 되돌리지 않는다.
- **`main`에는 classic branch protection은 없지만 ruleset이 걸려 있다**(2026-08-09 실측 정정).
  `branches/main/protection`은 여전히 `404 Branch not protected`라 "보호 없음"으로 오해하기 쉬운데,
  **repository ruleset "Copilot review for default branch"(id 15258451, enforcement=active)가 default 브랜치에
  `deletion`·`non_fast_forward`·`copilot_code_review` 세 가지를 강제한다.** 즉 main으로의 force-push와
  브랜치 삭제는 실제로 막힌다 — 2026-07-31 #231 사고 때 되돌리기 force-push가 `non_fast_forward`로
  거부돼 `git revert`로 우회해야 했던 것이 이 ruleset 때문이다. 일반 fast-forward push 자체는 막지
  않으므로 PR 없는 직접 push는 여전히 가능하고 그대로 프로덕션 배포로 이어진다.
  **확인 명령**: `gh api repos/<owner>/<repo>/rulesets` (classic protection API만 보면 실상을 놓친다).
- **머지·push 전에 항상 `baseRefName`(대상 브랜치)을 확인한다.** 2026-08-09에 dev용 PR을
  `mergeable`/CI만 보고 머지했다가 **base가 main이라 프로덕션 브랜치에 머지된 사고**가 있었다
  (`gh pr merge`는 PR에 설정된 base로 머지하지, 내가 의도한 곳으로 머지하지 않는다). 머지 직전
  `gh pr view <N> --json baseRefName`으로 `dev`임을 확인하고, 아니면 `gh pr edit <N> --base dev`로
  먼저 재타깃한다. main은 위 ruleset 때문에 force-push 롤백이 안 되므로 이 사고는 `git revert`로만
  수습 가능하다 — 사전 확인이 유일한 값싼 방어다.
- **worktree는 항상 최신 `dev`를 fetch한 직후에 만든다.** `git worktree add <path> -b <branch> origin/dev`
  직전에 반드시 `git fetch origin dev`를 실행한다 — 캐시된 ref에서 분기하면 `dev`와의 diff가
  불필요하게 커지고 changeset 정책 체크 등 CI 게이트가 옛 상태를 기준으로 오판할 수 있다. dev push =
  자동 실배포이므로 오래된 base에서 분기해 뒤늦게 머지하면 검증 시점과 배포 시점의 코드도 어긋난다.
  - **로컬 `dev` 브랜치를 직접 체크아웃해서 base로 쓰지 않는다.** git은 같은 브랜치를 두 worktree에
    동시 체크아웃할 수 없고, 이 저장소는 여러 세션이 각자 `.claude/worktrees/*`를 쓰는 공유 환경이라
    로컬 `dev`가 이미 다른 worktree에 uncommitted 상태로 물려 있을 수 있다. 그 worktree를 건드리거나
    (pull/checkout/reset) base로 재사용하지 말고, 매번 `git fetch origin dev` 후 **원격 ref
    `origin/dev`**에서 분기한다.
- **착수 전에는 `fetch`, 머지 후에는 로컬 `dev` 동기화 — 양쪽 다 예외 없다** (2026-08-23 사용자 지시).
  - **착수 전 (pull first)**: 어떤 작업이라도 시작 전에 `git fetch origin dev`로 원격을 당겨온다.
    뒤처진 ref를 현행으로 착각하면 이미 고쳐진 것을 다시 고치거나 살아 있는 기능을 dead code로
    오진한다(실사례 2건).
  - **머지 후 (sync back)**: PR이 `origin/dev`에 머지되면 **그 즉시** 메인 작업트리
    (`/Users/sungjun/Dev/projects/matchup-sports-platform`)의 로컬 `dev`를 따라잡힌다. 머지 하나당 한 번:
    ```bash
    cd /Users/sungjun/Dev/projects/matchup-sports-platform
    git fetch origin dev -q && git merge --ff-only origin/dev
    ```
    미루면 조용히 벌어진다(실측: 131커밋 → 263커밋 뒤처진 상태로 발견). 사용자는 이 트리에서 직접
    코드를 보므로, 뒤처진 트리는 곧 사용자가 옛 코드를 보는 것이다.
  - **반드시 `--ff-only`.** `git pull`(머지 커밋 생성)·rebase·`reset`은 쓰지 않는다 — 공유 트리라 다른
    세션 작업을 건드린다. `--ff-only`는 위험하면 실패하고 멈추므로 미커밋 변경을 보존한다.
  - **FF가 거부되면 지우지 말고 백업 후 진행한다.** `git status --porcelain`과
    `git diff --name-only HEAD origin/dev`의 **교집합**으로 충돌 파일만 특정하고(나머지 미커밋 변경은
    손대지 않는다), 디렉터리 구조를 유지해 백업한 뒤 원복·FF 하고 **백업 경로를 사용자에게 알린다.**
    타 세션의 미커밋 변경을 되돌려야 하면 그 전에 사용자 승인을 받는다.

## DB 마이그레이션 규율 (Critical — 2026-07-12 프로덕션 장애 재발 방지)

- **스키마 변경은 반드시 migration 파일 동반.** `prisma db push`로만 dev에 반영하고 migration을
  빠뜨리면 prod `migrate deploy`가 깨진다(실사례: 리뷰 테이블 migration 누락 → 배포 중단·서비스 장애).
  스키마·마이그레이션 위치: `apps/v1_api/prisma/schema.prisma`, `apps/v1_api/prisma/migrations/`.
- **CI가 강제한다**: `deploy.yml`의 "V1 migration replay + drift gate" 스텝이 ① 빈 DB에 마이그레이션
  전체 체인 재생 ② `schema.prisma` 드리프트 0을 검증한다 — 어느 쪽이 깨져도 CI red. 같은 파일의
  "Expand-contract migration gate (PR)"도 파괴적 변경을 검사한다.
- 수동 SQL로 dev에 먼저 적용한 경우: 같은 내용을 **idempotent migration**(IF NOT EXISTS/가드)으로
  작성하고 dev에는 `prisma migrate resolve --applied`로 박제한다.

## Core Engineering Principles

이 프로젝트의 모든 변경에는 아래 7개 원칙이 엄격히 적용된다.

1. **Resolve Tech Debt — Never Defer** (기술 부채는 즉시 해결)
   - 작업 범위 안의 TODO, hack, workaround, 임시 해결책은 같은 변경에서 고친다. 별도 티켓 이연 금지.
   - 리뷰어는 범위 내 미해결 기술 부채를 **Critical**로 표시(Warning 아님).
   - 증명된 패턴: in-memory mock → Prisma 전환, `Record<string, unknown>` → 전용 DTO 전환.
2. **Design System Consistency** (디자인 시스템 일관성)
   - 우선순위는 `DESIGN.md` §1 "Source Of Truth Order"를 따른다: `DESIGN.md` > `.impeccable.md` >
     `apps/v1_web/src/app/tokens.css`(치수 토큰) · `apps/v1_web/src/app/globals.css` `:root`(색·타입 토큰)
     > `apps/v1_web/src/components/v1-ui/`의 공유 프리미티브 > 코드 추론.
   - 문서 탐색은 `docs/DESIGN_DOCUMENT_MAP.md`(navigation only, 규칙 정의 문서가 아님).
   - **토큰 우선**: 하드코딩 색·간격·폰트 금지. v1 구체 규칙은 `docs/guides/v1-coding-patterns.md` §2.
   - **컴포넌트 재사용**: 인라인 마크업 전에 `components/v1-ui/`(`primitives.tsx`의 `EmptyState`·
     `ErrorState`·`Card`·`AlertBanner`, `confirm-modal.tsx`, `bottom-sheet.tsx` 등)를 먼저 확인한다.
   - **시각 절제**: 과한 shadow, 과한 border, content-first glass 금지. 기본값은 Toss-like clean
     layout의 solid-first rhythm이다.
3. **Security Always** (보안은 항상)
   - 태스크 종류 무관하게 모든 변경은 보안 관점에서 검토한다.
   - 체크: 하드코딩 시크릿 없음 / 시스템 경계 입력 검증 / 신규 엔드포인트 auth·authz / SQL injection /
     XSS / CSRF / 신규 의존성 CVE.
   - 백엔드: 인증 가드(`V1AuthGuard`) + 어드민 컨텍스트(`AdminContextService.getActiveAdmin`) + 서비스
     계층 소유권·역할 검증의 다층 방어. 라우트 가드만 믿지 않는다.
   - 프론트엔드: `dangerouslySetInnerHTML` 최소화, 사용자 입력 HTML 이스케이프, 시크릿을 프론트엔드에
     두지 않는다.
4. **Mock Data Discipline** (목 데이터 규율)
   - mock/fixture 위치: `apps/v1_api/test/fixtures/`, `apps/v1_api/prisma/`(시드),
     `apps/v1_web/src/test/msw/`, `apps/v1_web/public/mock/`, 각 `*.spec.ts`·`*.test.tsx`의 inline mock.
   - **규칙**: Prisma 모델 / DTO / API 타입 변경 시 영향받는 mock·fixture·MSW 핸들러도 같은 커밋에서
     업데이트한다. Schema ↔ mock 드리프트는 리뷰어가 **Critical**로 표시.
5. **No Ambiguous Skipping** (모호함을 조용히 지나치지 않기)
   - 요구사항이 모호하거나 충돌하면 **추측하고 진행하지 않는다**.
   - 컴파일만 되는 "가장 쉬운 경로"를 선택하지 않는다.
   - 원본 요청의 모든 조건이 설계 → 구현 → 검증 전 단계에 살아 있어야 한다.
   - 조용히 드롭된 요구사항은 리뷰어가 **Critical**로 표시.
6. **Ambiguity → Re-enter Planning** (모호함은 기획 재진입)
   - 빌더가 모호함을 만나면: 작업 중단 → 오케스트레이터에 `BLOCKED: {질문}` 보고 →
     `project-director` + `tech-planner` 재호출 → 기획팀이 task 문서 업데이트 → 빌더에게 재핸드오프.
   - 이 루프는 실패가 아니라 **올바른 경로**다. 같은 모호함이 3회 이상 에스컬레이션되면
     오케스트레이터가 사용자에게 직접 질문한다.
7. **Structured Task Documents** (구조화된 태스크 문서)
   - 기획팀은 `.github/tasks/{N}-{task-name}.md`에 태스크 문서를 작성한다. 규칙(번호·Status 표기·
     archive 기준)과 **필수 섹션 템플릿**은 `.github/tasks/README.md`에 있다.
   - 필수 섹션: Context / Goal / Original Conditions (체크박스) / User Scenarios / Test Scenarios
     (happy/edge/error/mock updates) / Parallel Work Breakdown (Backend ⟂ Frontend ⟂ Infra + 순차) /
     Acceptance Criteria / Tech Debt Resolved / Security Notes / Risks & Dependencies / Ambiguity Log.
   - 완료된 태스크는 `.github/tasks/archive/`로 옮긴다(판정 규칙은 같은 README).

## Repo Map

```
apps/
  v1_web/                 → Next.js 16 App Router 웹 (포트 3013)
    src/app/              → 라우트. 공개·사용자 화면은 최상위 폴더(home, matches, team-matches, teams,
                            tournaments, league-matches, chat, my, …), 어드민은 admin/, 대회 운영 콘솔은
                            tournament-ops/. globals.css(색·타입 토큰) · tokens.css(치수 토큰)
    src/components/       → 도메인별 컴포넌트 + v1-ui/(공유 셸·프리미티브)
    src/hooks/            → use-v1-api.ts(서버 상태 훅 모음), use-v1-game-operations*.ts 등
    src/lib/              → api-client.ts, error-message.ts, v1-status-labels.ts, date-utils.ts 등
    src/types/            → API 타입(api.ts 등)
    src/test/msw/         → Vitest용 MSW 핸들러
    public/mock/          → 로컬 mock 이미지
  v1_api/                 → NestJS 11 백엔드 (포트 8121, prefix /api/v1)
    src/<domain>/         → 도메인 모듈(auth, teams, team-matches, matches, tournaments,
                            tournament-operations, games, game-operations, league-matches, chat,
                            notifications, admin, realtime, …)
    src/common/           → 필터·인터셉터·가드·감사·로깅
    prisma/               → schema.prisma · migrations/ · 시드
    test/                 → 통합 스펙(*.integration-spec.ts) · fixtures/ · helpers/
  v1_android/ v1_ios/     → 네이티브 셸
e2e/                      → v1 Playwright(v1.config.ts · v1-tests/)
deploy/                   → Dockerfile.v1-api · Dockerfile.v1-web · docker-compose.{prod,alpha}.yml · nginx
scripts/                  → release/(배포·버전 계약) · qa/(가드레일 검사·QA 보조) · alpha 검증·캡처 스크립트
docs/                     → docs/README.md 가 폴더별 목적과 정본 문서 표를 가진다
.github/                  → workflows/ · tasks/
.claude/ .codex/          → 에이전트 정의(Claude / Codex)
infra/load/               → k6 부하 테스트 하네스
```

## 기술 스택 (v1 실사용 기준)

- **Web**: Next.js 16 (App Router, `next dev --webpack`) · React 19.2 · Tailwind CSS v4 + PostCSS ·
  TanStack React Query 5(+ persist) · Axios · clsx + class-variance-authority + tailwind-merge ·
  Lucide React · Socket.IO client · TipTap(리치 텍스트) · Vitest + jsdom + Testing Library + MSW
- **API**: NestJS 11 · TypeScript · Prisma 6 + PostgreSQL 16 · class-validator + class-transformer ·
  Swagger(`/docs`) · Socket.IO(`@nestjs/websockets`) · `@nestjs/throttler` · nestjs-pino ·
  web-push(VAPID) + APNs + FCM · AWS SES · Jest 30 + ts-jest + Supertest
- **Infra**: pnpm workspaces + Turborepo · Docker Compose · GitHub Actions · Changesets(버전·CHANGELOG)
- v1_web 의존성에 `zustand`가 있지만 import 0건이다 — 클라이언트 상태 관리 기준으로 삼지 않는다.

## 포트

| 서비스 | dev (`docker-compose.yml` / 직접 실행) | prod·alpha (`deploy/docker-compose.prod.yml`, alpha는 `docker-compose.alpha.yml` 오버레이) |
|---|---|---|
| v1_web | 3013 (`apps/v1_web/package.json` dev 스크립트) | 3013 (`127.0.0.1` 바인딩, nginx 뒷단) |
| v1_api | 8121 (`API_PORT \|\| 8121`, `apps/v1_api/src/main.ts`) | 8121 (`127.0.0.1` 바인딩, nginx 뒷단) |
| game-operations worker | — | `WORKER_PORT` 기본 8122 |
| v1_postgres | 컨테이너 내부 5432만(호스트 노출 없음) | 컨테이너 내부 |

- 웹은 `/api/:path*`·`/uploads/:path*`를 API로 rewrite한다(`apps/v1_web/next.config.ts`,
  dev `http://localhost:8121` / prod `http://v1_api:8121`).

## 개발·검증 명령

```bash
pnpm --filter v1_api dev          # API (8121)
pnpm --filter v1_web dev          # Web (3013) — 검증 목적으로는 띄우지 않는다(아래 "운영 워크플로" 7)
pnpm --filter v1_web lint         # tsc --noEmit + scripts/v1-pattern-check.mjs
pnpm --filter v1_api lint         # tsc --noEmit + scripts/v1-surface-check.mjs
pnpm --filter v1_web build
pnpm v1:db:generate | v1:db:migrate | v1:db:push | v1:db:studio | v1:db:seed
```

```bash
pnpm --filter v1_web test              # Vitest(jsdom) — src/**/*.test.{ts,tsx}. 반드시 apps/v1_web 기준으로 실행
pnpm --filter v1_api test              # Jest unit — src/**/*.spec.ts
pnpm --filter v1_api test:integration  # Jest integration(--runInBand) — test/**/*.integration-spec.ts, DB 필요
pnpm v1:test                           # 위 v1_api unit + v1_web test
pnpm test:e2e:v1                       # Playwright — e2e/v1.config.ts (v1 스택 가동 전제)
```

- 통합 스펙은 `DATABASE_URL`이 있는 환경(CI)에서만 돈다. 가시성·권한·기본값 변경의 통합 red를
  "낡은 테스트"로 읽지 않는다.
- 통합 테스트 fixture: `apps/v1_api/test/fixtures/`, 헬퍼: `apps/v1_api/test/helpers/`.
- 프론트 네트워크 모킹: MSW(`apps/v1_web/src/test/msw/`), lifecycle은 `apps/v1_web/vitest.setup.ts`.
- 부하 테스트: `infra/load/`(k6).
- `.env*`는 읽거나 출력하지 않는다. 파괴적 시드·리셋은 사용자가 명시할 때만.

## 아키텍처

### 인증
- 세션은 `teameet_v1_session` httpOnly 쿠키 하나(`v1.<payload>.<HMAC>`, 서명만 하는 stateless 토큰 —
  저장 테이블 없음). 발급은 로그인·소셜(카카오/애플 등) API. 해석: `apps/v1_api/src/auth/v1-session.ts`.
- **개발 전용 헤더 인증**: `NODE_ENV !== 'production'`일 때만 `x-v1-user-id`/`x-v1-user-email` 헤더를
  신원으로 받는다(웹은 localStorage `teameet.v1.userId`/`teameet.v1.userEmail`을 헤더로 보낸다).
  alpha·prod는 production 모드라 **401**이다.
- 가드: `V1AuthGuard`(필수) · `OptionalV1AuthGuard` · `TournamentStaffGuard` · `CreatorProfileGuard`.
  어드민은 `AdminContextService.getActiveAdmin()`이 `V1AdminUser`(role `owner|ops|support`, active)를 요구한다.

### API 응답·에러·페이지네이션
- prefix `/api/v1`. 성공 응답은 `TransformInterceptor`가 `{ status: 'success', data, timestamp }`로 감싼다.
- 에러는 `AllExceptionsFilter`(`apps/v1_api/src/common/filters/http-exception.filter.ts`)가 `{ status, statusCode, code, message, details, requestId, timestamp }`로 정규화한다. `code`는
  `DOMAIN_CODE` 형태(`PERMISSION_DENIED`, `LINEUP_DEADLINE_PASSED` …), 없으면 `INTERNAL_ERROR`.
- `ValidationPipe`는 `whitelist + forbidNonWhitelisted + transform`이다 — 웹 폼의 UI 전용 필드를
  그대로 보내면 400. submit 시 DTO 호환 payload로 정리한다.
- 목록은 cursor 기반이 기본이고 어드민 표는 page도 받는다. 다음 커서는 응답의 `pageInfo.nextCursor`에
  있다(`apps/v1_api/src/common/pagination/page-args.ts`).
- API 계약 문서: `docs/api/README.md`(색인). 엔드포인트 목록을 이 파일에 복제하지 않는다 —
  컨트롤러·DTO가 진실이고, 계약이 바뀌면 `docs/api/` 해당 문서를 같은 변경에서 고친다.

### 대회 · 리그 · 매치 — 정본 (2026-09-02 사용자 확정)

**`docs/design/competition-canonical-flow.md` 가 정본이다.** 대회·정규 리그·팀 매치·명단·결과 확정·전적에 관한
설계·구현·리뷰는 그 문서를 먼저 읽고, 충돌하는 다른 문서(태스크 문서 포함)보다 그 문서를 따른다. 요지:
대회 아래 정규 대회/정규 리그 · 모든 경기는 팀 대 팀 매치(공식/친선) · 참가는 신청제, 명단은 등번호+이름 ·
경기 명단 = 출전자(선후발 없음, 참가 명단이 기본값이고 팀이 경기 시작 전까지 경기별로 조정, 롤링 종목은 교체 기록 없음) · 결과는 "결과 보내기 → 어드민 확인" 한 단계(이의 없음) ·
팀 전적 전체/대회/리그/친선 + 개인 기록. 바꾸려면 그 문서의 결정 이력 표에 먼저 적는다.

### 팀 역할 기반 권한

`V1TeamMembership.role`은 `owner > manager > member`(`apps/v1_api/src/teams/teams.service.ts`).

- 팀 관리(초대·가입 신청 처리·팀 매치 생성 등)는 owner·manager.
- manager는 **member의 역할만** 바꾸고 **member만** 내보낼 수 있다. owner는 이 API로 바꾸거나 내보낼 수 없다.
- owner 위임은 **manager에게만** 가능하고, 위임하면 기존 owner는 manager가 된다. manager는 팀당 최대 5명.
- 권한 판정은 서비스 계층(`getManagementActor` 등)에서 한다. 컨트롤러에서 직접 DB 조회로 권한을 검사하지 않는다.

## 백엔드 개발 규칙

- 모듈 구조: `*.module.ts` + `*.controller.ts` + `*.service.ts` + `dto/`. Prisma는 `PrismaService` 주입,
  트랜잭션은 `$transaction()`.
- DTO는 `class-validator`/`class-transformer`. **중첩 JSON 필드에 `Record<string, unknown>` 금지** —
  전용 DTO 클래스 + `@ValidateNested() @Type(() => XxxDto)`.
- **숫자 기본값은 `??`**: `limit || 20`은 0을 falsy로 처리한다.
- 비밀번호 해시 등 민감 필드는 응답에서 제거한다. 로그 마스킹은 `src/common/logging/`.
- 실시간: `RealtimeGateway`(Socket.IO) — 사용자 알림은 `emitToUser(userId, event, payload)`, 경기 운영은
  `game.*` 메시지. 채팅 전송은 `ChatService.sendMessage`가 참가자 검증 → persist → `chat:message` emit
  순서로 처리한다(단일 경로 — 게이트웨이에서 직접 broadcast하지 않는다).
- 대회 단건 조회는 `prisma.v1Tournament.findUnique/findFirst`를 직접 부르지 말고
  `src/tournaments/tournament-surface-lookup.ts`의 헬퍼를 쓴다(`lint:surface` 래칫이 강제).
- 푸시: `WebPushService`는 VAPID 키가 없으면 비활성(경고 로그)으로 동작하고, 알림 생성은 푸시 실패와
  무관하게 성공해야 한다(fire-and-forget). 네이티브는 APNs·FCM 서비스가 따로 있다.
- 에러 코드: `DOMAIN_CODE` 형태.

## 프론트엔드 개발 규칙

- v1 구체 규칙의 정본: **`docs/guides/v1-coding-patterns.md`**(상태 라벨 단일 소스, 토큰, a11y, 해요체,
  컴포넌트, 데이터 상태, 테스트, 관측성). `pnpm --filter v1_web lint`의 `v1-pattern-check.mjs`가 일부를 강제한다.
- `@` alias → `apps/v1_web/src/`. 라우트 그룹 없이 최상위 폴더가 곧 경로다.
- 서버 상태는 TanStack React Query(`hooks/use-v1-api.ts`, 쿼리 키 `lib/query-keys.ts`). 훅·컴포넌트·유틸
  목록은 이 문서에 복제하지 않는다 — 코드가 진실이다.
- `React.forwardRef` 금지(v1_web 사용 0건) — `ref`를 Props에 직접 포함한다(React 19).
- 에러 메시지: `catch` 블록에서 타입 단언 금지. `extractErrorMessage(err, '해요체 fallback')`
  (`lib/error-message.ts`). fallback·UI 문구는 **해요체**.
- 상태 enum을 삼항으로 직접 한글화하지 않는다 — `lib/v1-status-labels.ts`·`lib/admin-labels.ts` 경유.
- 날짜 포맷은 `lib/date-utils.ts`·`lib/kst-calendar.ts` 등 기존 유틸을 쓰고 화면마다 새로 정의하지 않는다.
- 한국어 사용자 대상이므로 UI 텍스트는 한국어.

## 디자인 원칙

- **타겟**: 20~40대 생활체육 동호인, 모바일 중심 사용
- **브랜드 성격**: 활발 · 스마트 · 친근 (친근함 70% + 전문성 30%)
- **원칙**: 즉시 이해 / 신뢰 우선 / 절제된 에너지 / 모바일 본무대 / 개성 있는 깔끔함
- **안티**: 올드한 웹 느낌, 과한 장식/효과, 복잡한 네비게이션

상세 디자인 가이드: `DESIGN.md` (`.impeccable.md`는 compatibility summary)

### 레포 스킬 (`.claude/skills/`)

- **`landing-rhythm`** — 랜딩·소개·온보딩·캠페인·빈 상태 카피처럼 *사용자가 훑어 읽는 화면*의
  레이아웃·카피 기준(큰 타이틀 · 키워드→타이틀→본문→그래픽 모듈 반복 · 여백 · 강조 섹션 하나).
  DESIGN.md 가 우선하고, 앱 셸 안 리스트/디테일/폼/유틸리티 페이지에는 쓰지 않는다.
- **`browse-density`** — 목록·피드·그리드·필터·검색 결과처럼 *사용자가 고르는 화면*의 밀도 기준
  (390 에서 화면당 4장 이상 · 미디어 크기는 결정 기여도에 비례 · 필터가 결과를 가리지 않기).
  `landing-rhythm` 의 반대편이다 — 이해시키는 화면인지 비교시키는 화면인지 먼저 가른다.
- **`agy-3d-graphic`** — 화면에 들어가는 3D 그래픽을 `agy`(alias `ag`) CLI 로 만들 때의 절차.
  메시지→상징 오브젝트→style lock 프롬프트→`.claude/skills/agy-3d-graphic/scripts/postprocess.py` 검증·webp·매니페스트→
  `EmptyState illustration` 배치. 이 절차 밖에서 만든 이미지는 `apps/v1_web/public/illustrations/`에 넣지 않는다.

### UI 착수 규칙 — A·B·C 3안 브레인스토밍 필수 (2026-08-23 사용자 지시)

> **화면·컴포넌트·레이아웃을 새로 만들거나 바꾸는 작업은, 코드를 쓰기 전에 반드시
> A·B·C 3안 + 추천안을 먼저 제시하고 사용자 선택을 받는다.** 바로 구현하지 않는다.

- **적용 대상**: 신규 페이지·모달·배너·카드·폼, 기존 화면의 레이아웃/정보구조 변경,
  빈 상태(EmptyState)·에러 상태 설계, 알림 착지 화면 등 **사용자가 보는 것 전부**.
  - 대상 아님: 오타·색 토큰 치환 같은 1줄 기계적 수정, 백엔드/로직 전용 변경.
- **3안은 서로 다른 원칙을 가져야 한다.** 같은 안의 미세 변형 3개는 3안이 아니다 —
  예: "정보 밀도 최우선 / 행동 유도 최우선 / 기존 패턴 재사용 최우선"처럼 축이 갈려야 한다.
  2안만 내거나 추천 없이 나열만 하는 것 금지.
- **각 안에 장점·단점을 모두 적는다.** "단점 없음"은 금지 — 트레이드오프가 실재하는지
  먼저 검토하고, 있으면 정직하게 쓴다.
- **목업은 production fidelity.** low-fi 와이어프레임 금지 — 이 저장소의 실제 디자인
  시스템(토큰·`components/v1-ui/` 컴포넌트, 다크모드, 44px 터치, WCAG AA)을 그대로 적용해 만든다.
  기존 컴포넌트(`EmptyState`·`ConfirmModal`·`BottomSheet` 등) 재사용 여부를 각 안에 명시한다.
- **제시 순서**: ① 3안 비교표(축·장단점·작업규모) → ② `AskUserQuestion` 으로 선택받기.
  선택 전에 구현을 시작하지 않는다.
- **태스크 문서에 반영**: `.github/tasks/{N}-*.md` 의 UI 항목은 "구현" 앞에
  "3안 제시 → 선택" 단계가 선행한다는 것을 Acceptance Criteria 에 남긴다.

### 디자인 시스템 (값의 정본은 `DESIGN.md`와 토큰 파일)
- **컬러**: 블루(`--blue500` #3182F6) 단일 액센트, Pretendard 폰트.
- **토큰 파일**: 색·타입은 `apps/v1_web/src/app/globals.css` `:root`(타입 스케일
  `--font-size-micro`(11px) ~ `--font-size-heading`(24px) 8단계), 치수(radius·spacing·shadow·
  control size·easing·breakpoint)는 `apps/v1_web/src/app/tokens.css` `@theme`. `text-[Npx]` 임의값 대신 토큰.
- **종목**: 컬러 `lib/v1-sport-accent.ts`, 아이콘 `components/v1-ui/sport-glyph.tsx`.
- **다크모드**: `<html>`의 `.dark` 클래스 토글(`components/providers/theme-provider.tsx`, 저장 키 `tm-theme`).
  기본값은 항상 light이고 OS 설정을 자동으로 따르지 않는다(사용자가 'system'을 고를 때만).
- **레이아웃 재질**: 본문은 solid-first, glass는 navbar/header/overlay/button/panel chrome에서만
  (`DESIGN.md` §4.4 "glass as chrome, solid as content").
- **스타일 절제**: shadow는 hairline-depth 중심, border는 subtle full-border 중심.

### 프론트엔드 품질 기준
- **Open Redirect 방지**: `redirect`/`from` 같은 되돌아갈 경로 파라미터는 `sanitizeRedirectPath()`
  (`apps/v1_web/src/lib/session-storage.ts`)를 통과시켜 **같은 origin의 상대 경로만** 허용한다.
- **접근성 기준**: **WCAG 2.1 AA** 준수 (토스·당근마켓 동급). 컬러 대비 4.5:1, 키보드 접근성, 스크린리더 대응, `prefers-reduced-motion` 필수.
  - **의도적 예외는 `docs/design/a11y-decisions.md` 에 모아 둔다.** 감사·리뷰·정적 분석이
    접근성 위반을 지적하면 **먼저 그 문서를 확인**한다 — 거기 근거와 함께 적혀 있으면 그 지적은
    닫고, 없으면 고칠 대상이다. 현재 등재된 것: solid-fill 버튼 흰 글씨(4색 전부 AA 미달이나
    2026-08-27 KST 현행 유지 결정) · `disabled:` 저대비(WCAG 1.4.3 자체 예외) · 선수 카드
    9~11.5px(전용 디자인 언어) · 간격 1~3px 광학 보정.
  - **새로 "안 고치기로" 결정하면 그 문서에 추가한다.** 커밋 메시지에만 적으면 다음 사람이
    같은 지적을 다시 하고 같은 논의를 반복한다.
- **컬러만으로 정보 전달 금지**: 종목·상태·알림 등 의미 있는 구분은 반드시 **컬러 + 아이콘/텍스트/패턴**을 병행. 예: recruiting = 파란 점 + "모집중" 텍스트.
- **다크모드**: 다크를 지원하는 화면은 라이트/다크 양쪽에서 4.5:1 대비를 유지한다. 누락은 Critical.
- **터치 타겟**: 인터랙티브 요소 최소 44x44px.
- **접근성 요소**: 아이콘 버튼 `aria-label`, 장식 `aria-hidden="true"`, 모달 `role="dialog"` + `aria-modal="true"` + ESC 핸들러 + focus trap(`components/v1-ui/use-modal-a11y.ts`). 정적 하드코딩 id 대신 `useId()`.
- **포커스 링**: 키보드 포커스 시 `blue500` outline + 2px offset.
- **성능**: `transition-all` 금지 → `transition-colors`/`transition-transform`.
- **폼**: `<label htmlFor>` + `<input id>` 연결 필수, placeholder만으로 라벨 대체 금지.

## 코드 컨벤션

- Git 컨벤션, 코드 품질, 응답 구조: 글로벌 `~/.claude/CLAUDE.md` 참조.
- **Codex 미러**: 이 문서의 핵심 운영 규칙은 `AGENTS.md`("V1 Scope Override" + "공통 운영 규칙
  (Codex ↔ Claude 공유)")에도 요약돼 있다(Codex는 `~/.claude/CLAUDE.md`와 Claude 메모리를 읽지 못한다).
  **정본은 이 문서다.** 브랜치 정책·git 안전·DB 마이그레이션·PR 워크플로 등 양쪽에 있는 규칙을 바꿀
  때는 `AGENTS.md`도 같은 변경에서 함께 고친다 — 캡처 스크립트 경로 컨벤션이 두 문서에서 갈려
  리뷰어가 반복 지적한 전례가 있다.
- 에러 코드: `DOMAIN_CODE` 형태 (e.g., `PERMISSION_DENIED`).
- 루트에 ad hoc 스크립트·개인 메모를 두지 않는다. QA 보조 도구는 `scripts/qa/`, alpha 검증·캡처는
  `scripts/`(목록: `scripts/README-alpha-verify.md`).

## 운영 워크플로 — PR · Copilot 리뷰 · 시각 검증

> **상세 런북(명령어·상수·전체 절차)**: `docs/ops/pr-review-visual-workflow.md` (반드시 이 절차를 따른다)

1. **커밋은 내 파일만 pathspec** + 직후 `git show --stat HEAD` 검증. 완료 보고 전 게이트 = `tsc 0` +
   영향받는 테스트 + (시각 변경이면) 아래 4번의 alpha 화면 검증.
2. **Copilot 리뷰 루프**: 요청은 `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer`
   (REST `requested_reviewers`는 422). 도착은 비동기 ~3–8분 → 폴링(리뷰 수 증가). 각 finding은
   **적대적 검증으로 real만 수정**(Copilot도 틀림, 예: RQ `partialMatchKey` 빈 객체 부분일치). 스레드는
   GraphQL `addPullRequestReviewThreadReply` + `resolveReviewThread`로 답변·resolve.
   **`generated no new comments`(clean) 나올 때까지 반복.**
3. **300-파일 한도**: 변경 파일 300개 초과 시 Copilot 리뷰 거부. 커밋된 스크린샷 PNG가 원인이면
   **트리에서 `git rm`** — 갤러리 코멘트는 **SHA 고정 raw URL**
   (`raw.githubusercontent.com/<owner>/<repo>/<SHA>/...`)이라 그대로 렌더된다.
4. **UI 변경 PR은 예외 없이 3폭 갤러리 필수 — 머지 후 alpha에서 찍어 그 PR에 게시한다.**
   화면 마크업·레이아웃·스타일이 조금이라도 바뀐 PR은 📱mobile 390 / 📲tablet 768 / 🖥desktop 1440
   스크린샷 갤러리를 PR 코멘트로 첨부한다(로직/백엔드 전용 PR은 대상 아님). 로컬 next 서버로
   렌더하지 않으므로(7번) 순서는 **머지 → alpha 배포 확인(아래 "Alpha 실측 검증" 2) → 캡처 → 같은 PR에
   갤러리 코멘트 사후 게시**다. PR 본문에 "갤러리를 머지 후에 채우는 이유"를 남긴다.
   - 머지 전에는 코드로 안전성을 확인한다(로딩·에러·빈 목록에서 렌더가 깨지지 않는지 등).
   - 브라우저 검증·QA의 기본 도구는 **`ego-browser` 스킬**이다 — alpha에 실제 로그인해 사용자 흐름을
     클릭으로 밟고 단계별 스크린샷·판정을 남긴다. API 실측은 보조 근거이고 PASS 판정은 화면으로 한다.
     여러 장을 반복 캡처하는 스크립트는 `scripts/` 내부에 둔다(`/tmp`는 모듈 해석 실패).
   - 갤러리는 페이지별 3열 + raw URL 200 확인 후 게시. PR을 올린 뒤 UI 변경을 뒤늦게 인지했다면
     그 PR에 갤러리 코멘트를 추가로 게시해 채운다.
5. **전체 검수/피드백**은 built-in `Workflow` 적대 검증으로 한다. 모델 배정은 전역 `~/.claude/CLAUDE.md`
   규칙 11.
6. **CI flake**(Postgres `40P01 deadlock` 등)는 내 변경과 무관함 확인 후 `gh run rerun <id> --failed`.
   머지 준비 = `MERGEABLE/CLEAN` + 미해결 스레드 0 + CI pass.
7. **런타임·화면 동작은 로컬 next 서버가 아니라 alpha 배포로 검증한다(Critical — 2026-08-09 실사고).**
   `next dev`/`next start`/`next build` 반복·standalone 기동으로 검증하지 않는다. dev 머지 = 즉시 alpha
   실배포이므로 **fix 후보를 dev에 머지해 alpha에서 직접 재측정**하는 것이 이 레포의 검증 루프이자
   ground truth다. 실사고: schedule 라우트의 not-found HTTP 200 결함을 로컬에서 파다가 (a) `next start`
   좀비 서버(`kill $SRV`가 래퍼만 죽이고 next-server 자식이 포트 점유)가 옛 빌드를 서빙해 거짓 결론을
   냈고, (b) 병렬 세션의 `next dev`와 겹쳐 결과가 뒤엉켰다 — 몇 시간·수십 빌드를 태우고도 못 고쳤다.
   - 4번(UI 갤러리)과 7번(런타임 진단)은 같은 원칙의 두 적용이다 — 둘 다 alpha에서 본다.
   - API만 로컬에서 띄워야 하는 경우(예: 통합 테스트용 DB)에도 검증이 끝나면 **내가 띄운 프로세스를
     내가 종료**한다. 새로 띄우기 전 기존 리스너를 먼저 확인한다(단순 `grep node`는 무관한 프로세스를
     잡는다): `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(301[3-9]|302[0-9]|812[0-9]|822[0-9])'`
8. **v1 기능 PR엔 `.changeset/*.md`가 필요하다.** `apps/v1_api/`·`apps/v1_web/`·`deploy/`·
   `.github/workflows/`·`scripts/release/`·루트 매니페스트 변경이 대상이고, `.md`·테스트·fixtures·
   `docs/`·`e2e/`·`.github/tasks/`·`scripts/qa/`·`scripts/docs/`는 제외다(`scripts/release/check-changeset-policy.mjs`).
   빠지면 dev-push CI가 실패하고 alpha 배포가 막힌다.
9. **PR 제목·본문은 한국어로 작성한다.**

## Alpha 실측 검증 (E2E 테스트 절차)

> 위 7번의 "alpha 가 ground truth"를 실제로 실행하는 절차. 상세 스크립트 목록: `scripts/README-alpha-verify.md`

### 1. 자격증명 — 저장소에 절대 적지 않는다

**이 저장소는 PUBLIC이다.** 계정·비밀번호·세션 토큰·프로덕션 식별자를 `CLAUDE.md`·`AGENTS.md`·`scripts/`·PR
코멘트 어디에도 적지 말 것. alpha E2E 계정 목록과 공통 비밀번호는 **저장소 밖의 비공개
프로젝트 메모리**(`~/.claude/projects/<이 저장소>/memory/alpha-e2e-test-accounts.md`)에 있다.
계정 종류: 플랫폼 관리자(`adminRole=ops`) / 대회 스태프 / A·B팀 팀장 / 선수 10명(양 팀 소속) /
초대 대상 3명. 전 계정 약관 동의·휴대폰·이메일 인증 완료.

세션은 `teameet_v1_session` **쿠키 하나**이고 `v1.<payload>.<HMAC>` 형태로 **서명만 해서**
발급된다 — 저장 테이블이 없으므로 **DB에서 뽑을 수 없다.** alpha는 프로덕션 모드라
**헤더 dev 인증(`x-v1-user-*`)이 401**이다. `login` API가 유일한 발급 경로다.

```bash
curl -sS -D- -o/dev/null https://alpha.teameet.co.kr/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"<계정>","password":"<비밀번호>"}' \
  | grep -i '^set-cookie: teameet_v1_session'
export ALPHA_SESSION_TOKEN='v1.<payload>.<HMAC>'   # 스크립트엔 이 환경변수로만 넘긴다
```

### 2. 배포 창을 피한다 (Critical — 2026-08-13 실사고)

배포 중에는 502가 뜬다. 그 창에서 측정하면 **멀쩡한 화면을 결함으로 오진한다.** 측정 전에
① 배포 완료 ② 배포된 SHA가 내 머지를 포함하는지를 반드시 확인한다.

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 \
  --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-\(release\|commit\)'
curl -fsS  https://alpha.teameet.co.kr/api/v1/health   # .data.checks.db === true
git merge-base --is-ancestor <내 머지 커밋> <배포 SHA> && echo "포함됨"
```

`x-teameet-commit` 이 **내 머지 커밋 이후**여야 내 변경을 보고 있는 것이다. 직전 배포 run이
`cancelled` 로 남아 있을 수 있다(뒤 머지가 앞 배포를 대체) — 그때 alpha가 서빙하는 SHA는
마지막 **성공** 배포의 것이다.

### 3. 라이브 경기 상태는 운영 API로 직접 만든다

alpha에는 `status === 'live'` 경기가 보통 없다(전부 `ended`). 라이브 전용 UI(경기 시계,
하프타임 배지, 라이브 스코어, 콘솔 재연결)는 "재현 불가"로 접지 말고 운영자 경로를 그대로 밟는다.

```
start → end-period(하프타임) → start-period(후반) → end-period → end
```

대회·리그 경기 명단은 참가 명단에서 계산된 제출본이라 라인업 단계가 없다(Task 179 — 라인업 저장·제출
API 는 409 `ROSTER_MANAGED_BY_ADJUSTMENTS`, 빠질 선수는 `/games/:gameId/sides/:sideId/roster-adjustments`).

실측으로 확인된 계약 2개(하나라도 어기면 409/422):
1. **takeover 토큰은 REST로 못 받는다.** `TOURNAMENT_FIXTURE` 게임의 모든 커맨드에 필수인데
   발급 경로는 Socket.IO `/game-operations` 의 `game.takeover.request` 하나뿐이다
   (`socket.io-client` + `extraHeaders: { cookie }` + `auth: { clientInstanceId,
   authorizationSubjectVersion: 0 }`).
2. **`Idempotency-Key` 헤더 = body의 `clientCommandId`.** 다르면 422 `COMMAND_IDEMPOTENCY_KEY_MISMATCH`.

### 4. 판정은 공개 API를 ground truth로

커맨드 응답이 아니라 `GET /tournaments/:id/matches/:fixtureId`(비인증)를 매 전이마다 찍어
**관전자가 실제로 받는 값**을 본다. 육안 스크린샷 대조로 "차이 없음"을 결론내지 말고
computed 값(색·폰트크기·정렬)을 직접 읽는다.

### 5. 캡처 시 주의

- 라이브 경기가 있는 페이지는 10초 주기 폴링이라 Playwright `waitUntil: 'networkidle'`이
  **절대 끝나지 않는다**(60초 타임아웃) → `domcontentloaded` + 명시적 대기.
- 캡처 스크립트는 **`scripts/` 내부**에 둔다(`/tmp`는 모듈 해석 실패).
- 갤러리는 페이지별 📱390 / 📲768 / 🖥1440 3열 + raw URL 200 확인 후 PR 코멘트 게시.

### 6. 배포와 QA 시드의 관계

alpha는 배포마다 QA 시드가 다시 돈다. 시드의 `deleteMany`는 **시드가 만든 대회(`tournamentId`
로 지정)** 범위로만 한정되고 사용자·팀은 `upsert`만 하므로 **E2E 계정·팀은 배포로 지워지지
않는다.** **이름은 기준이 아니다** — 시드가 만드는 대회들이 `(테스트)` 로 시작할 뿐이고,
**직접 만든 대회는 이름이 `(테스트)` 로 시작해도 시드의 대상이 아니라 배포로 정리되지 않는다**
(2026-09-08 실측: 배포 두 번을 건너 그대로 남았다). 그래서 E2E는 **새 대회를 직접 만드는** 편이
안전하다 — 시드가 건드리지 않기 때문이지, 치워 주기 때문이 아니다.

단 **직접 만든 대진은 생성 즉시 게임·운영 감사기록이 붙어 삭제가 409 로 거부되므로**
(`FIXTURE_NOT_DELETABLE`), QA 로 만들면 **영구히 남는다는 전제**로 진행한다.

## Agent Team 운영

- 프로젝트 에이전트 정의: `.claude/agents/*.md`(frontmatter `name:`이 있는 19개) — 팀 구성은
  `.claude/agents/team-config.md`, 파이프라인은 `.claude/agents/workflow.md`. Codex 쪽 정본은 `.codex/agents/`.
- 오케스트레이션·모델 배정은 전역 `~/.claude/CLAUDE.md` 규칙 11("모델 배정과 병렬 오케스트레이션")을 따른다.

## 알려진 제약 (v1)

1. **Web Push는 VAPID 키가 있어야 켜진다.** `WebPushService`는 키가 없으면 비활성(경고 로그)으로 동작하고
   알림 생성은 계속 성공한다. 키 생성·갱신·롤백: `docs/ops/vapid-setup.md`.
2. **`V1WebPushFailureLog` 보관 기간 무제한.** 행을 지우는 cleanup이 없다(쓰기는 `web-push.service.ts`,
   조회·확인 처리는 `admin/admin-ops.service.ts`뿐). 장기 운영 시 행이 계속 늘어난다.
