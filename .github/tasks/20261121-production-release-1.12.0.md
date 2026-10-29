# Task 20261121: alpha 검증 범위의 main 승격 준비

Status: Review
Owner: Codex
Created: 2026-10-29

## Context
사용자가 현재까지 alpha에 배포된 변경을 기준으로 main 승격 준비를 요청했다. main PR 개설/머지 및 프로덕션 배포는 사용자 전용 경로다(CLAUDE.md).

## Goal
changeset을 정식 버전 후보로 정리하고, dev 대상 릴리스 PR·승격 검토 자료·사용자용 main 비교 링크를 준비한다.

## Original Conditions
- 최신 dev/main 및 공개 alpha/prod 릴리스, CI 이력을 교차 확인한다.
- 원래 공유 작업트리의 WIP와 main을 변경하지 않는다.
- main에만 있는 이전 승격 머지 커밋은 main -> dev 방향으로 흡수한다.
- 정본 promote-main.sh --prepare-only와 release gate를 사용한다.

## User Scenarios
운영자가 릴리스 PR의 변경 범위, DB 영향, alpha 검증 증거와 남은 승인 단계를 검토한 뒤 직접 main 승격 PR을 열고 머지한다.

## Test Scenarios
- alpha SHA == 준비 기준 dev SHA, resolver 버전 == alpha 릴리스 헤더.
- v1_api/v1_web 버전 일치, 미소비 changeset 소비, changelog/lockfile 일관성.
- 변경 SQL 3개는 추가형이며 release gate가 통과한다.
- main-only 이전 머지의 흡수가 기능 파일을 변경하지 않는다.
- dev 대상 PR CI 및 릴리스 후보 alpha 배포 상태 확인.

## Parallel Work Breakdown
단일 에이전트 순차 진행. Owned: 릴리스 메타데이터, changeset 소비, 릴리스 문서. Forbidden: 기능 소스·임의 DB 작업·main 변경·프로덕션 승인/배포.

## Acceptance Criteria
- [x] 정식 후보 버전/CHANGELOG 생성 및 범위 검증.
- [x] 릴리스 영향·DB 마이그레이션·운영 절차를 기록.
- [ ] dev 대상 준비 PR 생성 및 검증 상태 제공.
- [x] main용 비교 링크와 사용자 전용 단계 명시.

## Tech Debt Resolved
main-only 승격 머지 커밋을 release 준비 브랜치를 통해 dev에 흡수한다.

## Security Notes
환경 파일과 운영 비밀은 읽지 않는다. 프로덕션은 공개 릴리스 헤더와 health만 조회한다. main PR은 직접 만들거나 머지하지 않는다.

## Risks & Dependencies
현재 dev는 main보다 120커밋 앞서고 main-only 커밋 1개는 트리 차이가 없는 이전 승격 머지다. API/Web 저장 버전은 1.11.9, 현재 prod 공개 릴리스는 1.11.10, 현재 alpha는 1.12.0-alpha.20261029.gc7d185fa4146이다. 런타임 버전은 resolver 정책으로 계산되므로 manifest 버전과 구분한다.

## Ambiguity Log
사용자의 요청은 준비 단계이며 main 개설/머지 권한 위임으로 해석하지 않는다. 기존 main 일반 배포 이력과 추가 migration을 근거로 운영 절차를 정리하며 운영 DB 원장을 추정해 변경하지 않는다.

## Progress Snapshot
준비 worktree /tmp/teameet-release-1.12.0, branch release/version-1.12.0, base c7d185fa. 현재 live alpha == dev이고 Gates/Web/API/alpha 배포 모두 성공. 정본 준비 스크립트 실행/범위 검증 완료. next: release commit 및 main-only 이력 흡수 후 dev PR.

- 준비 전용 스크립트 PASS: 양쪽 manifest 1.12.0, changeset 33개 소비, main 승격 게이트 통과. 기능 파일 변경 없음. 세부 영향/남은 운영 조건은 docs/ops/prod-readiness-2026-10-29.md.

- main-only 이력 흡수 완료: d76365a64. 흡수 전/후 tree SHA 동일, origin/main이 후보의 조상임을 확인(후보 기준 main-only 0개). committed-tree PR release gate 및 소비 changeset 삭제 이력 복원 방식의 main 승격 게이트 모두 PASS. 다음 단계는 dev PR CI 검토다.

## 2026-10-29 최종 준비 갱신

- 기존 준비 PR #2095는 06:41 UTC에 dev로 머지됐다. 해당 PR CI 40826372452의 Gates/API/Web 모두 성공했다.
- 이후 #2096이 추가되어 현재 dev는 `14d809045a3db5c5b44ec3b2fc17018688733097`이다. 해당 SHA CI 40839015755와 alpha 40839015809 모두 성공. 기존 #2095 직후 실패한 실행은 이 최신 성공 실행과 구분한다.
- 10:46 UTC 공개 alpha는 `1.12.1-alpha.20261029.g14d809045a3d`, 동일 dev SHA, API DB health=true. production은 `1.11.10` / `852290b7f01a8e25bc842b1d19fe99467f174037`이다.
- #2096의 미소비 Changeset 1개 때문에 앞선 1.12.0 준비만으로 현재 dev를 승격할 수 없다. 격리 worktree `_worktrees/release-finish-20261029`, branch `chore/release-finish-20261029`에서 정본 `--prepare-only`를 실행했다. API/Web 1.12.1, 양쪽 changelog 갱신, Changeset 소비, main 승격 게이트 PASS. 기능/DB/배포 소스 변경 없음.
- Owned: 릴리스 메타데이터 5개 경로와 기존 task/readiness 문서. 공유 루트 WIP는 그대로 유지. 사용자 후속 지시로 이 후보의 커밋·dev PR 게시·CI 후 dev 머지 및 alpha 검증을 진행한다. 사용자가 별도 리뷰는 생략하도록 승인했다. CI와 main 사용자 전용 단계는 유지한다.
- 다음: 이 후보를 dev 대상 준비 PR로 전달 → 새 dev SHA CI/alpha 성공과 공개 SHA/DB/버전 재확인 → 미소비 Changeset 0 확인 및 승격 게이트 재실행 → 사용자가 main 승격 PR 개설/머지 및 production 승인.
- 사용자용 비교 링크: https://github.com/kim-song-jun/matchup-sports-platform/compare/main...dev?expand=1 . 새 준비 PR 검증 전에는 최종 승인 준비 완료로 판정하지 않는다.
- production flexible-bracket 활성 범위 결정과 기존 문서의 수동 QA 잔여 사항은 계속 남는다. 이번 작업은 새 기능 QA를 대체하지 않는다.
## 2026-10-29 main PR #2098 / CodeQL gate remediation

- User explicitly requested main execution after the change briefing, overriding the earlier preparation-only boundary for this promotion. Production environment approval remains gated; no bypass is authorized. Separate review was waived, not CI/security checks.
- #2097 merged dev 0af2e109a; exact-head PR/dev CI and alpha attempt 2 passed, public alpha SHA matched and DB health=true. Main promotion PR #2098 remains OPEN and unmerged.
- Main PR API/Web/Gates CI 40879939606 passed. CodeQL aggregate check 123469009424 failed with 2 high + 1 medium findings: modulo-based bracket shuffle, partial regex escaping in a UI test, and generated test-code interpolation. No main/prod write occurred.
- Remediation owned paths: flexible-bracket-wizard.tsx, new lib/random-index.ts and its regression test, recorded-event-list.test.tsx, test/config/jest-discovery.contract.spec.ts, release metadata and this task. Forbidden: unrelated shared WIP, DB/schema changes, feature flags, check dismissal or approval bypass.
- Replace modulo shuffle with masked rejection sampling; use literal text matching instead of regex construction; keep generated worker source static and pass the receipt through Jest globals. Retain actual worker recycling and PID assertions.
- Acceptance: targeted tests green, fresh dev PR CI and CodeQL green, release metadata consumed, alpha matches resulting dev, and revalidated main PR checks before merge.
- Progress: local fixes prepared on fix/main-codeql-2098. Next: narrow validation and publish dev remediation PR. Security findings are not waived by the separate-review waiver.
- Local validation PASS: frontend 3 files / 43 tests (random rejection, wizard, recorded event list); actual backend worker-recycling contract 1 test (10 unrelated cases intentionally excluded); frontend lint/typecheck PASS. No visual layout or API/DB contract changes. Touched source debt-marker grep clean.
