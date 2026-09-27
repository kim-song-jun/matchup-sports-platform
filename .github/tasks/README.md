# .github/tasks/ — 태스크 문서 규칙

- 파일명: `{N}-{task-name}.md`. 번호는 순차 부여되지만 유일하지 않을 수 있다(예: `22-*.md`가 두 개 —
  같은 번호를 먼저 소진한 뒤 뒤늦게 다른 문서가 재사용한 사례). 새 태스크는 `ls .github/tasks/ | grep
  -oE '^[0-9]+' | sort -n | tail -1`로 최신 번호를 확인하고 그다음 번호를 쓴다.
- 필수 섹션 템플릿: 루트 `CLAUDE.md`의 "Structured Task Documents" 원칙 7 참조
  (Context / Goal / Original Conditions / User Scenarios / Test Scenarios / Parallel Work
  Breakdown / Acceptance Criteria / Tech Debt Resolved / Security Notes / Risks & Dependencies /
  Ambiguity Log).
- **Status 표기**: 문서 상단에 `Status: <값>` 한 줄을 남긴다(`Done`/`Completed`/`Merged`/`완료`
  계열이면 완료로 판정됨). 표기가 없거나 모호하면(진행 중·계획·검증 대기 등) 최상위에 남는다 —
  archive 판정은 파일명이 아니라 이 줄을 기준으로 한다.

## archive/ 규칙

- **완료됐거나, 더는 능동적으로 참조되지 않는 태스크만** `git mv`로 여기로 옮긴다. 파일명은 그대로
  유지(이력 보존, 번호로 역참조 가능). "진행 중만 최상위" 원칙(2026-09-27 사용자 확정) — 최상위는
  현재 살아 있는 작업만 남기고, 나머지는 archive다.
- 판정 신호(순서대로 확인, 하나라도 해당하면 archive):
  1. **v0 레거시**: 본문이 `apps/api`/`apps/web`(레거시, PR #1313에서 삭제)만 참조하고
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
