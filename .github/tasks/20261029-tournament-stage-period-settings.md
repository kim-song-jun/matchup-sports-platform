# Task 20261029: 대회 단계별 경기 시간 설정

Status: Review
**Owner**: Codex
**Created**: 2026-10-28

## Context

현재 대회는 하나의 피리어드 설정만 가지므로 조별리그 단판 15분과 결승 전·후반 각 10분을 미리 함께 저장할 수 없다. 운영 중 설정을 바꾸는 우회 절차는 시작 전 조별 경기까지 함께 바꿀 위험이 있다.

## Goal

대회 기본 경기 시간과 단계별 재정의를 생성 시점에 저장하고, 생성 후에도 단계별로 수정하되 시작한 경기의 고정 설정은 보존한다.

## Original Conditions (must all be satisfied)

- [x] 대회 생성 시 기본 경기 시간과 단계별 경기 시간을 미리 지정할 수 있다.
- [x] 단계별 값을 지정하지 않으면 대회 기본값을 상속한다.
- [x] 생성 후 기본값과 단계별 값을 각각 수동으로 바꿀 수 있다.
- [x] 단계별 변경은 해당 단계의 시작 전 경기와 이후 새 경기만 바꾼다.
- [x] 시작했거나 종료된 경기는 생성 당시 설정을 유지한다.
- [x] 기존 대회는 별도 마이그레이션 입력 없이 기존 기본 설정으로 동작한다.

## User Scenarios

### Scenario 1: 조별과 결승 시간을 미리 분리

As a 플랫폼 관리자, I want to 조별리그를 단판 15분, 결승을 전·후반 각 10분으로 저장 so that 운영 중 설정을 바꾸지 않아도 각 경기 단계가 올바른 시간을 사용한다.

Expected result: 조별 경기에는 조별 재정의가, 결승에는 결승 재정의가, 나머지 단계에는 기본값이 고정된다.

### Scenario 2: 대회 진행 중 결승 시간만 수정

As a 플랫폼 관리자, I want to 결승 설정만 수정 so that 이미 시작한 경기와 다른 단계의 경기에는 영향이 없다.

Expected result: 시작 전 결승 경기와 이후 생성되는 결승 경기만 새 버전으로 이동한다.

## Test Scenarios

### Happy path
- [x] 단계 재정의 저장·조회·기본값 상속
- [x] 템플릿/수동 생성 경기가 단계별 설정 버전을 고정
- [x] 단계 설정 변경 시 해당 단계의 시작 전 경기만 이동

### Edge cases
- [x] 단계 재정의 삭제 시 시작 전 경기만 기본값으로 복귀
- [x] 기본값 변경 시 명시적 단계 재정의를 덮어쓰지 않음
- [x] 시작·결과가 있는 경기는 기존 버전 유지
- [x] 종목 변경(대진 0개일 때만) 시 이전 종목 규칙을 가리키는 단계 재정의를 함께 삭제
- [x] 생성 마법사에서 경기 시간 저장이 일부만 성공해도 재시도가 올라간 버전으로 이어짐
- [x] 대회 정보의 단계 저장이 다른 설정 변경으로 인한 버전 충돌을 한 번 재시도

### Error paths
- [x] 정규 리그에서 단계 재정의 요청 거절
- [x] 잘못된 단계·시간·낡은 expectedVersion 거절

### Mock data updates needed
- [x] API 단위 테스트의 Prisma mock에 단계 설정 모델 반영
- [x] Web hook/component 테스트 응답에 단계 재정의 반영

## Parallel Work Breakdown

### Backend (Frontend/Infra와 병렬 가능)
- [x] 단계별 설정 테이블·migration
- [x] 단계별 설정 조회/저장/상속 resolver
- [x] 모든 대회 경기 생성 경로에 resolver 연결

### Frontend (Backend와 병렬 가능)
- [x] A·B·C 논의 후 `기본값 + 필요한 단계만 추가` 방식 선택
- [x] 생성 마법사에서 선택 단계 재정의 입력·저장
- [x] 대회 정보에서 단계별 재정의 추가·수정·기본값 복귀

### Infra (Backend/Frontend와 병렬 가능)
- [x] changeset과 migration replay 대상 확인

### Sequential (병렬 작업 이후에 실행)
- [x] 좁은 API/Web 테스트와 타입 검사
- [ ] PR 생성 후 CI 확인
- [ ] 머지 후 alpha 390/768/1440 실측(별도 배포 단계)

## Acceptance Criteria

- [x] Original conditions 전부 충족
- [x] User scenarios 전부 통과
- [x] Test scenarios 전부 green
- [x] 범위 내 tech debt 해결됨
- [x] Security 리뷰 통과
- [x] Prisma migration·API/Web 계약·테스트 동기화
- [x] 디자인 시스템·접근성 기준 준수
- [x] Code review: Critical=0, Warning=0

## Tech Debt Resolved

- 운영자가 조별 마지막 킥오프 직후 전체 기본 설정을 바꿔야 했던 시간 의존 우회 절차를 제거한다.
- 경기 생성 호출부마다 설정 선택 규칙을 복사하지 않고 단계 resolver 하나로 통합한다.

## Security Notes

- 기존 관리자 인증 가드와 mutation admin 검사를 유지한다.
- 단계 설정 변경도 대회 행 잠금·CAS·감사 로그를 사용한다.
- 사용자가 보낸 tournamentId/phase로 다른 대회의 설정을 참조할 수 없도록 복합 유일키와 대회 범위 조회를 사용한다.

## Risks & Dependencies

- 스키마 변경이므로 main 승격 전에 migration deploy가 필요하다.
- UI 실측은 dev 머지와 alpha 배포 이후에만 가능하다.
- 개별 경기 피리어드 수정은 별도 기능이며 이 태스크 범위가 아니다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-28 | User | 생성 후에도 수동 변경 가능한가 | 기본값과 단계 재정의 모두 생성 후 수정 가능하게 유지 |
| 2026-10-28 | Codex | 어떤 단계를 지원할지 | 현재 정본 enum의 조별·64/32/16/12강·8강·4강·결승·3/4위전을 그대로 지원 |
