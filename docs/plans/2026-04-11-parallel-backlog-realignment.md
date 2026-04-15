# Teameet Parallel Backlog Realignment

> Date: 2026-04-11
> Scope: existing docs/tasks/codebase cross-check -> next parallel task slate
> Mode: planning + documentation only

## Purpose

이 문서는 현재 저장소의 `docs/`, `.github/tasks/`, `docs/scenarios/`, 실제 코드 상태를 함께 대조해 다음 질문에 답하기 위해 작성한다.

1. 지금 무엇이 실제로 끝났는가
2. 무엇이 아직 비어 있거나 거짓 affordance 상태인가
3. 기존 Claude/Codex 세션에서 누적된 요구사항과 얼마나 일치하는가
4. 다음 구현 라운드를 서로 독립적인 task로 어떻게 쪼개야 병렬 진행이 가능한가

외부 대화 로그 자체는 현재 세션에서 직접 읽을 수 없으므로, 이전 세션에서 남겨진 저장소 내부 산출물을 사실 근거로 사용한다.

## Evidence Base

- 제품/범위 문서
  - `docs/PROJECT_OVERVIEW.md`
  - `docs/IMPLEMENTATION_STATUS.md`
  - `docs/PAGE_FEATURES.md`
  - `docs/TEAM_MATCHING_SPEC.md`
  - `docs/Teameet_통합기획서_PRD_v3.md`
- 진행/회고 문서
  - `docs/WORK_SUMMARY.md`
  - `docs/plans/2026-04-09-comprehensive-improvement-plan.md`
  - `docs/plans/2026-04-10-web-audit-remediation-plan.md`
  - `docs/plans/2026-04-08-next-feature-backlog.md`
- QA/시나리오 기준
  - `docs/scenarios/index.md`
  - `docs/scenarios/01-auth-and-session.md` ~ `10-profile-settings-admin.md`
- 기존 task/backlog
  - `.github/tasks/21-auth-gate-and-nonlogin-ux.md`
  - `.github/tasks/23-team-match-application-visibility.md`
  - `.github/tasks/24-team-match-creation-and-apply-permission.md`
  - `.github/tasks/26-qa-backlog-followups.md`
  - `.github/tasks/29-ux-design-audit.md`
  - `.github/tasks/31-team-membership-tdd-rollout.md`
  - `.github/tasks/32-web-audit-and-remediation.md`
- 코드 사실원천
  - `apps/web/src/app/**/page.tsx`
  - `apps/api/src/**`

## Current Judgment

### 1. Solidly completed

- 인증/세션/권한 가드는 문서와 자동화 기준이 가장 잘 맞는 축이다.
- 개인 매치 생성/참가 discovery v1, 알림 action center v1, 팀/멤버십 핵심 계약은 이미 한 차례 안정화되었다.
- 디자인 시스템, 실사형 fallback, 기본 성능 개선, production deploy hardening은 큰 축에서 이미 진행되었다.

### 2. Still incomplete or misleading

- 브랜드 표기가 `Teameet`과 `TeamMeet`로 갈라져 있다.
- 일부 high-traffic 사용자 화면이 여전히 dev/mock/sample fallback을 품고 있다.
- 팀 매치 운영 서브플로우(`arrival`, `score`)는 route-local mock에 의존한다.
- 용병 플로우는 상세 페이지는 존재하지만 create/apply/approve/status 전체 여정은 아직 닫히지 않았다.
- 관리자 화면 일부와 관리자 audit 상태는 아직 mock/in-memory 성격이 남아 있다.
- 업로드는 백엔드가 먼저 준비됐지만 실제 사용자 폼 UI 연결은 아직 부족하다.
- 알림 설정은 backend schema와 hooks가 이미 있는데도 현재 페이지는 device-local 토글 UI다.

### 3. Biggest documentation drift

- `docs/scenarios/03-match-flows.md`는 아직 `PATCH /matches/:id` 미구현을 전제로 적혀 있다.
- `.github/tasks/26-qa-backlog-followups.md`의 `C1`은 현재 코드에 이미 존재하는 `/mercenary/[id]/page.tsx`와 충돌한다.
- `docs/IMPLEMENTATION_STATUS.md`, `docs/PAGE_FEATURES.md`, scenario 허브는 “구현됨”, “검증됨”, “부분 구현”의 기준이 서로 다르다.
- `docs/plans/2026-04-10-web-audit-remediation-plan.md`가 제시한 후속 범위 중 일부는 아직 task로 분해되지 않았고, 일부는 기존 task와 중복된다.

## Alignment With Prior User Direction

다음 항목은 저장소에 남아 있는 이전 세션 산출물과 잘 일치한다.

- mock을 실데이터처럼 보이게 하지 말 것
- 거래형/운영형 플로우에서 false affordance를 없앨 것
- 팀/매치/알림을 실제 사용자 여정 기준으로 검증할 것
- task 문서와 QA 시나리오를 single source로 유지할 것
- 큰 작업은 병렬 가능한 독립 task로 분해할 것

현재 불일치가 남아 있는 지점은 아래와 같다.

- 문서상 “완료”와 실제 QA 완료가 동일하게 취급되고 있다.
- backend 준비가 끝난 영역(notification preference, upload backend)이 프론트 UX와 연결되지 않았다.
- stale backlog가 남아 있어 다음 사이클 우선순위 판단을 방해한다.

## Parallelization Rules

새 task는 아래 원칙으로 분해한다.

1. 도메인별 write scope를 분리한다.
2. 공용 파일(`use-api.ts`, `docs/scenarios/index.md`)에 여러 task가 동시에 달라붙지 않도록 가능한 한 task별 전용 surface를 갖게 한다.
3. 공용 문서 write-back은 별도 docs-only task로 분리한다.
4. 현재 dirty worktree와 겹치는 파일은 fresh branch 또는 선행 정리 후 착수한다.

## Current Worktree Risk

현재 워크트리에는 이미 아래 성격의 미커밋 변경이 있다.

- 브랜드/public shell 관련 파일
- 팀/팀 멤버십 관련 파일
- `apps/web/src/hooks/use-api.ts`
- scenario/team E2E 관련 파일

따라서 아래 task들은 “논리적으로 독립”이지만, 실제 실행은 같은 브랜치에서 바로 병렬 커밋하기보다 task별 브랜치 분리 또는 현재 WIP 선정리가 필요하다.

## New Parallel Task Slate

### Core Now

| Task | Priority | Why now | Owned scope |
|------|----------|---------|-------------|
| `33` Brand And Public Shell Alignment | P0 | 브랜드 드리프트와 favicon 404는 제품 설명 일관성을 직접 깨뜨린다 | public layouts, shell copy, manifest/favicon |
| `34` User Surface Honest Data Contracts | P0 | `my/*`, `venues/[id]`의 mock/sample은 가장 자주 보이는 false affordance다 | user pages only |
| `35` Team Match Operational Contracts | P0 | 팀 매치 핵심 서브플로우가 mock route state에 기대고 있다 | `team-matches/[id]/*` + backend team-match ops |
| `36` Mercenary Lifecycle Completion | P0 | create/detail/apply/approve/status 전체 여정이 아직 닫히지 않았다 | mercenary frontend/backend only |
| `37` Admin Real Data And Audit Persistence | P0 | 운영 화면에서 mock/in-memory 상태는 가장 위험하다 | `admin/*`, `admin.service`, Prisma admin audit |
| `38` Upload UI Rollout | P1 | backend 업로드가 준비된 상태라 front 연결만 닫으면 여러 surface가 동시에 좋아진다 | upload UI + selected create/edit forms |
| `39` Notification Preferences Server Sync | P1 | backend contract가 이미 있는데 UX가 device-local로 남아 있어 문서와 제품이 어긋난다 | settings notifications + notifications preference surface |
| `40` Scenario And Doc Truth Sync | P0 | stale task와 scenario가 다음 구현 라운드를 계속 오염시킨다 | docs/tasks/scenario only |

### Safest Start Today

현재 worktree와의 직접 충돌을 최소화하려면 아래 순서가 가장 안전하다.

1. `40` Scenario And Doc Truth Sync
2. `34` User Surface Honest Data Contracts
3. `36` Mercenary Lifecycle Completion
4. `37` Admin Real Data And Audit Persistence

아래 task는 branch 분리 또는 현재 WIP 정리 후 착수하는 편이 좋다.

- `33`: public shell / brand 관련 파일이 이미 열려 있음
- `35`: team-match 주변 WIP와 간접 충돌 가능
- `38`: 일부 team edit/create surface와 맞물릴 수 있음
- `39`: `use-api.ts`와 notification surface가 shared file 성격을 가짐

### Later But Valuable

아래는 가치가 크지만, 이번 문서에서는 immediate core task보다 한 단계 뒤로 둔다.

- Discovery 2.1: saved search, recommendation reason, GPS distance filtering
- Chat rich actions: 이미지 첨부, 차단/신고, pinned info
- Trust automation: ELO 자동화, no-show 제재, badge progression
- Team invitation / team apply model 정리: 현재 team WIP와 충돌 가능성이 높아 immediate parallel pack에서 제외

## Why These Eight Tasks

### 1. They match the real gap map

- task 33, 34, 37, 39는 “문서와 제품의 불일치”를 바로 줄인다.
- task 35, 36은 시나리오 허브에서 오래 pending 상태인 핵심 journey를 닫는다.
- task 38은 이미 backend 선행 투자가 끝난 영역을 사용자 가치로 전환한다.
- task 40은 stale backlog 정리를 담당해 다음 라운드의 판단 비용을 줄인다.

### 2. They are mostly domain-isolated

- public shell
- user my/content + venue
- team-match operations
- mercenary
- admin
- uploads
- notification preference
- docs-only sync

### 3. They preserve the user's earlier quality bar

- no fake success
- no silent mock fallback
- no unsupported CTA pretending to work
- scenario-first verification and explicit write-back

## Recommended Execution Order

병렬로 바로 시작해도 되지만, 실제 merge order는 아래가 가장 안전하다.

1. `40` docs truth sync baseline
2. `34`, `36`, `37` 병렬
3. `33`, `39` isolated branch 병렬
4. `35` team-match operations
5. `38` upload rollout

이 순서는 “문서 기준선 고정 -> safest user/admin cleanup -> shared file/brand 정리 -> deep operational flow -> cross-surface upload” 흐름이다.

## Expected Outcome

이 task slate가 끝나면 Teameet은 다음 상태에 도달해야 한다.

- 브랜드와 문서가 하나의 이름으로 설명된다.
- 주요 사용자/관리자 화면에서 sample/mock이 실데이터처럼 보이지 않는다.
- 팀 매치와 용병은 실제 journey 단위로 설명 가능하다.
- 업로드와 알림 설정은 backend 준비 상태와 프론트 UX가 연결된다.
- scenario/task 문서는 stale claim 없이 다음 라운드의 single source가 된다.
