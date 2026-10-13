# MD-QA #138 모바일 리그 템플릿·구조 편집

Status: In Progress

## Context
기존 리포트 https://teameet.jmandu.kr/issues/138/ 의 모바일 첫 진입에서 템플릿·구조 편집 출구가 사라지는 증상을 현재 v1 코드와 대조한다. root가 김성준 담당·확인 중을 실제 UI에서 확인했다.

## Goal
사용자가 선택한 A: 기존 템플릿·상세 편집을 모바일에서도 열고 목록형 구조 편집을 보완한다. 완료·결과 경기 보호와 실제 저장 계약을 유지한다.

## Original Conditions
- [x] 2026-10-13 직접 사용자 A 선택
- [x] 관리형 전용 워크트리와 feature branch, 최신 origin/dev 기준 9e3d596629ca350e5a12ac38a06ab42fff14713f
- [ ] 실제 첫 모바일 진입 결함을 좁은 실패 테스트로 확인
- [ ] 수정·검증·독립 적대적 리뷰·dev PR·기존 리포트 댓글

## User Scenarios
리그 관리자가 390px 화면으로 처음 진입하여 템플릿을 열거나 기존 미시작 경기 구조·상세를 편집한다. 결과가 있는 경기와 완료된 리그에서는 기존 보호와 오류 안내를 유지한다.

## Test Scenarios
- Happy: 초기 모바일 렌더에서 실제 템플릿·경기 상세 편집 버튼을 통해 기존 저장 경로에 도달한다.
- Edge: 넓은 화면으로 시작하지 않아도 모바일 기능이 작동하며 390/768/1440 전환에서 맥락을 유지한다.
- Error: 완료·결과·권한 제한과 실패 응답을 성공처럼 숨기지 않는다.
- Mock: 좁은 컴포넌트 회귀에서 실제 consumer/콜백 계약을 사용한다. alpha 실측은 배포 SHA 확인 후 별도다.

## Parallel Work Breakdown
Phase A 단일 frontend owner: bracket-canvas-mobile 및 실제 league fixtures consumer, 직접 관련 테스트·fixture만. hooks/use-v1-api.ts, types/api.ts, shared MSW, API/DTO/schema, 다른 버그 worktree, Git mutation, 정책 문서는 Forbidden. root가 task·Changeset·통합·Git·직렬 테스트·브라우저를 소유한다. Phase B 독립 reviewer는 읽기 전용으로 적대적 반례와 실제 도달성·보호 경계를 검토한다.

## Acceptance Criteria
- 초기 좁은 viewport에서 템플릿과 구조/상세 편집에 도달하고 노출한 액션은 실제 저장 경로를 사용한다.
- 기존 완료/결과/권한 gate와 데스크톱 동작을 보존한다.
- 실제 RED→GREEN, committed diff/typecheck, 최신 head 독립 FindingsNone과 PR base dev를 확인한다.
- 실제 alpha screenshot/console/network/viewport verdict를 기록하기 전 시각 QA 완료로 표시하지 않는다.

## Tech-Debt Resolved
조사 중. 기존 모바일 dead-end 안내를 실제 편집 출구와 정합하게 바꾼다.

## Security Notes
관리자·리그·경기 상태 권한을 넓히지 않는다. 비밀/실제 개인정보를 읽거나 출력하지 않는다.

## Risks & Dependencies
#137의 이미 머지된 타이밍/경기 수 설정을 중복 구현하지 않는다. shared 계약 변경 필요 시 root와 단일 소유자를 먼저 고정한다. alpha 배포·로그인·실제 권한은 독립 게이트다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | user | 모바일 편집 방식 | A: 기존 템플릿/상세 + 목록 구조 편집 |

## Progress Snapshot
- 2026-10-13 root: 관리형 생성/등록 완료, feature branch 준비. Phase A 회귀 준비 중; 새 테스트·PR·alpha는 NOT RUN.
