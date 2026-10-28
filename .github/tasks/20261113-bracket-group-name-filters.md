# 결선 조 이름 및 대진 하위 필터

Status: Review
Owner: Codex

## Context
대상 대회 93a11ead-52ca-4262-bede-66802587c3d8에서 진행 단계는 경기 round를, 대진표는 phase의 고정 이름을 사용해 이름이 달랐다.
## Goal
결선 조 이름을 진행 단계·대진 제목·이동 버튼·선택 필터에 일관되게 표시한다.
## Original Conditions
- [x] 사용자가 결선 조 이름 사용을 확정했다.
- [x] 조별리그 하단에 전체 및 개별 조 선택을 제공한다.
- [x] 결선 하단에 전체 및 모든 결선 단계(3·4위전 포함) 선택을 제공한다.
## User Scenarios
조별리그에서 B조 선택 시 B조만 보고 전체로 복원한다. 결선에서 준결승·결승·순위전을 개별 선택한다.
## Test Scenarios
관련 그룹핑·진행 단계·페이지 렌더 테스트를 단일 worker로 실행한다. 조 재사용 시 결승을 준결승으로 잘못 표시하지 않는다.
## Parallel Work Breakdown
단일 에이전트. Owned: v1_web 대진 페이지·대진 컴포넌트·관련 테스트·이 문서·changeset. Forbidden: API/DB 및 공유 작업트리 WIP.
## Acceptance Criteria
- [x] 관련 테스트 통과: 그룹핑 17 + 페이지 렌더 48 + 진행 단계 19 = 84
- [ ] alpha 배포 후 화면·console/network·390/768/1440 확인
## Tech Debt Resolved
진행 단계와 대진표가 서로 다른 라운드 명칭을 계산하던 중복을 제거한다.
## Security Notes
읽기 전용 UI 선택. 권한·API·저장 데이터 변경 없음.
## Risks & Dependencies
별도 worktree: _worktrees/bracket-group-labels, branch fix/bracket-group-labels. alpha 시각 검증은 배포 전 미검증이다.
## Ambiguity Log
조별리그 상단 명칭은 유지한다. 같은 phase의 여러 조 이름은 ·로 연결하고 조가 없으면 기존 라운드명을 사용한다. 식별자는 이름과 분리해 유지한다.
## Progress Snapshot
origin/dev 745eb4e35에서 시작. 구현 및 관련 84개 테스트 통과. dev 대상 PR 제출 준비, 배포 없음.

검증: WSL Ubuntu에서 `node node_modules/vitest/vitest.mjs run src/components/tournaments/tournament-bracket.test.ts src/components/tournaments/tournament-progress-stepper.test.ts src/app/tournaments/\[id\]/bracket/bracket-page-client.test.tsx --maxWorkers=1 --no-file-parallelism --no-isolate` 실행, 3 files / 84 tests PASS.
공유 설치에 누락된 validator는 작업트리 전용 ignored node_modules 링크로 기존 pnpm store를 참조했다. 공유 설치·tracked 설정은 변경하지 않았다.
`git diff --check` 통과, touched source/test에서 새 TODO/FIXME/HACK/XXX 없음. 테스트 프로세스 정상 종료.
PR 제출 전 `tsc --noEmit --incremental false`와 `node scripts/v1-pattern-check.mjs` 통과. 타입 검사에서 새 테스트 fixture의 필수 id/status 누락을 보완하고, 작업트리 전용 @types/validator 링크를 추가했다. 결선 전체 보기의 기존 단계 이동 버튼과 새 필터는 모두 유지한다(각각 스크롤 이동/표시 필터링). 통합·삭제는 이번 PR에 포함하지 않는다.
alpha 390/768/1440 스크린샷·console/network는 변경이 배포되지 않아 미검증이다. 브라우저나 로컬 web 서버는 실행하지 않았다.
