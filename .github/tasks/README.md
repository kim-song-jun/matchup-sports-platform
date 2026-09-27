# .github/tasks/ — 태스크 문서 규칙

- 파일명: `{N}-{task-name}.md`. 번호는 순차 부여되지만 유일하지 않을 수 있다(예: `22-*.md`가 두 개 —
  같은 번호를 먼저 소진한 뒤 뒤늦게 다른 문서가 재사용한 사례). 새 태스크는 `ls .github/tasks/ | grep
  -oE '^[0-9]+' | sort -n | tail -1`로 최신 번호를 확인하고 그다음 번호를 쓴다.
- 필수 섹션(Context / Goal / Original Conditions / User Scenarios / Test Scenarios / Parallel Work
  Breakdown / Acceptance Criteria / Tech Debt Resolved / Security Notes / Risks & Dependencies /
  Ambiguity Log)은 아래 "태스크 문서 템플릿"을 쓴다. 원칙은 루트 `CLAUDE.md` Core Engineering
  Principles 7.
- **Status 표기**: 문서 상단에 `Status: <값>` 한 줄을 남긴다(`Done`/`Completed`/`Merged`/`완료`
  계열이면 완료로 판정됨). 표기가 없거나 모호하면(진행 중·계획·검증 대기 등) 최상위에 남는다 —
  archive 판정은 파일명이 아니라 이 줄을 기준으로 한다.

## archive/ 규칙

- **완료됐거나, 더는 능동적으로 참조되지 않는 태스크만** `git mv`로 여기로 옮긴다. 파일명은 그대로
  유지(이력 보존, 번호로 역참조 가능). "진행 중만 최상위" 원칙(2026-09-27 사용자 확정) — 최상위는
  현재 살아 있는 작업만 남기고, 나머지는 archive다.
- 판정 신호(순서대로 확인, 하나라도 해당하면 archive):
  1. **v0 레거시**: 본문이 `apps/api`/`apps/web`(레거시 — 제거됐고 태그 `legacy-v0-final`에 남아 있다)만 참조하고
     `apps/v1_api`/`apps/v1_web` 참조가 전혀 없다.
  2. **완료 신호**: `Status:` 줄이 Done/Completed/Merged/Complete/완료 계열(진행형·대기 표현 없이),
     또는 "완료/Done/Completion" 류 전용 헤딩, 또는 체크박스가 전부 체크, 또는 파일명이
     `*-completion-report.md`/`*-implementation-summary.md` 류.
  3. **정체**: 마지막 커밋 수정일이 30일 초과이고, 아래 유지 조건에도 해당하지 않는다.
- 유지(최상위) 조건 — 아래 중 하나라도 해당하면 archive하지 않는다(정체 판정보다 우선):
  - 최근 30일 안에 그 파일 자체가 수정됨.
  - 번호가 160 이상이고 상태가 진행 중·계획.
  - 현재 코드(`apps/`) 또는 최상위(archive 아닌) 다른 태스크 문서·`docs/`가 경로로 인용 중
    (인용하는 쪽도 결국 archive되면 이 보호는 사라진다 — fixed-point로 재귀 해석할 것).
  - 판정 근거가 애매하면 archive하지 않고 남긴다.
- 이동 시 그 문서를 인용하던 다른 모든 추적 파일(다른 태스크 문서 포함)의 경로를 같은 커밋에서
  `.github/tasks/archive/...`로 고친다. **형제 파일 간 상대링크**(예: `61-*.md`가 `61a-*.md`를
  인용)는 두 파일의 이동 여부가 갈리면 depth가 깨지니 이동할 때마다 재확인한다.

## 현재 진행 중(최상위, archive 아님) — 2026-09-27 기준 50개

번호대 기준 대표 예시(전체 목록은 `ls .github/tasks/*.md`):
- **높은 번호(160+, 계속 진행)**: `160-match-discovery-live-host-and-team-stats-hotfix.md` ~
  `174-main-admin-registration-count-hotfix.md`, `168-competition-phase3-full-flow-verification.md`.
- **최근 수정(30일 이내)**: `106-team-match-result-lineup-gate.md`, `149-admin-assigned-team-match.md`,
  `159-alpha-runtime-node-tar-remediation.md`, `161-prod-api-openssl-scan-hotfix.md`.
- **현재 코드·다른 진행 중 문서가 인용**: `22-tournament-result-review-officialize.md`(v1_api
  서비스·통합테스트가 직접 인용), `127-v1-team-tournament-operations-game-record.md`,
  `81-sm-new-direction-0502-freeze.md`(docs/reference 인용), `77-test-infra-upgrade.md`,
  `78-next-to-react-migration-proposal.md`.
- 전체 목록·근거는 PR-3a 보고서의 "Follow-up 1" 절 분류표를 참조.

## 태스크 문서 템플릿

`project-director` + `tech-planner`가 태스크를 시작할 때 `.github/tasks/{N}-{task-name}.md`에 아래 구조로
작성한다. 빌더는 이 문서 없이 비자명한 변경을 시작하지 않는다. (옛 에이전트 프롬프트 파일의
"Task Document Format"을 v1 경로로 옮긴 것)

```markdown
# Task {N}: {title}

Status: Planning | In Progress | Review | Done
**Owner**: Planning team → {빌더}
**Created**: {YYYY-MM-DD}

## Context
이 태스크가 존재하는 이유. 비즈니스 문제 또는 기술적 필요.

## Goal
"Done"의 정의를 한 문장으로.

## Original Conditions (must all be satisfied)
- [ ] 조건 1 (원본 요청에서 가능하면 verbatim)
- [ ] 조건 2
(빌더는 이 전부를 충족해야 한다. 중간에 모호해지면 에스컬레이션.)

## User Scenarios
### Scenario 1: {이름}
As a {유저 유형}, I want to {액션} so that {결과}.

Steps:
1. ...

Expected result: ...

## Test Scenarios
### Happy path
- [ ] 케이스 1
### Edge cases
- [ ] 엣지 케이스 1
### Error paths
- [ ] 에러 케이스 1
### Mock data updates needed
- [ ] `apps/v1_api/src/.../*.spec.ts`·`apps/v1_api/test/fixtures/` 의 mock을 schema 변경에 맞춰 업데이트
- [ ] `apps/v1_web/src/.../*.test.tsx`·`apps/v1_web/src/test/msw/` 의 API response mock 업데이트

## Parallel Work Breakdown
### Backend (Frontend/Infra와 병렬 가능)
- [ ] Step 1 — {상세}
### Frontend (Backend와 병렬 가능)
- [ ] Step 1 — {상세}  ← UI 변경이면 "A·B·C 3안 제시 → 사용자 선택"이 구현보다 먼저
### Infra (Backend/Frontend와 병렬 가능)
- [ ] Step 1 — {상세}
### Sequential (병렬 작업 이후에 실행)
- [ ] 통합 단계 (backend + frontend 완료 필요)
- [ ] 머지 후 alpha 실측 검증

## Acceptance Criteria
- [ ] Original conditions 전부 충족
- [ ] User scenarios 전부 통과
- [ ] Test scenarios 전부 green
- [ ] 범위 내 tech debt 해결됨 (새로운 부채 0)
- [ ] Security 리뷰 통과 (아래 노트 참조)
- [ ] Mock data 업데이트 완료, schema와 sync (스키마 변경이면 migration 포함)
- [ ] 디자인 시스템 준수 (token, component, naming)
- [ ] Code review: Critical=0, Warning=0

## Tech Debt Resolved
- {이 태스크가 정리한 부채 항목들}

## Security Notes
- 고려한 위협: ...
- 완화책: ...

## Risks & Dependencies
- 외부 블로커: ...
- 선행 태스크: ...

## Ambiguity Log
빌더가 에스컬레이션할 때마다 아래 표를 업데이트.

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| ...  | backend-data-dev | ... | ... |
```
