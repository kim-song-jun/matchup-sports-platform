# Task 40 — Scenario And Doc Truth Sync

Owner: project-director + docs-writer
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

현재 저장소는 code/task/scenario/overview 문서 간 상태 드리프트가 분명하다. 대표적으로:

- `MATCH-003`는 문서상 blocked이지만 code/task 기록상 lifecycle 작업이 이미 진행되었다.
- `Task 26`은 `/mercenary/[id]` 상세가 없다고 적지만 실제 파일은 존재한다.
- `IMPLEMENTATION_STATUS`, `PAGE_FEATURES`, scenario 허브는 같은 기능을 서로 다른 완료 기준으로 설명한다.

이 상태로 다음 구현 라운드를 시작하면 stale claim이 다시 backlog 우선순위를 오염시킨다.

## Goal

- 현재 코드 사실과 검증 사실을 기준으로 docs/task 상태를 재동기화한다.
- “구현됨”, “검증됨”, “부분 구현”, “미지원”의 언어를 문서 전반에서 일관되게 맞춘다.
- 다음 라운드의 single source를 복원한다.

## Evidence

- `docs/scenarios/index.md`
- `docs/scenarios/03-match-flows.md`
- `docs/scenarios/06-mercenary-flows.md`
- `docs/scenarios/07-chat-and-notifications.md`
- `docs/scenarios/08-marketplace-and-lessons.md`
- `docs/scenarios/09-payment-review-badge.md`
- `docs/scenarios/10-profile-settings-admin.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PAGE_FEATURES.md`
- `docs/WORK_SUMMARY.md`
- `.github/tasks/26-qa-backlog-followups.md`
- `.github/tasks/32-web-audit-and-remediation.md`

## Owned Write Scope

- `docs/scenarios/**`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PAGE_FEATURES.md`
- `docs/WORK_SUMMARY.md`
- `.github/tasks/26-qa-backlog-followups.md`
- `.github/tasks/32-web-audit-and-remediation.md`

## Acceptance Criteria

- stale blocked claim과 현재 코드 사실이 충돌하는 문장이 제거되거나 현재형으로 수정된다.
- scenario index의 master checklist와 automation mapping이 실제 spec/code 상태와 맞는다.
- `구현`, `검증`, `부분 구현`, `미지원`, `follow-up`의 용어가 문서 간 일관된다.
- outdated backlog item은 삭제하지 말고 “resolved / stale / superseded”로 재분류해 추적성을 남긴다.

## Validation

- `rg -n "PATCH /matches/:id.*미구현|/mercenary/\\[id\\].*미존재|device-local|mock fallback|partial|planned" docs .github/tasks`
- 문서 링크/경로 수동 점검
- 필요 시 targeted code spot-check

## Out Of Scope

- 앱 코드 수정
- 테스트 코드 수정
- 새로운 product scope 결정

## Risks

- 문서 truth sync는 현재 코드 사실을 기준으로 하되, 미커밋 WIP와 이미 머지된 상태를 혼동하지 않도록 주의해야 한다.

## Execution Report (2026-04-11)

- scenario 허브와 개별 scenario 문서를 현재 코드/검증 사실 기준으로 재분류했다.
- `MATCH-003 blocked`, `/mercenary/[id] 미존재`, 알림 설정 저장 완료 같은 stale claim을 제거하거나 현재형으로 고쳤다.
- `구현됨 / 검증됨 / 부분 구현 / 미지원 / follow-up` 언어를 시나리오, 상태 문서, backlog 문서에 맞춰 정렬했다.
- outdated backlog는 삭제하지 않고 `resolved / stale / superseded`로 남겨 추적성을 유지했다.

### Files Updated

- `docs/scenarios/index.md`
- `docs/scenarios/03-match-flows.md`
- `docs/scenarios/06-mercenary-flows.md`
- `docs/scenarios/08-marketplace-and-lessons.md`
- `docs/scenarios/09-payment-review-badge.md`
- `docs/scenarios/10-profile-settings-admin.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PAGE_FEATURES.md`
- `docs/WORK_SUMMARY.md`
- `.github/tasks/26-qa-backlog-followups.md`
- `.github/tasks/32-web-audit-and-remediation.md`

### Validation Result

- targeted code spot-check
  - `apps/api/src/matches/matches.controller.ts`
  - `apps/api/src/teams/teams.controller.ts`
  - `apps/web/src/app/(main)/mercenary/[id]/page.tsx`
  - `apps/web/src/app/(main)/settings/notifications/page.tsx`
  - `e2e/tests/match-join-flow.spec.ts`
- grep sanity check
  - stale 핵심 표현(`PATCH /matches/:id 미구현`, `/mercenary/[id] 미존재`)은 task/doc truth source에서 제거 또는 재분류됨
- formatting check
  - `git diff --check -- docs/scenarios/index.md docs/scenarios/03-match-flows.md docs/scenarios/06-mercenary-flows.md docs/scenarios/08-marketplace-and-lessons.md docs/scenarios/09-payment-review-badge.md docs/scenarios/10-profile-settings-admin.md docs/IMPLEMENTATION_STATUS.md docs/PAGE_FEATURES.md docs/WORK_SUMMARY.md .github/tasks/26-qa-backlog-followups.md .github/tasks/32-web-audit-and-remediation.md`
  - passed

### Acceptance Criteria Check

- [x] stale blocked claim과 현재 코드 사실이 충돌하는 문장을 제거하거나 현재형으로 수정했다.
- [x] scenario index의 master checklist와 automation mapping을 현재 spec/code 기준으로 맞췄다.
- [x] `구현`, `검증`, `부분 구현`, `미지원`, `follow-up` 용어를 문서 간 일관되게 맞췄다.
- [x] outdated backlog item을 삭제하지 않고 `resolved / stale / superseded`로 재분류했다.

### Out-Of-Scope Follow-ups

- mercenary lifecycle completion: task 36
- admin real-data and audit persistence: task 37
- notification preference server sync: task 39
- scenario 최신 런타임 재검증: 후속 구현 task 완료 후 다시 수행
