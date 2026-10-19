# Task 20261092: 대진표 표시 정리

Status: Review
Owner: Codex
Created: 2026-10-19

## Context
사용자가 사용자·어드민 대진표의 여섯 가지 표시 변경을 확정하고 dev PR을 요청했다.
## Goal
조별 순위에서 내 팀 조를 쉽게 찾고, 배정된 팀과 경기 결과를 간결하게 표시한다.
## Original Conditions
- [x] 조 이름 옆 진출 인원/대기 안내 제거
- [x] 소속 팀 조 우선 정렬 및 빨간 안내 문구
- [x] 사용자·어드민 그림 경기장 표시 제거
- [x] 팀 배정 후 설정 문구 숨김
- [x] 시간·PK 한 줄 및 회색 배경
- [x] 배정된 부전승 승자 배경
## User Scenarios
로그인 사용자는 자신의 팀이 있는 조를 먼저 본다. 여러 소속 조는 기존 순서를 유지한다.
미로그인/해당 팀 없음은 기존 순서를 유지한다. 미배정 자리에는 설정 문구가 남는다.
## Test Scenarios
- 조별 진행/완료 상태에서 제거 문구가 없는지 확인
- 로그인/비로그인 조 정렬 및 안내 렌더 검증
- 경기장 비노출, 부전승 배정 전후 문구와 배경 검증
- 사용자·어드민 관련 렌더 테스트, 타입 검사
- dev 머지 후 alpha 390/768/1440에서 시간·PK 줄바꿈과 잘림, 콘솔·네트워크 확인
## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: v1_web 대진표/관련 테스트/changeset/이 문서. Forbidden: API/DB/다른 작업트리.
## Acceptance Criteria
위 여섯 조건의 회귀 검증과 dev 대상 PR 생성. 시각 검증은 alpha 배포 이후 수행한다.
## Tech Debt Resolved
부전승 별도 렌더 경로의 중복 라벨 및 강조 불일치, 카드 배지 줄바꿈 정리.
## Security Notes
기존 세션 힌트가 있는 경우에만 내 팀 API 조회. 권한/저장 계약 변경 없음.
## Risks & Dependencies
alpha는 dev 머지 후 변경을 반영하므로 PR 단계에서는 브라우저 완료 판정을 하지 않는다.
## Ambiguity Log
사용자 확정 1~6안을 그대로 구현. 경기장 편집 데이터는 유지하며 그림 카드 표시만 제거.
빠른 입력 상세 문구는 공간 확보를 위해 접근 가능한 설명 아이콘으로 표시.
## Progress Snapshot
- Baseline: origin/dev 7a17ec825
- 구현 완료. 타입 검사 및 패턴 검사 통과.
- 어드민 그림 39개 + 공개 대진표 20개 테스트 통과. 사용자 순위/모바일 테스트 진행 중.
- dev PR 생성 후 CI/Copilot 리뷰 확인. alpha 시각 검증은 머지 후 남음.
