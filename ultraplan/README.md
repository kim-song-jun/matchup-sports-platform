# UI/UX Ultraplan

이 폴더는 MatchUp 저장소의 repo-wide UI/UX audit와 design-system buildout을 운영하는 workspace다.

규칙 자체를 새로 정의하지 않는다. 기존 canonical source는 그대로 유지한다.

## Canonical Sources

- 디자인 규칙: [DESIGN.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/DESIGN.md)
- 현재 상태: [docs/DESIGN_SYSTEM_REFERENCE.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/docs/DESIGN_SYSTEM_REFERENCE.md)
- visual coverage master: [.github/tasks/54-unified-visual-audit-coverage-master.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/.github/tasks/54-unified-visual-audit-coverage-master.md)
- remediation master: [.github/tasks/58-design-system-audit.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/.github/tasks/58-design-system-audit.md)
- orchestration task: [.github/tasks/60-ultraplan-ui-ux-audit-orchestration.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/.github/tasks/60-ultraplan-ui-ux-audit-orchestration.md)

## Current Baseline

- design-system compliance: 약 `55%`
- canonical visual routes: `92`
- canonical viewports: `9`
- current component catalog helper entries: `12`
- current asset representative render targets: `4`
- existing broad visual audit artifact는 일부 재사용 가치가 있다

## Folder Map

- [01-program.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/ultraplan/01-program.md)
  - 전체 프로그램 구조, 단계, 품질 게이트, 우선순위
- [02-screenshot-matrix.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/ultraplan/02-screenshot-matrix.md)
  - batch/lane/viewport/state 실행 구조
- [coverage-ledger.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/ultraplan/coverage-ledger.md)
  - 기존 증거 재사용 여부와 재촬영 범위 기록
- [run-ledger.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/ultraplan/run-ledger.md)
  - run-id별 실행 이력과 결과 기록
- [templates/bug-report.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/ultraplan/templates/bug-report.md)
  - broken flow 발견 시 즉시 작성할 버그 리포트 템플릿
- [templates/page-review.md](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/ultraplan/templates/page-review.md)
  - page/module별 strengths/weaknesses 평가 템플릿
- `bugs/`
  - stop gate로 승격된 버그 리포트
- `qc/`
  - batch/band별 검수 결과
- `reports/`
  - family별 최종 평가 보고서
- `runs/`
  - lane 운영 메모와 run-level handoff
- `remediation/`
  - Task 58 handoff 메모

## Operating Principles

1. raw screenshot와 console/network artifact는 계속 `output/playwright/visual-audit/<run-id>/`를 사용한다.
2. `ultraplan/`에는 판정, 계획, 요약, 버그, handoff만 남긴다.
3. shared dev stack에는 broad parallel capture를 걸지 않는다.
4. 병렬 실행이 필요하면 isolated runner를 쓴다.
5. primitive default hardening 없이 adoption을 넓히지 않는다.
6. broken flow는 디자인 이슈로 덮지 않고 bug report로 분기한다.
