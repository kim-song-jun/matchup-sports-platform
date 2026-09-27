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

- **완료된 태스크만** `git mv`로 여기로 옮긴다. 파일명은 그대로 유지(이력 보존, 번호로 역참조 가능).
- 완료 판정 기준: ① `Status:` 줄이 Done/Completed/Merged/Complete/완료 계열이고 진행형·대기 표현이
  섞여 있지 않을 때, 또는 ② v1(`apps/v1_api`/`apps/v1_web`) 이전 시대 문서로 legacy(`apps/api`/
  `apps/web`)만 참조하고 v1 참조가 전혀 없을 때(레거시 자체가 종료돼 사실상 완료 처리된 것으로 간주).
- 이동 시 그 문서를 인용하던 다른 모든 추적 파일(다른 태스크 문서 포함)의 경로를 같은 커밋에서
  `.github/tasks/archive/...`로 고친다.
- 진행 중·계획·검증 대기·판정 불가 문서는 archive 대상이 아니다 — 최상위에 남긴다.

## 현재 진행 중(archive 아님) 표기가 있는 주요 문서

`Status:`가 in_progress/pending/draft/blocked 계열이거나 Status 줄 자체가 없는 태스크 전부가
여기 속한다. 대표: `168-competition-phase3-full-flow-verification.md`, `122-alpha-profile-*.md`,
`123-admin-owner-access-invariant.md`, `144~146-tournament-lineup-*.md`(구현 완료·검증 대기),
`next-session-plan-72-onward.md`(Status: Roadmap — 사용자 확인 대기). 전체 목록은
`grep -l 'Status:' .github/tasks/*.md`로 직접 확인한다.
