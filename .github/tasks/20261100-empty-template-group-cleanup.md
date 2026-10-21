# Task 20261100: 경기 삭제 뒤 템플릿 조 편성 정리
Status: Review
Created: 2026-10-21
## Context
운영 대회29387793-146b-4b6d-a946-c6c6a13cad64에서 템플릿 경기 전체 삭제 후 팀 미정으로 비운 자리의 조 편성이 남아 조 삭제 불가. 조회 결과 경기0/조5/자리24/조 편성14, A/B ENTRY 전부 미정인데 편성7팀 잔존. 운영 데이터는 조회만 함.
## Goal
기존 자리 비우기·조 삭제 흐름으로 경기 없는 템플릿 조를 안전하게 정리한다.
## Original Conditions
- [x] 경기0인 ENTRY 비우기가 조 편성/순위도 정리
- [x] 이미 비워진 자리의 고아 편성 및 미사용 빈 자리 때문에 조 삭제가 막히지 않음
- [x] 남은 경기/팀 배정/실제 참조 슬롯/수동 편성/권한 보호 유지
## User Scenarios
템플릿 생성→팀 배정→모든 경기 삭제→조별 팀 자리 편집에서 미정→조 삭제. 이미 미정인데 편성이 남은 기존 조도 삭제 가능.
## Test Scenarios
격리 PostgreSQL 실제 서비스 호출로 위 경로, 기존 고아 상태, 다른 조 결선 슬롯 참조 차단, 수동 편성 보호, support403, 실패 중간 롤백 검증.
## Parallel Work Breakdown
단독 순차 작업. Owned: slot service, bracket tx, 관련 직접 회귀/통합 테스트 및 API/task 문서. Forbidden: 원본 공유 WIP, 운영 DB 쓰기, main push/merge, unrelated 화면 재설계.
## Acceptance Criteria
- [x] RED→GREEN 및 기존 관련 회귀 통과
- [x] API 문서 동기화, schema/migration 불필요 확인
- [x] 실제 검증 범위/배포 상태/운영 데이터 미변경 기록
## Tech Debt Resolved
연결 경기를 통해서만 조 편성 해제를 찾던 의존성 및 삭제할 방법이 없는 빈 템플릿 자리 정리.
## Security Notes
기존 관리자 권한/대회 advisory lock/트랜잭션 유지. 실제 슬롯 팀 배정이나 다른 경기의 슬롯 참조가 있으면 삭제 금지.
## Risks & Dependencies
진행 중 실제 대회 데이터 변경은 별도 승인 없이 수행하지 않음. 생산 환경은 읽기만 확인.
## Ambiguity Log
사용자 제공 주소는 production. 버그 수정은 격리 worktree에서 진행, production 수동 정리/배포는 아직 수행하지 않음.
## Progress Snapshot
Base origin/dev d09eaeb3d, /tmp/teameet-empty-group-fix. 원인 확인 완료, 회귀 테스트 작성 중.

## Validation / current handoff
- 실제 production 관리자 로그인으로 조회: 경기0/조5/자리24/조 편성14, A/B ENTRY 미정인데 편성7 잔존. 로그인/GET 외 데이터 mutation 없음. 소유 headed 브라우저 종료/PID 부재 확인.
- RED: 기존 코드에 실제 DB 테스트3개 중2개 실패(ENTRY 비우기 후 편성8팀 잔존, 고아 편성 조 삭제409), 보호 시나리오1개 통과.
- GREEN: 템플릿/슬롯/신규 DB3 suites67 PASS. 이후 잔여 통합 순위 정리/실패 롤백/경기0 조 교환을 추가해 최종 신규 DB5/5 PASS. 단위 관련2 suites223/223 PASS, API 전체 tsc exit0, diff check PASS.
- 추가 테스트 첫 실행의 swap fixture가 배정 전 slot.registrationId=null을 보관하던 문제를 실제 저장 상태 재조회로 수정함. 구현을 통과시키기 위해 기대값을 약화하지 않음.
- 임시 PostgreSQL localhost56440, migration 전체 재생 및 suite clone 격리. 테스트용 오류 trigger는 finally 제거, 클러스터/데이터 삭제 확인.
- 변경 모델: V1TournamentGroup/GroupTeam/Slot/Standing/OverallStanding, 보호 조회 V1TeamMatch. 스키마/migration 변경 없음. 참가 등록/선수 명단/기존 경기 결과 변경 없음.
- 최종 수정은 기존 API 동작만 보강하며 UI/layout 변경 없음. 실제 alpha 수정 버전 검증 및 dev/production 반영은 아직 하지 않음. 원본 공유 작업트리 WIP 보존.

## Hotfix authorization / CI follow-up
- 사용자가 이번 건을 hotfix로 main/production까지 반영하고 리뷰 없이 진행하라고 명시 승인. PR2019의 최신 Copilot clean 조건 예외 및 해당 hotfix main 승격/정상 production 승인 범위로 기록. CI 실패나 실제 보안 finding 무시는 포함하지 않음.
- PR2019 head30ec85d, CI39559144963: Gates/Web PASS, API integration175 suites 중174 PASS; 1294개 중1289 PASS/3 skip/2 FAIL. 실패2개는 기존 tournament-bracket-tx의 미사용 빈 슬롯도 항상 삭제 금지 기대값. 새 미사용 슬롯 정리 계약과 충돌하므로 실제 경기 참조 차단/ENTRY 실제 팀 배정 차단을 보존하는 시나리오로 갱신.
- Changesets CLI2.30.0으로 별도 릴리스 브랜치에 양 앱 source1.11.2/예상 artifact1.11.3 준비. 버전 준비/승격 정책 PASS. API runtime 바이트는 수정 PR과 동일하게 유지.
- CI 지적된 기존 대진 Tx + 신규 빈 조 정리 DB2 suites17/17 PASS. 빈 미사용 자리 삭제와 실제 ENTRY 배정/결선 경기 참조 차단을 구분해 확인. 수정된 것은 기존 통합 테스트와 이 기록이며 runtime 구현은30ec85d와 동일. 임시 DB 정리 완료.
